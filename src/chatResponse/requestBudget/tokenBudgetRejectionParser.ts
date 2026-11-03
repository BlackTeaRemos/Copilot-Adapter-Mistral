import type { TokenBudgetRetryDecision } from './tokenBudgetRetryDecision.js';

export class TokenBudgetRejectionParser {
    public Evaluate ( error: unknown, currentTokens: number ): TokenBudgetRetryDecision | undefined {
        if ( typeof error !== `object` || error === null || currentTokens <= 1 ) {
            return undefined;
        }
        const failure = error as Record<string, unknown>;
        if ( failure.statusCode !== 400 && failure.statusCode !== 422 ) {
            return undefined;
        }
        const body = typeof failure.body === `string` ? failure.body.slice( 0, 65536 ) : ``;
        const message = typeof failure.message === `string` ? failure.message : ``;
        const description = message + ` ` + body;
        if ( !/max[_ ]tokens|maximum output tokens|maximum context length|context[_ ](?:length|window)/i.test( description ) ||
            !/limit|maximum|exceed|too (?:large|long|high)|less than|at most|out of range|upper bound|<=/i.test( description ) ) {
            return undefined;
        }
        let reportedLimit: number | undefined;
        try {
            reportedLimit = this.__ReadStructuredLimit( JSON.parse( body ), 0 );
        } catch {
        }
        const explicitLimit = description.match(
            /(?:max_tokens|maximum output tokens)[^\d]{0,100}(?:less than or equal to|at most|cannot exceed|<=|maximum(?: is| of)?|limit(?: is| of)?|is)\s*[:=]?\s*(\d[\d,]*)/i,
        );
        reportedLimit ??= explicitLimit ? Number( explicitLimit[ 1 ].replaceAll( `,`, `` ) ) : undefined;
        if ( reportedLimit !== undefined && Number.isSafeInteger( reportedLimit ) && reportedLimit > 0 && reportedLimit < currentTokens ) {
            return { nextTokens: reportedLimit, reportedLimit };
        }
        const nextTokens = Math.min( Math.floor( currentTokens / 2 ), 131072 );
        return nextTokens > 0 ? { nextTokens } : undefined;
    }

    private __ReadStructuredLimit ( value: unknown, depth: number ): number | undefined {
        if ( depth > 6 || typeof value !== `object` || value === null ) {
            return undefined;
        }
        if ( Array.isArray( value ) ) {
            for ( const entry of value.slice( 0, 100 ) ) {
                const limit = this.__ReadStructuredLimit( entry, depth + 1 );
                if ( limit !== undefined ) {
                    return limit;
                }
            }
            return undefined;
        }
        const record = value as Record<string, unknown>;
        if ( Array.isArray( record.loc ) && record.loc.includes( `max_tokens` ) &&
            typeof record.ctx === `object` && record.ctx !== null ) {
            const constraint = record.ctx as Record<string, unknown>;
            if ( typeof constraint.le === `number` ) {
                return constraint.le;
            }
            if ( typeof constraint.lt === `number` ) {
                return constraint.lt - 1;
            }
        }
        return this.__ReadStructuredLimit( record.detail ?? record.error, depth + 1 );
    }
}
