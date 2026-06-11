export type MistralMessageShape = {
    role?: string;
    content?: unknown;
    toolCalls?: unknown[];
};

export function toMistralMessageShape ( val: unknown ): MistralMessageShape {
    if ( typeof val !== `object` || val === null ) {
        return {};
    }
    const r = val as Record<string, unknown>;
    return {
        role: typeof r[ `role` ] === `string` ? r[ `role` ] : undefined,
        content: r[ `content` ],
        toolCalls: Array.isArray( r[ `tool_calls` ] ) ? r[ `tool_calls` ] as unknown[]
            : Array.isArray( r[ `toolCalls` ] ) ? r[ `toolCalls` ] as unknown[]
                : undefined,
    };
}
