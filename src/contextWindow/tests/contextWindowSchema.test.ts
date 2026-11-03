import { describe, expect, it } from 'vitest';
import { ContextWindowSchemaBuilder } from '../contextWindowSchemaBuilder.js';
import { BuildConfigurationSchema } from '../../_future_/modelConfiguration/buildConfigurationSchema.js';
import { getChatModelInfo } from '../../conversion/modelInformation/getChatModelInfo.js';

const MODEL = {
    id: `test-model`, name: `Test Model`,
    maxContextWindowTokens: 128000, maxInputTokens: 111616, maxOutputTokens: 16384,
    defaultCompletionTokens: 4096,
    toolCalling: true, supportsParallelToolCalls: true, supportsVision: true,
    supportsCompletionFim: false, completionChat: true,
};

describe( `native context configuration`, () => {
    it( `uses the native contextSize key and tokens group`, () => {
        const schema = BuildConfigurationSchema( MODEL );
        const property = schema.properties.contextSize;
        const expectedChoices = [ 8192, 16384, 32768, 65536, 111616 ];
        expect( property.type ).toBe( `integer` );
        expect( property.title ).toBe( `Context Size` );
        expect( property.group ).toBe( `tokens` );
        expect( property.default ).toBe( 111616 );
        expect( property.maximum ).toBe( 111616 );
        expect( property.enum ).toEqual( expectedChoices );
        expect( property.enumItemLabels ).toHaveLength( expectedChoices.length );
        expect( property.enumDescriptions ).toHaveLength( expectedChoices.length );
    } );

    it( `does not duplicate a preset that equals the full allowance`, () => {
        expect( new ContextWindowSchemaBuilder().Build( 32768 )?.enum ).toEqual( [ 8192, 16384, 32768 ] );
    } );

    it( `omits a selector when there is only one useful choice`, () => {
        expect( BuildConfigurationSchema( { ...MODEL, maxInputTokens: 4096 } ).properties ).not.toHaveProperty( `contextSize` );
    } );

    it( `publishes the total window independently from input and output limits`, () => {
        const information = getChatModelInfo( MODEL );
        expect( information.maxContextWindowTokens ).toBe( 128000 );
        expect( information.maxInputTokens ).toBe( 111616 );
        expect( information.maxOutputTokens ).toBe( 16384 );
        expect( information.maxInputTokens + information.maxOutputTokens ).toBe( 128000 );
        expect( information.configurationSchema?.properties.contextSize.default ).toBe( 111616 );
    } );

    it( `preserves the existing sampling controls and inherited output budget`, () => {
        const properties = BuildConfigurationSchema( MODEL ).properties;
        expect( properties.temperature.default ).toBe( 0.7 );
        expect( properties.topP.default ).toBe( 1 );
        expect( properties.safePrompt.default ).toBe( false );
        expect( properties.maxTokens ).not.toHaveProperty( `default` );
        expect( properties.maxTokens.maximum ).toBe( 16384 );
    } );
} );
