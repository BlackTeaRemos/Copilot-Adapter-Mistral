export interface CompletionBudgetInputs {
    readonly requestMaxTokens?: unknown;
    readonly modelMaxTokens?: unknown;
    readonly globalMaxTokens?: unknown;
    readonly defaultCompletionTokens: unknown;
    readonly defaultSource?: string;
    readonly maxOutputTokens?: unknown;
    readonly contextOutputTokens?: unknown;
}
