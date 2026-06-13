import type { MistralModel } from '../types.js';

export function proposedModelInfoFields ( model: MistralModel, isDefault: boolean ): Record<string, unknown> {
    return {
        capabilities: {
            toolCalling: model.toolCalling,
            imageInput: model.supportsVision ?? false,
            supportsToolCalling: model.toolCalling,
            supportsImageToText: model.supportsVision ?? false,
        },
        isUserSelectable: true,
        isDefault,
        configurationSchema: buildConfigurationSchema( model ),
    };
}

function buildConfigurationSchema ( model: MistralModel ): unknown {
    return {
        type: `object`,
        properties: {
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
                type: `number`,
                default: model.defaultCompletionTokens,
                minimum: 1,
                maximum: model.maxOutputTokens,
                description: `Maximum number of tokens to generate.`,
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

export function readModelConfiguration ( options: unknown ): Record<string, unknown> | undefined {
    return ( options as { modelConfiguration?: Record<string, unknown> } ).modelConfiguration;
}
