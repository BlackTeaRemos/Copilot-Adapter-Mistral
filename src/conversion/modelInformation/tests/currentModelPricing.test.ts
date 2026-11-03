import { describe, expect, it } from 'vitest';
import { formatPricingDetail, getModelPricing } from '../../modelPricing.js';
import { getChatModelInfo } from '../getChatModelInfo.js';
import { CreateSelectionModel } from '../../../modelSelection/tests/createSelectionModel.js';

describe( `current public model pricing`, () => {
    it( `uses Flash pricing independently of the similarly named GLM model`, () => {
        expect( getModelPricing( `zai-glm-5-3` )?.outputPer1M ).toBe( 4.4 );
        expect( getModelPricing( `zai-glm-5-3-flash` )?.outputPer1M ).toBe( 0.5 );
        expect( getModelPricing( `zai-glm-5-3-unverified` ) ).toBeUndefined();
    } );

    it( `publishes the documented Flash cached-input price rather than assuming ten percent`, () => {
        const model = CreateSelectionModel( `zai-glm-5-3-flash` );
        const information = getChatModelInfo( model );
        expect( information.cacheCost ).toBe( 3 );
        expect( information.pricing ).toContain( `$0.030 cached` );
    } );

    it( `preserves the existing fallback calculation when a cached-input rate is unavailable`, () => {
        expect( formatPricingDetail( {
            label: `Model`, inputPer1M: 1, outputPer1M: 2, tier: `Code`, priceCategory: `low`,
        } ) ).toContain( `$0.10 cached` );
    } );
} );
