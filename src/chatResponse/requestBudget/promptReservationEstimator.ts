import type { MistralMessage } from '../../types.js';
import type { PromptTokenCounter } from './promptTokenCounter.js';
import type { PromptReservation } from './promptReservation.js';

export class PromptReservationEstimator {
    public Estimate (
        modelId: string,
        messages: readonly MistralMessage[],
        tools: readonly unknown[] | undefined,
        selectedInputTokens: number,
        counter: PromptTokenCounter,
    ): PromptReservation {
        const hasImages = messages.some( message => {
            return Array.isArray( message.content ) && message.content.some( part => {
                return part.type === `image_url`;
            } );
        } );
        if ( hasImages ) {
            return { tokens: selectedInputTokens, source: `selected input allowance` };
        }
        const serializedTokens = counter.Count( modelId, JSON.stringify( { messages, tools } ) );
        if ( !Number.isSafeInteger( serializedTokens ) || serializedTokens < 0 ) {
            throw new TypeError( `[Mistral] Prompt token estimate must be a finite nonnegative safe integer.` );
        }
        const estimatedTokens = Math.ceil( serializedTokens * 1.2 ) + messages.length * 16 + 256;
        return estimatedTokens >= selectedInputTokens
            ? { tokens: selectedInputTokens, source: `selected input allowance` }
            : { tokens: estimatedTokens, source: `estimated prompt` };
    }
}
