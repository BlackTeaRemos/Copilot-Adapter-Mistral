import { Mistral } from '@mistralai/mistralai';
import type { CompletionEvent } from '@mistralai/mistralai/models/components';
import { Tiktoken } from 'tiktoken/lite';
import cl100k_base from 'tiktoken/encoders/cl100k_base.json';
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
    window,
} from 'vscode';

export type { MistralModel, MistralContent, MistralToolCall, MistralMessage } from './types.js';
export { formatModelName, getChatModelInfo, toMistralRole } from './conversion/index.js';

import type { MistralModel, UsageStats, ToolCallIdMap } from './types.js';
import { DEFAULT_COMPLETION_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS } from './types.js';
import { getChatModelInfo, createToolCallIdMap, toMistralMessages } from './conversion/index.js';
import {
    createMistralClient,
    fetchModels,
    streamChatCompletion,
} from './client/index.js';
import {
    createContentDeltaState,
    flushContentDeltaState,
    createToolCallState,
    processStreamEvent,
} from './stream/index.js';
import type { StreamContext } from './stream/index.js';
import { assertChatStreamRequest, toModelOptions, getNumberOption, getBooleanOption } from './assertions/index.js';

export class MistralChatModelProvider implements LanguageModelChatProvider {
    private client: Mistral | null = null;
    private tokenizer: Tiktoken | null = null;
    private fetchedModels: MistralModel[] | null = null;
    private modelCacheTimestamp: number = 0;
    private static readonly MODEL_CACHE_TTL_MS = 30 * 60 * 1000;
    private initPromise?: Promise<boolean>;
    private tokensUsedThisSession: UsageStats = { input: 0, output: 0 };
    private lastModelName: string = '';
    private toolCallIdMap: ToolCallIdMap = createToolCallIdMap();
    private readonly log: LogOutputChannel;
    private readonly _onDidChangeLanguageModelChatInformation = new EventEmitter<void>();

    readonly onDidChangeLanguageModelChatInformation: Event<void> = this._onDidChangeLanguageModelChatInformation.event;

    constructor (
        private readonly context: ExtensionContext,
        logOutputChannel?: LogOutputChannel,
        autoInit: boolean = false,
        private readonly statusBarItem?: StatusBarItem,
    ) {
        if ( logOutputChannel ) {
            this.log = logOutputChannel;
        } else {
            this.log = {
                info: () => { },
                debug: () => { },
                warn: () => { },
                error: () => { },
                appendLine: () => { },
                dispose: () => { },
            } as unknown as LogOutputChannel;
        }
        this.log.info( '[Mistral] Provider constructed' );
        if ( autoInit ) {
            this.log.info( '[Mistral] Auto-initializing client on activation' );
            this.initPromise = this.initClient( true );
        }
    }

    public async setApiKey (): Promise<string | undefined> {
        let apiKey: string | undefined = await this.context.secrets.get( 'MISTRAL_API_KEY' );
        this.log.debug( '[Mistral] Prompting user for API key (existing present: ' + !!apiKey + ')' );
        apiKey = await window.showInputBox( {
            placeHolder: 'Mistral API Key',
            password: true,
            value: apiKey || '',
            prompt: 'Enter your Mistral API key (get one at https://console.mistral.ai/)',
            ignoreFocusOut: true,
            validateInput: value => {
                if ( !value || value.trim().length === 0 ) { return 'API key is required'; }
                if ( value.length < 20 ) { return 'API key appears too short'; }
                return undefined;
            },
        } );

        const trimmedApiKey = apiKey?.trim();
        if ( !trimmedApiKey ) {
            this.log.info( '[Mistral] setApiKey canceled by user' );
            return undefined;
        }

        const isValid = await this.validateApiKey( trimmedApiKey );
        if ( !isValid ) {
            this.log.warn( '[Mistral] Provided API key failed validation' );
            await window.showErrorMessage( 'Invalid Mistral API key. Please check your key and try again.' );
            return undefined;
        }

        this.log.info( '[Mistral] Storing API key and initializing client' );
        try {
            await this.context.secrets.store( 'MISTRAL_API_KEY', trimmedApiKey );
            this.log.info( '[Mistral] API key stored successfully' );
        } catch ( e ) {
            this.log.warn( '[Mistral] Failed to store API key in secret storage: ' + String( e ) );
        }
        this.client = createMistralClient( trimmedApiKey, this.log );
        this.fetchedModels = null;
        this._onDidChangeLanguageModelChatInformation.fire( undefined );
        return trimmedApiKey;
    }

    public async validateApiKey ( apiKey: string ): Promise<boolean> {
        try {
            const testClient = createMistralClient( apiKey, this.log );
            await testClient.models.list();
            return true;
        } catch ( error ) {
            const statusCode = ( error as { statusCode?: unknown; } ).statusCode;
            if ( statusCode === 401 || statusCode === 403 ) { return false; }
            return true;
        }
    }

