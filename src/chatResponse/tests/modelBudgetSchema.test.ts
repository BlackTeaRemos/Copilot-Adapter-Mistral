import { describe, expect, it } from 'vitest';
import { proposedModelInfoFields } from '../../_future_/proposedModelData.js';

describe( `per-model completion budget schema`, () => {
    it( `allows an unset per-model budget to inherit the global setting`, () => {
        const model = {
            id: `test-model`, name: `Test Model`,
            maxInputTokens: 128000, maxOutputTokens: 16384, defaultCompletionTokens: 4096,
            toolCalling: false, supportsParallelToolCalls: false,
            supportsCompletionFim: false, completionChat: true,
        };
        const fields = proposedModelInfoFields( model, false );
        const schema = fields.configurationSchema;
        expect( schema ).toBeDefined();
        if ( !schema ) {
            throw new Error( `Expected the model configuration schema` );
        }
        expect( schema.properties.maxTokens ).not.toHaveProperty( `default` );
        expect( schema.properties.maxTokens.type ).toBe( `integer` );
        expect( schema.properties.maxTokens.minimum ).toBe( 1 );
        expect( schema.properties.maxTokens.maximum ).toBe( 16384 );
    } );
} );
