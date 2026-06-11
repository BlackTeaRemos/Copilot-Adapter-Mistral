import pricing from '../pricing.json' with { type: 'json' };

export type ModelPricing = {
    label: string;
    inputPer1M: number;
    outputPer1M: number;
    tier: string;
    priceCategory: string;
};

const CACHE_RATIO = 0.10;

export function getModelPricing ( modelId: string ): ModelPricing | undefined {
    const id = modelId.toLowerCase();
    return pricing.models.find( entry => {
        return id === entry.match || id.startsWith( entry.match );
    } ) as ModelPricing | undefined;
}

export function formatPricingDetail ( p: ModelPricing ): string {
    const fmt = ( n: number ) => {
        return n < 0.10 ? `$${ n.toFixed( 3 ) }` : `$${ n.toFixed( 2 ) }`;
    };
    const cacheIn = p.inputPer1M * CACHE_RATIO;
    return `${ fmt( p.inputPer1M ) } in / ${ fmt( p.outputPer1M ) } out / ${ fmt( cacheIn ) } cached per 1M · ${ p.tier }`;
}
