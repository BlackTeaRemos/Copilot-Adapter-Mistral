import { Mistral } from '@mistralai/mistralai';
import type { CompletionEvent } from '@mistralai/mistralai/models/components';
import { type Tiktoken, getEncoding } from 'js-tiktoken';
import {
    CancellationToken,
    Event,
    EventEmitter,
    ExtensionContext,
    LanguageModelChatInformation,
    LanguageModelChatMessage,
    LanguageModelChatProvider,
    LanguageModelChatToolMode,
    LanguageModelDataPart,
    LanguageModelResponsePart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
    LogOutputChannel,
    Progress,
    ProvideLanguageModelChatResponseOptions,
    StatusBarItem,
} from 'vscode';

export type { MistralModel, MistralContent, MistralToolCall, MistralMessage } from './types.js';
export { formatModelName, getChatModelInfo, toMistralRole } from './conversion/index.js';

import type { MistralModel, UsageStats, ToolCallIdMap } from './types.js';
import { DEFAULT_COMPLETION_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS } from './types.js';
import { getChatModelInfo, createToolCallIdMap, toMistralMessages } from './conversion/index.js';
import { fetchModels, streamChatCompletion } from './client/index.js';
import {
    createContentDeltaState,
    flushContentDeltaState,
    createToolCallState,
    processStreamEvent,
} from './stream/index.js';
import type { StreamContext } from './stream/index.js';
import { assertChatStreamRequest, toModelOptions, getNumberOption, getBooleanOption } from './assertions/index.js';
import { TokenizerCalibration } from './cacheCalibration.js';
import { getMistralTokenizer } from './tokenizer/mistralTokenizer.js';
import { computePromptCacheKey } from './promptCacheKey.js';
import { setApiKey, signInWithBrowser, initClient, type AuthDeps } from './auth/index.js';
import { updateStatusBar } from './statusBar.js';
import { ModelCache } from './client/modelCache.js';
import { MistralChatStatus } from './_future_/chatStatusItem.js';
import { readModelConfiguration } from './_future_/proposedModelData.js';
import { workspace } from 'vscode';

const DEFAULT_MODEL_FALLBACK = `mistral-large-latest`;

const UTILITY_INITIATOR_PREFIXES = [ `vscode.chat-title`, `vscode.chat-summary`, `vscode.editor`, `github.copilot.editsAgent.summary` ];

function isInteractiveInitiator ( initiator: string | undefined ): boolean {
    if ( !initiator ) {
        return false;
    }
    if ( UTILITY_INITIATOR_PREFIXES.some( p => {
        return initiator.startsWith( p );
    } ) ) {
        return false;
    }
    return true;
}

function pickDefaultModelId ( models: MistralModel[] ): string {
    if ( models.length === 0 ) {
        return ``;
    }
    const configured = workspace.getConfiguration( `mistral` ).get<string>( `defaultModel` ) ?? ``;
    if ( configured && models.some( m => {
        return m.id === configured;
    } ) ) {
        return configured;
    }
    if ( models.some( m => {
        return m.id === DEFAULT_MODEL_FALLBACK;
    } ) ) {
        return DEFAULT_MODEL_FALLBACK;
    }
    return models[ 0 ].id;
}

function extractText ( part: unknown ): string {
    if ( part instanceof LanguageModelTextPart ) {
        return part.value;
    }
    if ( part instanceof LanguageModelToolCallPart ) {
        return part.name + JSON.stringify( part.input );
    }
    if ( part instanceof LanguageModelToolResultPart ) {
        return part.content
            .filter( p => {
                return p instanceof LanguageModelTextPart;
            } )
            .map( p => {
                return ( p as LanguageModelTextPart ).value;
            } )
            .join( `` );
    }
    return ``;
}

export class MistralChatModelProvider implements LanguageModelChatProvider {
    private client: Mistral | null = null;
    private tokenizer: Tiktoken | null = null;
    private fetchedModels: MistralModel[] | null = null;
    private modelCacheTimestamp: number = 0;
    private modelCache!: ModelCache;
    private chatStatus!: MistralChatStatus;
    private seededFromCache: boolean = false;
    private backgroundRefreshStarted: boolean = false;
    private lastInfoSignature: string = ``;
    private static readonly MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
    private initPromise?: Promise<boolean>;
    private tokensUsedThisSession: UsageStats = { input: 0, output: 0, cached: 0, lastPrompt: 0 };
    private lastModelName: string = ``;
    private lastModelId: string = ``;
    private calibration!: TokenizerCalibration;
    private toolCallIdMap: ToolCallIdMap = createToolCallIdMap();
    private readonly log: LogOutputChannel;
    private readonly _onDidChangeLanguageModelChatInformation = new EventEmitter<void>();

