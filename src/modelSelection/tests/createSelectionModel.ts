import type { MistralModel } from '../../types.js';

export function CreateSelectionModel ( identifier: string, overrides: Partial<MistralModel> = {} ): MistralModel {
    return {
        id: identifier, name: identifier,
        maxInputTokens: 32768, maxOutputTokens: 4096, defaultCompletionTokens: 4096,
        toolCalling: false, supportsParallelToolCalls: false,
        supportsCompletionFim: false, completionChat: true,
        ...overrides,
    };
}
