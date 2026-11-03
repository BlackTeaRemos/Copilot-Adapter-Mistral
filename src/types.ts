export interface MistralModel {
    id: string;
    name: string;
    detail?: string;
    aliases?: string[];
    catalogSource?: `api` | `provisioned`;
    deprecationDate?: string;
    deprecationReplacementModel?: string;
    outputLimitSource?: `documented model limit` | `API-declared alias` | `context window` | `provider metadata`;
    maxInputTokens: number;
    maxContextWindowTokens?: number;
    maxOutputTokens: number;
    defaultCompletionTokens: number;
    toolCalling: boolean;
    supportsParallelToolCalls: boolean;
    supportsVision?: boolean;
    supportsCompletionFim: boolean;
    completionChat: boolean;
    temperature?: number;
    top_p?: number;
}


export type MistralContent = string | ({ type: `text`; text: string; } | { type: `image_url`; imageUrl: string; })[];

export interface MistralToolCall {
    id: string;
    type: `function`;
    function: {
        name: string;
        arguments: string;
    };
}

export type MistralMessage =
    | { role: `system`; content: string; }
    | { role: `user`; content: MistralContent; }
    | { role: `assistant`; content: MistralContent | null; toolCalls?: MistralToolCall[]; }
    | { role: `tool`; content: string | null; toolCallId: string; name?: string; };

export interface ToolCallBuffer { name?: string; argsText: string; }

export interface UsageStats { input: number; output: number; cached: number; lastPrompt: number; }

export interface ToolCallIdMap {
    vsCodeToMistral: Map<string, string>;
    mistralToVsCode: Map<string, string>;
}

export interface RawModel {
    id: string;
    originalName: string;
    detail?: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    defaultCompletionTokens: number;
    toolCalling: boolean;
    supportsParallelToolCalls: boolean;
    supportsVision: boolean;
    supportsCompletionFim: boolean;
    temperature?: number;
}

export const DEFAULT_COMPLETION_TOKENS = 4096;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

export const MODEL_OUTPUT_LIMITS: Record<string, number> = {
    'zai-glm-5-3': 128000,
    'zai-glm-5-3-flash': 128000,
};
