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
import { validateApiKey, setApiKey, initClient, type AuthDeps } from './auth.js';
import { updateStatusBar } from './statusBar.js';

function extractText( part: unknown ): string {
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

    constructor(
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
        this.log.info( `[Mistral] Provider constructed` );
        if ( autoInit ) {
            this.log.info( `[Mistral] Auto-initializing client on activation` );
            this.initPromise = this.callInitClient( true );
        }
    }

    private authDeps(): AuthDeps {
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
            },
            fireModelInfoChange: () => {
                this._onDidChangeLanguageModelChatInformation.fire( undefined );
            },
            validateApiKey: apiKey => {
                return this.validateApiKey( apiKey );
            },
        };
    }

    private callInitClient( silent: boolean ): Promise<boolean> {
        return initClient( silent, this.authDeps() );
    }

    public setApiKey(): Promise<string | undefined> {
        return setApiKey( this.authDeps() );
    }

    public validateApiKey( apiKey: string ): Promise<boolean> {
        return validateApiKey( apiKey, this.log );
    }

    public async fetchModels(): Promise<MistralModel[]> {
        const now = Date.now();
        if ( this.fetchedModels !== null && now - this.modelCacheTimestamp < MistralChatModelProvider.MODEL_CACHE_TTL_MS ) {
            return this.fetchedModels;
        }
        if ( !this.client ) {
            return [];
        }
        this.fetchedModels = await fetchModels( this.client, this.log );
        this.modelCacheTimestamp = now;
        this.log.debug( `[Mistral] Fetched models: ` + JSON.stringify( this.fetchedModels, null, 2 ) );
        return this.fetchedModels;
    }

    async provideLanguageModelChatInformation(
        options: { silent: boolean; },
        token: CancellationToken,
    ): Promise<LanguageModelChatInformation[]> {
        this.log.info( `[Mistral] provideLanguageModelChatInformation called (silent=` + options.silent + `)` );
        if ( token.isCancellationRequested ) {
            return [];
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
            this.log.warn( `[Mistral] client not initialized` ); return [];
        }
        if ( token.isCancellationRequested ) {
            return [];
        }

        const models = await this.fetchModels();
        this.log.info( `[Mistral] Returning ` + models.length + ` models` );
        this.log.debug( `[Mistral] Returning model info: ` + JSON.stringify( models.map( model => {
            return getChatModelInfo( model );
        } ), null, 2 ) );
        return models.map( model => {
            return getChatModelInfo( model );
        } );
    }

    async provideLanguageModelChatResponse(
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken,
    ): Promise<void> {
        this.log.info( `[Mistral] provideLanguageModelChatResponse start for model=${ model.id }, messages=${ messages.length }` );
        this.toolCallIdMap = createToolCallIdMap();

        if ( !this.client ) {
            progress.report( new LanguageModelTextPart( `Please add your Mistral API key to use Mistral AI.` ) );
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
            return  {
                type: `function` as const,
                function: { name: tool.name, description: tool.description, parameters: tool.inputSchema || {} },
            };
        } );
        const shouldSendTools = mistralTools && mistralTools.length > 0;
        const toolChoice = shouldSendTools
            ? options.toolMode === LanguageModelChatToolMode.Required ? `any` : `auto`
            : undefined;
        const parallelToolCalls = shouldSendTools ? ( foundModel.supportsParallelToolCalls ?? false ) : undefined;
        const modelOptions = toModelOptions( options.modelOptions );
        const temperature = getNumberOption( modelOptions, `temperature` ) ?? foundModel.temperature ?? 0.7;
        const topP = getNumberOption( modelOptions, `topP` ) ?? foundModel.top_p;
        const safePrompt = getBooleanOption( modelOptions, `safePrompt` );

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
                maxTokens: Math.min( foundModel.defaultCompletionTokens, foundModel.maxOutputTokens ),
                temperature, topP, safePrompt,
                promptCacheKey: computePromptCacheKey( model.id, mistralMessages ),
                tools: shouldSendTools && foundModel.toolCalling ? mistralTools : undefined,
                toolChoice: shouldSendTools && foundModel.toolCalling ? toolChoice : undefined,
                parallelToolCalls: shouldSendTools && foundModel.toolCalling ? parallelToolCalls : undefined,
            };
            assertChatStreamRequest( request );

            this.lastModelName = foundModel.name;
            this.lastModelId = model.id;

            const stream = await streamChatCompletion( this.client, request, abortController.signal, this.log );
            const ctx: StreamContext = {
                contentState: createContentDeltaState(),
                toolCallState: createToolCallState(),
                map: this.toolCallIdMap,
                usage: this.tokensUsedThisSession,
            };

            for await ( const event of stream as AsyncIterable<CompletionEvent> ) {
                if ( token.isCancellationRequested ) {
                    break;
                }
                processStreamEvent( event, ctx, progress, this.log );
            }

            if ( !token.isCancellationRequested ) {
                flushContentDeltaState( ctx.contentState, this.log );
                const { input, cached, lastPrompt } = this.tokensUsedThisSession;
                this.reportTokenUsage( progress, this.tokensUsedThisSession );
                this.recordCalibration( model.id, lastPrompt, messages );
                this.logCacheHit( cached, lastPrompt, input, model.id );
                if ( ctx.truncated ) {
                    this.reportTruncationWarning( progress, foundModel );
                }
                this.logModelRedirect( ctx, model.id );
            }
            if ( this.statusBarItem ) {
                updateStatusBar( this.statusBarItem, this.tokensUsedThisSession, this.lastModelName, this.lastModelId, this.calibration );
            }
            this.log.debug(
                `[Mistral] stream complete — model=${ ctx.servedModel ?? model.id } input=${ this.tokensUsedThisSession.input } output=${ this.tokensUsedThisSession.output } cached=${ this.tokensUsedThisSession.cached }` +
                ( ctx.truncated ? ` TRUNCATED` : `` ),
            );
        } catch( error ) {
            const errorMessage = error instanceof Error ? error.message : `Unknown error occurred`;
            this.log.error( `[Mistral] provideLanguageModelChatResponse error: ` + ( error instanceof Error ? error.stack || error.message : String( error ) ) );
            progress.report( new LanguageModelTextPart( `Error: ${ errorMessage }` ) );
        } finally {
            cancellationDisposable?.dispose();
        }
    }

    /**
     * Returns the active token encoder. Prefers the bundled native Mistral
     * (tekken) tokenizer — exact counts, no calibration needed — and falls back
     * to cl100k_base + the learned scale factor when the tekken assets are
     * unavailable.
     */
    private getEncoder(): { enc: Tiktoken; native: boolean; } {
        const native = getMistralTokenizer( this.context.extensionUri?.fsPath ?? `` );
        if ( native ) {
            return { enc: native, native: true };
        }
        if ( !this.tokenizer ) {
            this.tokenizer = getEncoding( `cl100k_base` );
        }
        return { enc: this.tokenizer, native: false };
    }

    async provideTokenCount(
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

    private reportTokenUsage( progress: Progress<LanguageModelResponsePart>, usage: UsageStats ): void {
        progress.report( new LanguageModelDataPart(
            new TextEncoder().encode( JSON.stringify( {
                prompt_tokens: usage.input, completion_tokens: usage.output,
                total_tokens: usage.input + usage.output,
                prompt_tokens_details: { cached_tokens: usage.cached },
            } ) ),
            `usage`,
        ) );
    }

    private recordCalibration( modelId: string, lastPrompt: number, messages: Array<LanguageModelChatMessage> ): void {
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

    private logCacheHit( cached: number, lastPrompt: number, input: number, modelId: string ): void {
        if ( cached > 0 ) {
            const denom = input > 0 ? input : lastPrompt;
            const pct = denom > 0 ? Math.round( ( cached / denom ) * 100 ) : 0;
            const saved = Math.round( cached * 0.9 );
            this.log.info(
                `[Mistral] prompt cache hit — cached=${ cached }/${ denom } prompt tokens (${ pct }%), ~${ saved } billed-token equivalent saved (calibration samples: ${ this.calibration.sampleCount( modelId ) })`,
            );
        }
    }

    private reportTruncationWarning( progress: Progress<LanguageModelResponsePart>, foundModel: MistralModel ): void {
        progress.report( new LanguageModelTextPart(
            `\n\n⚠️ Response truncated — output hit the token limit (${ foundModel.defaultCompletionTokens } tokens). Consider increasing maxTokens or shortening context.`,
        ) );
    }

    private logModelRedirect( ctx: StreamContext, modelId: string ): void {
        if ( ctx.servedModel && ctx.servedModel !== modelId ) {
            this.log.info( `[Mistral] model redirect: requested=${ modelId } served=${ ctx.servedModel }` );
            this.lastModelName = ctx.servedModel;
            this.lastModelId = ctx.servedModel;
        }
    }

    public dispose(): void {
        this.tokenizer = null;
        this.statusBarItem?.hide();
        this._onDidChangeLanguageModelChatInformation.dispose();
        this.client = null;
    }

    public getUsageStats(): UsageStats {
        return { ...this.tokensUsedThisSession };
    }

    public getClient(): Mistral | null {
        return this.client;
    }

    public async ensureClient( silent: boolean = true ): Promise<Mistral | null> {
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
