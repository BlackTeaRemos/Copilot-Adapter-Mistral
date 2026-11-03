import type { Mistral } from '@mistralai/mistralai';
import type {
    CancellationToken,
    LanguageModelChatRequestMessage,
    LanguageModelResponsePart,
    LogOutputChannel,
    Progress,
    ProvideLanguageModelChatResponseOptions,
} from 'vscode';
import type { MistralModel, ToolCallIdMap } from '../types.js';
import type { PromptTokenCounter } from './requestBudget/promptTokenCounter.js';

export interface ChatResponseSessionInput {
    readonly client: Mistral;
    readonly tokenCounter: PromptTokenCounter;
    readonly model: MistralModel;
    readonly messages: readonly LanguageModelChatRequestMessage[];
    readonly options: ProvideLanguageModelChatResponseOptions;
    readonly progress: Progress<LanguageModelResponsePart>;
    readonly token: CancellationToken;
    readonly log: LogOutputChannel;
    readonly toolCallIdMap: ToolCallIdMap;
}