    readonly onDidChangeLanguageModelChatInformation: Event<void> = this._onDidChangeLanguageModelChatInformation.event;

    isAuthenticated (): boolean {
        return this.client !== null;
    }

    refreshStatusBar (): void {
        if ( !this.statusBarItem ) {
            return;
        }
        if ( !this.isAuthenticated() ) {
            updateStatusBar( this.statusBarItem, { input: 0, output: 0, cached: 0, lastPrompt: 0 }, ``, ``, this.calibration, false );
        }
    }

    get currentModelName (): string {
        return this.lastModelName;
    }

    constructor (
        private readonly context: ExtensionContext,
        logOutputChannel?: LogOutputChannel,
        autoInit: boolean = false,
        private readonly statusBarItem?: StatusBarItem,
    ) {
        this.log = logOutputChannel ?? {
            info: () => { }, debug: () => { }, warn: () => { }, error: () => { },
            trace: () => { }, appendLine: () => { }, dispose: () => { },
        } as unknown as LogOutputChannel;
        this.calibration = new TokenizerCalibration( context );
        this.modelCache = new ModelCache( context, this.log );
        this.chatStatus = new MistralChatStatus( this.log );
        this.log.info( `[Mistral] Provider constructed` );
        if ( autoInit ) {
            this.log.info( `[Mistral] Auto-initializing client on activation` );
            this.initPromise = this.callInitClient( true );
        }
    }

    private authDeps (): AuthDeps {
        return {
            context: this.context,
            log: this.log,
            getClient: () => {
                return this.client;
            },
            setClient: c => {
                this.client = c;
            },
            invalidateModelCache: () => {
                this.fetchedModels = null;
                this.modelCacheTimestamp = 0;
                this.seededFromCache = false;
                this.backgroundRefreshStarted = false;
                void this.modelCache.clear();
            },
            fireModelInfoChange: () => {
                this._onDidChangeLanguageModelChatInformation.fire( undefined );
            },
        };
    }

    private callInitClient ( silent: boolean ): Promise<boolean> {
        return initClient( silent, this.authDeps() );
    }

    public setApiKey (): Promise<string | undefined> {
        return setApiKey( this.authDeps() );
    }

    public signInWithBrowser (): Promise<string | undefined> {
        return signInWithBrowser( this.authDeps() );
    }

    private seedFromCache (): MistralModel[] | null {
        if ( this.seededFromCache ) {
            return this.fetchedModels;
        }
        this.seededFromCache = true;
        const cached = this.modelCache.load();
        if ( cached ) {
            this.fetchedModels = cached;
        }
        return cached;
    }

    public async fetchModels (): Promise<MistralModel[]> {
        const now = Date.now();
        if ( this.fetchedModels !== null && now - this.modelCacheTimestamp < MistralChatModelProvider.MODEL_CACHE_TTL_MS ) {
            return this.fetchedModels;
        }
        if ( !this.client ) {
            return this.fetchedModels ?? [];
        }
        const fresh = await fetchModels( this.client, this.log );
        if ( fresh.length === 0 && this.fetchedModels ) {
            this.log.warn( `[Mistral] API returned no models; keeping ${ this.fetchedModels.length } cached` );
            return this.fetchedModels;
        }
        this.fetchedModels = fresh;
        this.modelCacheTimestamp = now;
        await this.modelCache.save( fresh );
        this.log.info( `[Mistral][probe] models refreshed-from-api (n=${ fresh.length })` );
        this.log.debug( `[Mistral] Fetched models: ` + JSON.stringify( this.fetchedModels, null, 2 ) );
        return this.fetchedModels;
    }

