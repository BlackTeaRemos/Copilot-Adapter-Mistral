import type { ContextWindowLimits } from './contextWindowLimits.js';
import type { ContextWindowBudget } from './contextWindowBudget.js';
import { DEFAULT_COMPLETION_TOKENS } from '../types.js';

export class ContextWindowResolver {
    public ResolveLimits ( contextWindowTokens: unknown, outputLimitTokens?: unknown ): ContextWindowLimits {
        const maxContextWindowTokens = this.__RequirePositiveInteger( contextWindowTokens, `model context window` );
        const outputLimit = outputLimitTokens === undefined
            ? maxContextWindowTokens - 1
            : this.__RequirePositiveInteger( outputLimitTokens, `model output limit` );
        if ( maxContextWindowTokens < 2 ) {
            throw new TypeError( `[Mistral] Model context window must leave room for input and output.` );
        }
        const maxOutputTokens = Math.min( outputLimit, maxContextWindowTokens - 1 );
        return {
            maxContextWindowTokens,
            maxInputTokens: maxContextWindowTokens - ( outputLimitTokens === undefined
                ? Math.min( DEFAULT_COMPLETION_TOKENS, maxOutputTokens )
                : maxOutputTokens ),
            maxOutputTokens,
        };
    }

    public ResolveSelection ( modelInputLimit: unknown, selection: unknown ): ContextWindowBudget {
        const maxInputTokens = this.__RequirePositiveInteger( modelInputLimit, `model input limit` );
        const requestedTokens = selection === undefined
            ? maxInputTokens
            : this.__RequirePositiveInteger( selection, `contextSize` );
        return {
            requestedTokens,
            effectiveTokens: Math.min( requestedTokens, maxInputTokens ),
            maxInputTokens,
        };
    }

    private __RequirePositiveInteger ( value: unknown, name: string ): number {
        if ( typeof value !== `number` || !Number.isSafeInteger( value ) || value <= 0 ) {
            throw new TypeError( `[Mistral] ${ name } must be a finite positive safe integer.` );
        }
        return value;
    }
}
