import type {
    LanguageModelChatInformation,
} from 'vscode';

export interface MistralModel {
    id: string;
    name: string;
    detail?: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    defaultCompletionTokens: number;
    toolCalling: boolean;
    supportsParallelToolCalls: boolean;
    supportsVision?: boolean;
    temperature?: number;
    top_p?: number;
}


export type MistralContent = string | Array<{ type: 'text'; text: string; } | { type: 'image_url'; imageUrl: string; }>;

export type MistralToolCall = {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
};

export type MistralMessage =
    | { role: 'system'; content: string; }
    | { role: 'user'; content: MistralContent; }
    | { role: 'assistant'; content: MistralContent | null; toolCalls?: MistralToolCall[]; }
    | { role: 'tool'; content: string | null; toolCallId: string; name?: string; };

export type ToolCallBuffer = { name?: string; argsText: string; };

export type UsageStats = { input: number; output: number; cached: number; lastPrompt: number; };

export type ToolCallIdMap = {
    vsCodeToMistral: Map<string, string>;
    mistralToVsCode: Map<string, string>;
};

export type RawModel = {
    id: string;
    originalName: string;
    detail?: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    defaultCompletionTokens: number;
    toolCalling: boolean;
    supportsParallelToolCalls: boolean;
    supportsVision: boolean;
    temperature?: number;
};

export const DEFAULT_COMPLETION_TOKENS = 4096;
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DEBUG_STREAM_LOGGING = process.env.MISTRAL_DEBUG_STREAM === '1';

export const MODEL_OUTPUT_LIMITS: Record<string, number> = {
    'mistral-tiny-latest': 4096,
    'mistral-small-latest': 4096,
    'mistral-medium-latest': 4096,
    'mistral-large-latest': 16384,
    'codestral-latest': 8192,
    'devstral-latest': 16384,
    'pixtral-large-latest': 8192,
    'magistral-medium-latest': 8192,
    'magistral-small-latest': 4096,
};