    async provideLanguageModelChatInformation (
        options: { silent: boolean; },
        token: CancellationToken,
    ): Promise<LanguageModelChatInformation[]> {
        this.log.trace( `[Mistral] provideLanguageModelChatInformation called (silent=` + options.silent + `)` );
        if ( token.isCancellationRequested ) {
            return [];
        }

        const seeded = this.seedFromCache();
        if ( seeded && seeded.length > 0 && this.modelCacheTimestamp === 0 ) {
            if ( !this.backgroundRefreshStarted ) {
                this.backgroundRefreshStarted = true;
                this.log.info( `[Mistral] returning ${ seeded.length } cached models while refreshing` );
                void this.refreshModelsInBackground();
            }
            return this.toModelInfos( seeded );
        }

        if ( this.initPromise ) {
            try {
                await this.initPromise;
            } catch { }
            this.initPromise = undefined;
        }
        if ( token.isCancellationRequested ) {
            return [];
        }

        const initialized = await this.callInitClient( options.silent );
        if ( !initialized ) {
            const known = this.fetchedModels ?? this.seedFromCache();
            if ( known && known.length > 0 ) {
                this.log.warn( `[Mistral] client not initialized - keeping ${ known.length } known models in picker to avoid fallback to another vendor` );
                return this.toModelInfos( known );
            }
            this.log.warn( `[Mistral] client not initialized and no known models - picker will be empty` );
            return [];
        }
        if ( token.isCancellationRequested ) {
            return [];
        }

        const models = await this.fetchModels();
        this.log.trace( `[Mistral] Returning ` + models.length + ` models` );
        const infos = this.toModelInfos( models );
        this.log.trace( `[Mistral] Returning model info: ` + JSON.stringify( infos, null, 2 ) );
        return infos;
    }

    private toModelInfos ( models: MistralModel[] ): LanguageModelChatInformation[] {
        const defaultId = pickDefaultModelId( models );
        const signature = `${ defaultId }|${ models.length }`;
        if ( signature !== this.lastInfoSignature ) {
            this.lastInfoSignature = signature;
            this.log.info( `[Mistral][probe] default flag set model=${ defaultId || `<none>` } (of ${ models.length })` );
        }
        return models.map( model => {
            return getChatModelInfo( model, model.id === defaultId );
        } );
    }

    private async refreshModelsInBackground (): Promise<void> {
        try {
            if ( this.initPromise ) {
                try {
                    await this.initPromise;
                } catch { }
                this.initPromise = undefined;
            }
            const ok = await this.callInitClient( true );
            if ( !ok ) {
                return;
            }
            const before = this.fetchedModels?.length ?? 0;
            await this.fetchModels();
            const after = this.fetchedModels?.length ?? 0;
            this.log.info( `[Mistral] background model refresh complete (before=${ before } after=${ after })` );
            this._onDidChangeLanguageModelChatInformation.fire( undefined );
        } catch ( error ) {
            this.log.warn( `[Mistral] background model refresh failed: ` + String( error ) );
        }
    }