    private async initClient ( silent: boolean ): Promise<boolean> {
        if ( this.client ) { return true; }
        let apiKey: string | undefined = await this.context.secrets.get( 'MISTRAL_API_KEY' );
        this.log.debug( '[Mistral] initClient called (silent=' + silent + ', hasStoredKey=' + !!apiKey + ')' );
        if ( !silent && !apiKey ) {
            apiKey = await this.setApiKey();
        } else if ( apiKey ) {
            this.client = createMistralClient( apiKey, this.log );
        }
        this.log.debug( '[Mistral] initClient result: ' + !!apiKey );
        return !!apiKey;
    }

    public async fetchModels (): Promise<MistralModel[]> {
        const now = Date.now();
        if ( this.fetchedModels !== null && now - this.modelCacheTimestamp < MistralChatModelProvider.MODEL_CACHE_TTL_MS ) {
            return this.fetchedModels;
        }
        if ( !this.client ) { return []; }

        this.fetchedModels = await fetchModels( this.client, this.log );
        this.modelCacheTimestamp = now;
        return this.fetchedModels;
    }

    async provideLanguageModelChatInformation (
        options: { silent: boolean; },
        token: CancellationToken,
    ): Promise<LanguageModelChatInformation[]> {
        this.log.info( '[Mistral] provideLanguageModelChatInformation called (silent=' + options.silent + ')' );
        if ( token.isCancellationRequested ) { return []; }

        if ( this.initPromise ) {
            try { await this.initPromise; } catch { }
            this.initPromise = undefined;
        }

        if ( token.isCancellationRequested ) { return []; }

        const initialized = await this.initClient( options.silent );
        if ( !initialized ) {
            this.log.warn( '[Mistral] client not initialized' );
            return [];
        }

        if ( token.isCancellationRequested ) { return []; }

        const models = await this.fetchModels();
        this.log.info( '[Mistral] Returning ' + models.length + ' models' );
        return models.map( model => getChatModelInfo( model ) );
    }

