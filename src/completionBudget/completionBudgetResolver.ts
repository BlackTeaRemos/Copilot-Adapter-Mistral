import type { CompletionBudget } from './completionBudget.js';
import type { CompletionBudgetInputs } from './completionBudgetInputs.js';

export class CompletionBudgetResolver {
    public Resolve ( inputs: CompletionBudgetInputs ): CompletionBudget {
        const candidates = [
            { value: inputs.requestMaxTokens, source: `request override` },
            { value: inputs.modelMaxTokens, source: `per-model configuration` },
            { value: inputs.globalMaxTokens, source: `mistral.maxTokens` },
            { value: inputs.defaultCompletionTokens, source: inputs.defaultSource ?? `model default` },
        ];
        const selected = candidates.find( candidate => {
            return candidate.value !== undefined;
        } );
        if ( !selected ) {
            throw new TypeError( `[Mistral] No completion token budget is configured.` );
        }
        const requestedTokens = this.__RequirePositiveInteger( selected.value, selected.source );
        const modelOutputLimit = inputs.maxOutputTokens === undefined ? undefined
            : this.__RequirePositiveInteger( inputs.maxOutputTokens, `model output limit` );
        const contextOutputLimit = inputs.contextOutputTokens === undefined ? undefined
            : this.__RequirePositiveInteger( inputs.contextOutputTokens, `remaining context budget` );
        if ( modelOutputLimit === undefined && contextOutputLimit === undefined ) {
            throw new TypeError( `[Mistral] No model output limit or context bound is available.` );
        }
        const maxOutputTokens = Math.min( modelOutputLimit ?? Number.MAX_SAFE_INTEGER, contextOutputLimit ?? Number.MAX_SAFE_INTEGER );
        const contextLimited = contextOutputLimit !== undefined &&
            ( modelOutputLimit === undefined || contextOutputLimit < modelOutputLimit );
        return {
            requestedTokens,
            effectiveTokens: Math.min( requestedTokens, maxOutputTokens ),
            maxOutputTokens,
            ...( contextLimited ? { limitSource: `context headroom` as const } : {} ),
            source: selected.source,
        };
    }

    private __RequirePositiveInteger ( value: unknown, source: string ): number {
        if ( typeof value !== `number` || !Number.isSafeInteger( value ) || value <= 0 ) {
            throw new TypeError( `[Mistral] ${ source } must be a finite positive safe integer.` );
        }
        return value;
    }
}