    async provideLanguageModelChatResponse (
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken,
    ): Promise<void> {
        this.log.info( `[Mistral] provideLanguageModelChatResponse start for model=${ model.id }, messages=${ messages.length }` );
        this.toolCallIdMap = createToolCallIdMap();

        if ( !this.client ) {
            this.log.warn( `[Mistral][probe] request for ${ model.id } answered locally (no client) - NOT forwarded to another vendor` );
            progress.report( new LanguageModelTextPart( `Mistral is selected but not signed in. Add your Mistral API key to continue - this request was not sent to any other model.` ) );
            return;
        }

        const models = await this.fetchModels();
        const foundModel: MistralModel = models.find( m => {
            return m.id === model.id;
        } ) ?? {
            id: model.id, name: model.name,
            maxInputTokens: model.maxInputTokens, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
            defaultCompletionTokens: DEFAULT_COMPLETION_TOKENS,
            toolCalling: true, supportsParallelToolCalls: false, supportsVision: false,
            supportsCompletionFim: false, completionChat: true,
        };

        const mistralMessages = toMistralMessages( messages, this.toolCallIdMap );
        const mistralTools = options.tools?.map( tool => {
            return {
                type: `function` as const,
                function: { name: tool.name, description: tool.description, parameters: tool.inputSchema || {} },
            };
        } );
        const shouldSendTools = mistralTools && mistralTools.length > 0;
        const toolChoice = shouldSendTools
            ? options.toolMode === LanguageModelChatToolMode.Required ? `any` : `auto`
            : undefined;
        const parallelToolCalls = shouldSendTools ? ( foundModel.supportsParallelToolCalls ?? false ) : undefined;
        const perModelConfig = readModelConfiguration( options );
        const modelOptions = { ...toModelOptions( options.modelOptions ), ...( perModelConfig ?? {} ) };
        if ( perModelConfig ) {
            this.log.info( `[Mistral][probe] per-model configuration applied keys=${ Object.keys( perModelConfig ).join( `,` ) }` );
        }
        const temperature = getNumberOption( modelOptions, `temperature` ) ?? foundModel.temperature ?? 0.7;
        const topP = getNumberOption( modelOptions, `topP` ) ?? foundModel.top_p;
        const safePrompt = getBooleanOption( modelOptions, `safePrompt` );
        const maxTokensOverride = getNumberOption( modelOptions, `maxTokens` );

        const abortController = new AbortController();
        const cancellationDisposable = typeof token.onCancellationRequested === `function`
            ? token.onCancellationRequested( () => {
                abortController.abort();
                this.log.info( `[Mistral] Request cancelled by user` );
            } )
            : undefined;

        try {
            if ( token.isCancellationRequested ) {
                abortController.abort();
            }

            const request = {
                model: model.id,
                messages: mistralMessages,
                maxTokens: Math.min( maxTokensOverride ?? foundModel.defaultCompletionTokens, foundModel.maxOutputTokens ),
                temperature, topP, safePrompt,
                promptCacheKey: computePromptCacheKey( model.id, mistralMessages ),
                tools: shouldSendTools && foundModel.toolCalling ? mistralTools : undefined,
                toolChoice: shouldSendTools && foundModel.toolCalling ? toolChoice : undefined,
                parallelToolCalls: shouldSendTools && foundModel.toolCalling ? parallelToolCalls : undefined,
            };
            assertChatStreamRequest( request );

            const initiator = ( options as unknown as { requestInitiator?: string } ).requestInitiator;
            const isInteractiveChat = isInteractiveInitiator( initiator );
            this.log.trace( `[Mistral] requestInitiator=${ initiator ?? `<undefined>` } interactive=${ isInteractiveChat }` );
            if ( isInteractiveChat ) {
                this.lastModelName = foundModel.name;
                this.lastModelId = model.id;
            }

            const stream = await streamChatCompletion( this.client, request, abortController.signal, this.log );
            const requestUsage: UsageStats = { input: 0, output: 0, cached: 0, lastPrompt: 0 };
            const ctx: StreamContext = {
                contentState: createContentDeltaState(),
                toolCallState: createToolCallState(),
                map: this.toolCallIdMap,
                usage: requestUsage,
            };

            for await ( const event of stream as AsyncIterable<CompletionEvent> ) {
                if ( token.isCancellationRequested ) {
                    break;
                }
                processStreamEvent( event, ctx, progress, this.log );
            }

            if ( !token.isCancellationRequested ) {
                flushContentDeltaState( ctx.contentState, this.log );
                const { input, output, cached, lastPrompt } = requestUsage;
                this.tokensUsedThisSession.input += input;
                this.tokensUsedThisSession.output += output;
                this.tokensUsedThisSession.cached += cached;
                this.tokensUsedThisSession.lastPrompt = lastPrompt;
                this.reportTokenUsage( progress, requestUsage );
                this.recordCalibration( model.id, lastPrompt, messages );
                this.logCacheHit( cached, lastPrompt, input, model.id );
                if ( ctx.truncated ) {
                    this.reportTruncationWarning( progress, foundModel );
                }
                this.logModelRedirect( ctx, model.id );
            }
            if ( this.statusBarItem ) {
                updateStatusBar( this.statusBarItem, this.tokensUsedThisSession, this.lastModelName, this.lastModelId, this.calibration, true );
            }
            if ( isInteractiveChat ) {
                this.chatStatus.update( requestUsage, ctx.servedModel ?? foundModel.name );
            }
            this.log.debug(
                `[Mistral] stream complete - model=${ ctx.servedModel ?? model.id } input=${ requestUsage.input } output=${ requestUsage.output } cached=${ requestUsage.cached }` +
                ( ctx.truncated ? ` TRUNCATED` : `` ),
            );
        } catch ( error ) {
            const errorMessage = error instanceof Error ? error.message : `Unknown error occurred`;
            this.log.error( `[Mistral] provideLanguageModelChatResponse error: ` + ( error instanceof Error ? error.stack || error.message : String( error ) ) );
            progress.report( new LanguageModelTextPart( `Error: ${ errorMessage }` ) );
        } finally {
            cancellationDisposable?.dispose();
        }
    }

