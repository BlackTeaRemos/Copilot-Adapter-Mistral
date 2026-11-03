import type { MistralModel } from '../../types.js';
import type { MistralChatModelInformation } from '../../_future_/mistralChatModelInformation.js';
import { getModelPricing, formatPricingDetail } from '../modelPricing.js';
import { proposedModelInfoFields } from '../../_future_/proposedModelData.js';

export function getChatModelInfo ( model: MistralModel, isDefault = false ): MistralChatModelInformation {
    const pricing = getModelPricing( model.id );
    return {
        id: model.id,
        name: model.name,
        family: `mistral`,
        detail: pricing ? pricing.tier : `Mistral AI`,
        pricing: pricing ? formatPricingDetail( pricing ) : undefined,
        priceCategory: pricing?.priceCategory,
        inputCost: pricing ? Math.round( pricing.inputPer1M * 100 * 1e6 ) / 1e6 : undefined,
        outputCost: pricing ? Math.round( pricing.outputPer1M * 100 * 1e6 ) / 1e6 : undefined,
        cacheCost: pricing ? Math.round( ( pricing.cacheInputPer1M ?? pricing.inputPer1M * 0.10 ) * 100 * 1e6 ) / 1e6 : undefined,
        maxInputTokens: model.maxInputTokens,
        maxOutputTokens: model.maxOutputTokens,
        maxContextWindowTokens: model.maxContextWindowTokens,
        version: model.id,
        ...proposedModelInfoFields( model, isDefault ),
    };
}
