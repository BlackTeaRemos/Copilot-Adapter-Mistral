export interface CompletionBudget {
    readonly requestedTokens: number;
    readonly effectiveTokens: number;
    readonly maxOutputTokens: number;
    readonly limitSource?: `context headroom` | `server output limit` | `retry budget`;
    readonly source: string;
}