    /**
     * Returns the active token encoder. Prefers the bundled native Mistral
     * (tekken) tokenizer - exact counts, no calibration needed - and falls back
     * to cl100k_base + the learned scale factor when the tekken assets are
     * unavailable.
     */
    private getEncoder (): { enc: Tiktoken; native: boolean; } {
        const native = getMistralTokenizer( this.context.extensionUri?.fsPath ?? `` );
        if ( native ) {
            return { enc: native, native: true };
        }
        if ( !this.tokenizer ) {
            this.tokenizer = getEncoding( `cl100k_base` );
        }
        return { enc: this.tokenizer, native: false };
    }

    async provideTokenCount (
        model: LanguageModelChatInformation,
        text: string | LanguageModelChatMessage,
        _token: CancellationToken,
    ): Promise<number> {
        const { enc, native } = this.getEncoder();
        const textContent = typeof text === `string`
            ? text
            : text.content.map( part => {
                return extractText( part );
            } ).join( `` );
        const raw = enc.encode( textContent ).length;
        if ( native ) {
            return raw;
        }
        const scale = this.calibration.scale( model.id );
        return scale !== undefined ? Math.round( raw * scale ) : raw;
    }

    private reportTokenUsage ( progress: Progress<LanguageModelResponsePart>, usage: UsageStats ): void {
        progress.report( new LanguageModelDataPart(
            new TextEncoder().encode( JSON.stringify( {
                prompt_tokens: usage.input, completion_tokens: usage.output,
                total_tokens: usage.input + usage.output,
                prompt_tokens_details: { cached_tokens: usage.cached },
            } ) ),
            `usage`,
        ) );
    }

    private recordCalibration ( modelId: string, lastPrompt: number, messages: Array<LanguageModelChatMessage> ): void {
        const { enc, native } = this.getEncoder();
        // Native tekken counts are exact, so no scale factor is needed.
        if ( native ) {
            return;
        }
        const requestTiktoken = messages
            .flatMap( m => {
                return m.content;
            } )
            .map( part => {
                return extractText( part );
            } )
            .reduce( ( sum, s ) => {
                return sum + enc.encode( s ).length;
            }, 0 );
        this.calibration.record( modelId, lastPrompt, requestTiktoken );
    }

    private logCacheHit ( cached: number, lastPrompt: number, input: number, modelId: string ): void {
        if ( cached > 0 ) {
            const denom = input > 0 ? input : lastPrompt;
            const pct = denom > 0 ? Math.round( ( cached / denom ) * 100 ) : 0;
            const saved = Math.round( cached * 0.9 );
            this.log.info(
                `[Mistral] prompt cache hit - cached=${ cached }/${ denom } prompt tokens (${ pct }%), ~${ saved } billed-token equivalent saved (calibration samples: ${ this.calibration.sampleCount( modelId ) })`,
            );
        }
    }

    private reportTruncationWarning ( progress: Progress<LanguageModelResponsePart>, foundModel: MistralModel ): void {
        progress.report( new LanguageModelTextPart(
            `\n\n⚠️ Response truncated - output hit the token limit (${ foundModel.defaultCompletionTokens } tokens). Consider increasing maxTokens or shortening context.`,
        ) );
    }

    private logModelRedirect ( ctx: StreamContext, modelId: string ): void {
        if ( ctx.servedModel && ctx.servedModel !== modelId ) {
            this.log.info( `[Mistral] model redirect: requested=${ modelId } served=${ ctx.servedModel }` );
            this.lastModelName = ctx.servedModel;
            this.lastModelId = ctx.servedModel;
        }
    }

    public dispose (): void {
        this.tokenizer = null;
        this.statusBarItem?.hide();
        this.chatStatus.dispose();
        this._onDidChangeLanguageModelChatInformation.dispose();
        this.client = null;
    }

    public getUsageStats (): UsageStats {
        return { ...this.tokensUsedThisSession };
    }

    public getClient (): Mistral | null {
        return this.client;
    }

    public async ensureClient ( silent: boolean = true ): Promise<Mistral | null> {
        if ( this.initPromise ) {
            try {
                await this.initPromise;
            } catch { }
            this.initPromise = undefined;
        }
        if ( !this.client ) {
            await this.callInitClient( silent );
        }
        return this.client;
    }
}
