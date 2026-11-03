import type { UsageInfo } from '@mistralai/mistralai/models/components';
import type { UsageStats } from '../types.js';
import type { StreamLogger } from './streamLogger.js';

export class UsageAccumulator {
    public Record ( snapshot: UsageInfo, usage: UsageStats, log: StreamLogger ): void {
        usage.input = Math.max( usage.input, this.__ReadCount( snapshot.promptTokens ) );
        usage.output = Math.max( usage.output, this.__ReadCount( snapshot.completionTokens ) );
        usage.lastPrompt = usage.input;
        const detail = snapshot[ `prompt_tokens_details` ] ?? snapshot[ `prompt_token_details` ];
        const detailObject = detail !== null && typeof detail === `object`
            ? detail as Record<string, unknown>
            : undefined;
        const cached = this.__ReadCount( detailObject?.[ `cached_tokens` ] ?? snapshot[ `num_cached_tokens` ] );
        usage.cached = Math.max( usage.cached, cached );
        log.trace( `[Mistral] token usage - prompt: ${ usage.input }, completion: ${ usage.output }, cached: ${ usage.cached }` );
    }

    private __ReadCount ( value: unknown ): number {
        return typeof value === `number` && Number.isSafeInteger( value ) && value >= 0 ? value : 0;
    }
}
