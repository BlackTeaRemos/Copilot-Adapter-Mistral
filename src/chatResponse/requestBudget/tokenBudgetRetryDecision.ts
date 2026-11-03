export interface TokenBudgetRetryDecision {
    readonly nextTokens: number;
    readonly reportedLimit?: number;
}
