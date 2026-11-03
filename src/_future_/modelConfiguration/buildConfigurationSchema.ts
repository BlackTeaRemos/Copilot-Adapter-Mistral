import type { MistralModel } from '../../types.js';
import type { ModelConfigurationSchema } from './modelConfigurationSchema.js';
import { ContextWindowSchemaBuilder } from '../../contextWindow/contextWindowSchemaBuilder.js';

export function BuildConfigurationSchema ( model: MistralModel ): ModelConfigurationSchema {
    const contextSize = new ContextWindowSchemaBuilder().Build( model.maxInputTokens );
    return {
        type: `object`,
        properties: {
            ...( contextSize ? { contextSize } : {} ),
            temperature: {
                type: `number`,
                default: model.temperature ?? 0.7,
                minimum: 0,
                maximum: 1,
                description: `Sampling temperature. Lower is more deterministic.`,
                group: `Sampling`,
            },
            topP: {
                type: `number`,
                default: model.top_p ?? 1,
                minimum: 0,
                maximum: 1,
                description: `Nucleus sampling probability mass.`,
                group: `Sampling`,
            },
            maxTokens: {
                type: `integer`,
                minimum: 1,
                maximum: model.maxOutputTokens,
                description:
                    `Output limit. Unset uses global settings or available capacity.`,
                group: `Limits`,
            },
            safePrompt: {
                type: `boolean`,
                default: false,
                description: `Prepend a safety system prompt.`,
                group: `Safety`,
            },
        },
    };
}
