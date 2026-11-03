import { Mistral } from '@mistralai/mistralai';
import {
    CancellationToken,
    Event,
    EventEmitter,
    ExtensionContext,
    LanguageModelChatRequestMessage,
    LanguageModelChatProvider,
    LanguageModelDataPart,
    LanguageModelResponsePart,
    LanguageModelTextPart,
    LogOutputChannel,
    Progress,
    ProvideLanguageModelChatResponseOptions,
    StatusBarItem,
} from 'vscode';

export type { MistralModel, MistralContent, MistralToolCall, MistralMessage } from './types.js';
export { formatModelName, getChatModelInfo, toMistralRole } from './conversion/index.js';

import type { MistralChatModelInformation } from './_future_/mistralChatModelInformation.js';
import type { MistralModel, UsageStats } from './types.js';
import { DEFAULT_MAX_OUTPUT_TOKENS } from './types.js';
import { getChatModelInfo, createToolCallIdMap } from './conversion/index.js';
import { fetchModels } from './client/index.js';
import type { StreamContext } from './stream/index.js';
import { TokenizerCalibration } from './cacheCalibration.js';
import { setApiKey, signInWithBrowser, initClient, type AuthDeps } from './auth/index.js';
import { updateStatusBar } from './statusBar.js';
import { ModelCache } from './client/modelCache.js';
import { MistralChatStatus } from './_future_/chatStatusItem.js';

import { ChatResponseSession } from './chatResponse/chatResponseSession.js';
import { IsInteractiveInitiator } from './providerSupport/isInteractiveInitiator.js';
import { PickDefaultModelId } from './providerSupport/pickDefaultModelId.js';
import { ResolveCatalogModel } from './modelSelection/resolveCatalogModel.js';
import { ProviderTokenCounter } from './providerSupport/providerTokenCounter.js';

export class MistralChatModelProvider implements LanguageModelChatProvider<MistralChatModelInformation> {
    private client: Mistral | null = null;
    private fetchedModels: MistralModel[] | null = null;
    private modelCacheTimestamp = 0;
    private modelCache!: ModelCache;
    private chatStatus!: MistralChatStatus;
    private seededFromCache = false;
    private backgroundRefreshStarted = false;
    private lastInfoSignature = ``;
    private static readonly MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
    private initPromise?: Promise<boolean>;
    private tokensUsedThisSession: UsageStats = { input: 0, output: 0, cached: 0, lastPrompt: 0 };
    private lastModelName = ``;
    private lastModelId = ``;
    private calibration!: TokenizerCalibration;
    private readonly _tokenCounter: ProviderTokenCounter;
    private _modelRefreshPromise?: Promise<MistralModel[]>;
    private _modelRefreshClient?: Mistral;
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

    public constructor (
        private readonly context: ExtensionContext,
        logOutputChannel?: LogOutputChannel,
        autoInit = false,
        private readonly statusBarItem?: StatusBarItem,
    ) {
        this.log = logOutputChannel ?? {
            info: () => {
                return;
            }, debug: () => {
                return;
            }, warn: () => {
                return;
            }, error: () => {
                return;
            },
            trace: () => {
                return;
            }, appendLine: () => {
                return;
            }, dispose: () => {
                return;
            },
        } as unknown as LogOutputChannel;
        this.calibration = new TokenizerCalibration( context, this.log );
        this._tokenCounter = new ProviderTokenCounter( context, this.calibration );
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
        if ( this.fetchedModels !== null && Date.now() - this.modelCacheTimestamp < MistralChatModelProvider.MODEL_CACHE_TTL_MS ) {
            return this.fetchedModels;
        }
        const client = this.client;
        if ( !client ) {
            return this.fetchedModels ?? [];
        }
        if ( this._modelRefreshPromise && this._modelRefreshClient === client ) {
            return this._modelRefreshPromise;
        }
        const refresh = this.__RefreshModels( client );
        this._modelRefreshPromise = refresh;
        this._modelRefreshClient = client;
        try {
            return await refresh;
        } finally {
            if ( this._modelRefreshPromise === refresh ) {
                this._modelRefreshPromise = undefined;
                this._modelRefreshClient = undefined;
            }
        }
    }

    private async __RefreshModels ( client: Mistral ): Promise<MistralModel[]> {
        const fresh = await fetchModels( client, this.log );
        if ( this.client !== client ) {
            return this.fetchedModels ?? [];
        }
        if ( fresh.length === 0 && this.fetchedModels ) {
            this.log.warn( `[Mistral] API returned no models; keeping ${ this.fetchedModels.length } cached` );
            return this.fetchedModels;
        }
        this.fetchedModels = fresh;
        this.modelCacheTimestamp = Date.now();
        try {
            await this.modelCache.save( fresh );
        } catch ( error ) {
            this.log.warn( `[Mistral] Model cache could not be saved: ${ String( error ) }` );
        }
        return this.fetchedModels ?? [];
    }

