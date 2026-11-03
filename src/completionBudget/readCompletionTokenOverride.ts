export function ReadCompletionTokenOverride ( options: Record<string, unknown> | undefined ): unknown {
    if ( options && Object.hasOwn( options, `maxTokens` ) && options.maxTokens !== undefined ) {
        return options.maxTokens;
    }
    return options && Object.hasOwn( options, `max_tokens` ) ? options.max_tokens : undefined;
}
