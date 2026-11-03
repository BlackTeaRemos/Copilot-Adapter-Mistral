import type { MistralModel } from '../../types.js';
import { MODEL_OUTPUT_LIMITS } from '../../types.js';
import { formatModelName } from '../../conversion/index.js';
import { ContextWindowResolver } from '../../contextWindow/contextWindowResolver.js';
import type { KnownModelCard } from './knownModelCard.js';

export class ModelCardConverter {
    private readonly _contextResolver = new ContextWindowResolver();

    public Convert ( card: KnownModelCard ): MistralModel {
        const outputLimit = this.__ResolveOutputLimit( card );
        const limits = this._contextResolver.ResolveLimits( card.maxContextLength ?? 32768, outputLimit );
        return {
            id: card.id,
            name: card.name?.trim() || formatModelName( card.id ),
            aliases: card.aliases?.filter( alias => {
                return typeof alias === `string` && alias.length > 0;
            } ),
            deprecationDate: card.deprecation?.toISOString(),
            deprecationReplacementModel: card.deprecationReplacementModel ?? undefined,
            outputLimitSource: Object.hasOwn( MODEL_OUTPUT_LIMITS, card.id.toLowerCase() )
                ? `documented model limit`
                : card.aliases?.some( alias => {
                    return Object.hasOwn( MODEL_OUTPUT_LIMITS, alias.toLowerCase() );
                } ) ? `API-declared alias` : `context window`,
            detail: card.description ?? undefined,
            ...limits,
            defaultCompletionTokens: limits.maxOutputTokens,
            toolCalling: card.capabilities?.functionCalling ?? false,
            supportsParallelToolCalls: card.capabilities?.functionCalling ?? false,
            supportsVision: card.capabilities?.vision ?? false,
            supportsCompletionFim: card.capabilities?.completionFim ?? false,
            completionChat: card.capabilities?.completionChat ?? false,
            temperature: card.defaultModelTemperature ?? undefined,
        };
    }

    private __ResolveOutputLimit ( card: KnownModelCard ): number | undefined {
        const identifier = card.id.toLowerCase();
        if ( Object.hasOwn( MODEL_OUTPUT_LIMITS, identifier ) ) {
            return MODEL_OUTPUT_LIMITS[ identifier ];
        }
        let aliasLimit: number | undefined;
        for ( const alias of card.aliases ?? [] ) {
            const normalizedAlias = alias.toLowerCase();
            if ( Object.hasOwn( MODEL_OUTPUT_LIMITS, normalizedAlias ) ) {
                const configuredLimit = MODEL_OUTPUT_LIMITS[ normalizedAlias ];
                aliasLimit = aliasLimit === undefined ? configuredLimit : Math.min( aliasLimit, configuredLimit );
            }
        }
        return aliasLimit;
    }
}