    public async provideLanguageModelChatInformation (
        options: { silent: boolean; },
        token: CancellationToken,
    ): Promise<MistralChatModelInformation[]> {
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

    private toModelInfos ( models: MistralModel[] ): MistralChatModelInformation[] {
        const defaultId = PickDefaultModelId( models );
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

    public async provideLanguageModelChatResponse (
        model: MistralChatModelInformation,
        messages: readonly LanguageModelChatRequestMessage[],
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken,
    ): Promise<void> {
        this.log.info( `[Mistral] provideLanguageModelChatResponse start for model=${ model.id }, messages=${ messages.length }` );
        const toolCallIdMap = createToolCallIdMap();
        const client = this.client;
        if ( token.isCancellationRequested ) {
            return;
        }
        if ( !client ) {
            this.log.warn( `[Mistral][probe] request for ${ model.id } answered locally (no client) - NOT forwarded to another vendor` );
            progress.report( new LanguageModelTextPart( `Mistral is selected but not signed in. Add your Mistral API key to continue - this request was not sent to any other model.` ) );
            return;
        }
        try {
            const models = await this.fetchModels();
            if ( token.isCancellationRequested || this.client !== client ) {
                return;
            }
            const foundModel: MistralModel = ResolveCatalogModel( models, model.id ) ?? {
                id: model.id, name: model.name,
                maxInputTokens: model.maxInputTokens,
                maxContextWindowTokens: model.maxContextWindowTokens,
                maxOutputTokens: model.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
                outputLimitSource: `provider metadata`,
                defaultCompletionTokens: model.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
                toolCalling: Boolean( model.capabilities?.toolCalling ),
                supportsParallelToolCalls: false, supportsVision: model.capabilities?.imageInput ?? false,
                supportsCompletionFim: false, completionChat: true,
            };
            const initiator = ( options as unknown as { requestInitiator?: string } ).requestInitiator;
            const isInteractiveChat = IsInteractiveInitiator( initiator );
            this.log.trace( `[Mistral] requestInitiator=${ initiator ?? `<undefined>` } interactive=${ isInteractiveChat }` );
            if ( isInteractiveChat ) {
                this.lastModelName = foundModel.name;
                this.lastModelId = model.id;
            }
            const context = await new ChatResponseSession().Run( {
                client, model: foundModel, messages, options, progress, token,
                log: this.log, toolCallIdMap, tokenCounter: this._tokenCounter,
            } );
            if ( token.isCancellationRequested ) {
                return;
            }
            const requestUsage = context.usage;
            if ( !token.isCancellationRequested ) {
                const { input, output, cached, lastPrompt } = requestUsage;
                this.tokensUsedThisSession.input += input;
                this.tokensUsedThisSession.output += output;
                this.tokensUsedThisSession.cached += cached;
                this.tokensUsedThisSession.lastPrompt = lastPrompt;
                this.reportTokenUsage( progress, requestUsage );
                this._tokenCounter.RecordCalibration( model.id, lastPrompt, messages );
                this.logCacheHit( cached, lastPrompt, input, model.id );
                this.logModelRedirect( context, model.id, isInteractiveChat );
            }
            if ( this.statusBarItem ) {
                updateStatusBar( this.statusBarItem, this.tokensUsedThisSession, this.lastModelName, this.lastModelId, this.calibration, true );
            }
            if ( isInteractiveChat ) {
                this.chatStatus.update( requestUsage, context.servedModel ?? foundModel.name );
            }
            this.log.debug(
                `[Mistral] stream complete - model=${ context.servedModel ?? model.id } input=${ requestUsage.input } output=${ requestUsage.output } cached=${ requestUsage.cached }` +
                ( context.truncated ? ` TRUNCATED` : `` ),
            );
        } catch ( error ) {
            if ( token.isCancellationRequested ) {
                this.log.debug( `[Mistral] Cancelled request completed without an error response` );
                return;
            }
            const errorMessage = error instanceof Error ? error.message : `Unknown error occurred`;
            this.log.error( `[Mistral] provideLanguageModelChatResponse error: ` + ( error instanceof Error ? error.stack || error.message : String( error ) ) );
            progress.report( new LanguageModelTextPart( `Error: ${ errorMessage }` ) );
        }
    }

    public async provideTokenCount (
        model: MistralChatModelInformation,
        text: string | LanguageModelChatRequestMessage,
        _token: CancellationToken,
    ): Promise<number> {
        return this._tokenCounter.Count( model.id, text );
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

    private logModelRedirect ( ctx: StreamContext, modelId: string, isInteractiveChat: boolean ): void {
        if ( ctx.servedModel && ctx.servedModel !== modelId ) {
            this.log.info( `[Mistral] model redirect: requested=${ modelId } served=${ ctx.servedModel }` );
            if ( isInteractiveChat ) {
                this.lastModelName = ctx.servedModel;
                this.lastModelId = ctx.servedModel;
            }
        }
    }

    public dispose (): void {
        this._tokenCounter.Dispose();
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

    public async ensureClient ( silent = true ): Promise<Mistral | null> {
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
