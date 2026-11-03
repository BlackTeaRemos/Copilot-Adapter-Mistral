export interface ContextWindowBudget {
    readonly requestedTokens: number;
    readonly effectiveTokens: number;
    readonly maxInputTokens: number;
}