    async provideLanguageModelChatResponse (
        model: LanguageModelChatInformation,
        messages: Array<LanguageModelChatMessage>,
        options: ProvideLanguageModelChatResponseOptions,
        progress: Progress<LanguageModelResponsePart>,
        token: CancellationToken,
    ): Promise<void> {
        this.log.info(
            `[Mistral] provideLanguageModelChatResponse start for model=${ model.id }, messages=${ messages.length }`,
        );
        this.toolCallIdMap = createToolCallIdMap();

        if ( !this.client ) {
            progress.report( new LanguageModelTextPart( 'Please add your Mistral API key to use Mistral AI.' ) );
            return;
        }

        const models = await this.fetchModels();
        const foundModel = models.find( m => m.id === model.id ) ?? {
            id: model.id,
            name: model.name,
            maxInputTokens: model.maxInputTokens,
            maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
            defaultCompletionTokens: DEFAULT_COMPLETION_TOKENS,
            toolCalling: true,
            supportsParallelToolCalls: false,
            supportsVision: false,
        };

        const mistralMessages = toMistralMessages( messages, this.toolCallIdMap );

        const mistralTools = options.tools?.map( tool => ( {
            type: 'function' as const,
            function: { name: tool.name, description: tool.description, parameters: tool.inputSchema || {} },
        } ) );

        const shouldSendTools = mistralTools && mistralTools.length > 0;
        const toolChoice = shouldSendTools
            ? options.toolMode === LanguageModelChatToolMode.Required ? 'any' : 'auto'
            : undefined;
        const parallelToolCalls = shouldSendTools ? ( foundModel.supportsParallelToolCalls ?? false ) : undefined;

        const modelOptions = toModelOptions( options.modelOptions );
        const temperature = getNumberOption( modelOptions, 'temperature' ) ?? foundModel.temperature ?? 0.7;
        const topP = getNumberOption( modelOptions, 'topP' ) ?? foundModel.top_p;
        const safePrompt = getBooleanOption( modelOptions, 'safePrompt' );

        const abortController = new AbortController();
        const cancellationDisposable =
            typeof token.onCancellationRequested === 'function'
                ? token.onCancellationRequested( () => {
                    abortController.abort();
                    this.log.info( '[Mistral] Request cancelled by user' );
                } )
                : undefined;

        try {
            if ( token.isCancellationRequested ) { abortController.abort(); }

            const request = {
                model: model.id,
                messages: mistralMessages,
                maxTokens: Math.min( foundModel.defaultCompletionTokens, foundModel.maxOutputTokens ),
                temperature,
                topP,
                safePrompt,
                tools: shouldSendTools && foundModel.toolCalling ? mistralTools : undefined,
                toolChoice: shouldSendTools && foundModel.toolCalling ? toolChoice : undefined,
                parallelToolCalls: shouldSendTools && foundModel.toolCalling ? parallelToolCalls : undefined,
            };
            assertChatStreamRequest( request );

            this.lastModelName = foundModel.name;

            const stream = await streamChatCompletion( this.client, request, abortController.signal, this.log );

            const ctx: StreamContext = {
                contentState: createContentDeltaState(),
                toolCallState: createToolCallState(),
                map: this.toolCallIdMap,
                usage: this.tokensUsedThisSession,
            };

            for await ( const event of stream as AsyncIterable<CompletionEvent> ) {
                if ( token.isCancellationRequested ) { break; }
                processStreamEvent( event, ctx, progress, this.log );
                this.updateStatusBar();
            }

            if ( !token.isCancellationRequested ) {
                flushContentDeltaState( ctx.contentState, this.log );
                const { input, output } = this.tokensUsedThisSession;
                progress.report( new LanguageModelDataPart(
                    new TextEncoder().encode( JSON.stringify( {
                        prompt_tokens: input,
                        completion_tokens: output,
                        total_tokens: input + output,
                    } ) ),
                    'usage',
                ) );
                if ( ctx.truncated ) {
                    progress.report( new LanguageModelTextPart(
                        `\n\n⚠️ Response truncated — output hit the token limit (${ foundModel.defaultCompletionTokens } tokens). Consider increasing maxTokens or shortening context.`,
                    ) );
                }
                if ( ctx.servedModel && ctx.servedModel !== model.id ) {
                    this.log.info( `[Mistral] model redirect: requested=${ model.id } served=${ ctx.servedModel }` );
                    this.lastModelName = ctx.servedModel;
                }
            }
            this.log.debug(
                `[Mistral] stream complete — model=${ ctx.servedModel ?? model.id } input=${ this.tokensUsedThisSession.input } output=${ this.tokensUsedThisSession.output }` +
                ( ctx.truncated ? ' TRUNCATED' : '' ),
            );
        } catch ( error ) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            this.log.error(
                '[Mistral] provideLanguageModelChatResponse error: ' +
                ( error instanceof Error ? error.stack || error.message : String( error ) ),
            );
            progress.report( new LanguageModelTextPart( `Error: ${ errorMessage }` ) );
        } finally {
            cancellationDisposable?.dispose();
        }
    }

    async provideTokenCount (
        _model: LanguageModelChatInformation,
        text: string | LanguageModelChatMessage,
        _token: CancellationToken,
    ): Promise<number> {
        if ( !this.tokenizer ) {
            this.tokenizer = new Tiktoken(
                cl100k_base.bpe_ranks,
                cl100k_base.special_tokens,
                cl100k_base.pat_str,
            );
        }

        let textContent = '';
        if ( typeof text === 'string' ) {
            textContent = text;
        } else {
            textContent = text.content
                .map( part => {
                    if ( part instanceof LanguageModelTextPart ) { return part.value; }
                    if ( part instanceof LanguageModelToolCallPart ) { return part.name + JSON.stringify( part.input ); }
                    if ( part instanceof LanguageModelToolResultPart ) {
                        return part.content
                            .filter( p => p instanceof LanguageModelTextPart )
                            .map( p => ( p as LanguageModelTextPart ).value )
                            .join( '' );
                    }
                    return '';
                } )
                .join( '' );
        }

        return this.tokenizer.encode( textContent ).length;
    }

    public dispose (): void {
        this.tokenizer = null;
        this.statusBarItem?.hide();
        this._onDidChangeLanguageModelChatInformation.dispose();
        this.client = null;
    }

    public getUsageStats (): UsageStats {
        return { ...this.tokensUsedThisSession };
    }

    private updateStatusBar (): void {
        if ( !this.statusBarItem ) { return; }
        const { input, output } = this.tokensUsedThisSession;
        if ( input === 0 && output === 0 ) {
            this.statusBarItem.hide();
            return;
        }
        const fmt = ( n: number ) => n >= 1000 ? `${ ( n / 1000 ).toFixed( 1 ) }k` : String( n );
        const modelTag = this.lastModelName ? ` ${ this.lastModelName }` : '';
        this.statusBarItem.text = `$(hubot)${ modelTag } ${ fmt( input ) }↑ ${ fmt( output ) }↓`;
        this.statusBarItem.tooltip =
            `Mistral — last turn (${ this.lastModelName })\n` +
            `prompt (in):      ${ input.toLocaleString() }\n` +
            `completion (out): ${ output.toLocaleString() }\n` +
            `total:            ${ ( input + output ).toLocaleString() }`;
        this.statusBarItem.show();
    }

}
