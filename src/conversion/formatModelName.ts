import type { LanguageModelChatInformation } from 'vscode';
import type { MistralModel } from '../types.js';
import { getModelPricing, formatPricingDetail } from './modelPricing.js';

export function formatModelName ( id: string ): string {
    return id
        .split( '-' )
        .filter( word => !/^\d{4}$/.test( word ) && word.toLowerCase() !== 'latest' )
        .map( word => word.charAt( 0 ).toUpperCase() + word.slice( 1 ) )
        .join( ' ' );
}

export function getChatModelInfo ( model: MistralModel ): LanguageModelChatInformation {
    const p = getModelPricing( model.id );
    // 1 AIC = $0.01 → $X per 1M tokens = X * 100 AICs per 1M tokens
    const usdToAic = ( usd: number ) => Math.round( usd * 100 * 1e6 ) / 1e6;
    return {
        id: model.id,
        name: model.name,
        family: 'mistral',
        detail: p ? p.tier : 'Mistral AI',
        pricing: p ? formatPricingDetail( p ) : undefined,
        priceCategory: p?.priceCategory,
        inputCost: p ? usdToAic( p.inputPer1M ) : undefined,
        outputCost: p ? usdToAic( p.outputPer1M ) : undefined,
        cacheCost: p ? usdToAic( p.inputPer1M * 0.10 ) : undefined,
        maxInputTokens: model.maxInputTokens,
        maxOutputTokens: model.maxOutputTokens,
        version: '1.0.0',
        capabilities: {
            toolCalling: model.toolCalling,
            imageInput: model.supportsVision ?? false,
        },
    } as unknown as LanguageModelChatInformation;
}
