import type { Mistral } from '@mistralai/mistralai';
import { vi } from 'vitest';
import type {
    ExtensionContext,
    LanguageModelChatInformation,
    LogOutputChannel,
    ProvideLanguageModelChatResponseOptions,
    WorkspaceConfiguration,
} from 'vscode';
import { LanguageModelChatMessageRole, LanguageModelTextPart, workspace } from 'vscode';
import { MistralChatModelProvider } from '../../provider.js';
import type { MistralModel } from '../../types.js';

export class ProviderBudgetFixture {
    public globalMaxTokens: unknown = 8192;
    public finishReason = `stop`;
    public model: MistralModel = {
        id: `test-model`, name: `Test Model`,
        maxInputTokens: 128000, maxOutputTokens: 16384, defaultCompletionTokens: 4096,
        toolCalling: false, supportsParallelToolCalls: false,
        supportsCompletionFim: false, completionChat: true,
    };
    public readonly log = {
        info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
        trace: vi.fn(), appendLine: vi.fn(), dispose: vi.fn(),
    };
    public readonly progress = { report: vi.fn() };
    public readonly token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn().mockReturnValue( { dispose: vi.fn() } ),
    };
    public readonly stream = vi.fn().mockImplementation( () => {
        return this.__CreateStream();
    } );
    public readonly provider: MistralChatModelProvider;

    public constructor () {
        const context = {
            globalState: { get: vi.fn().mockReturnValue( {} ), update: vi.fn().mockResolvedValue( undefined ) },
            subscriptions: [],
        } as unknown as ExtensionContext;
        vi.spyOn( workspace, `getConfiguration` ).mockReturnValue( {
            get: ( key: string ) => {
                return key === `maxTokens` ? this.globalMaxTokens : undefined;
            },
        } as unknown as WorkspaceConfiguration );
        this.provider = new MistralChatModelProvider( context, this.log as unknown as LogOutputChannel, false );
        ( this.provider as unknown as { client: Mistral } ).client = {
            chat: { stream: this.stream },
        } as unknown as Mistral;
        vi.spyOn( this.provider, `fetchModels` ).mockImplementation( async () => {
            return [ this.model ];
        } );
    }

    public async Request ( options: Record<string, unknown> = {} ): Promise<void> {
        await this.provider.provideLanguageModelChatResponse(
            this.model as unknown as LanguageModelChatInformation,
            [ { role: LanguageModelChatMessageRole.User, content: [ new LanguageModelTextPart( `hello` ) ], name: undefined } ],
            options as unknown as ProvideLanguageModelChatResponseOptions,
            this.progress,
            this.token,
        );
    }

    public Text (): string {
        return this.progress.report.mock.calls.map( ( [ part ] ) => {
            return part instanceof LanguageModelTextPart ? part.value : ``;
        } ).join( `` );
    }

    private async *__CreateStream () {
        yield { data: { choices: [ { delta: { content: `Partial answer` }, finishReason: null } ] } };
        yield { data: { choices: [ { delta: {}, finishReason: this.finishReason } ] } };
        yield { data: { choices: [], usage: { promptTokens: 8, completionTokens: 4 } } };
    }
}
