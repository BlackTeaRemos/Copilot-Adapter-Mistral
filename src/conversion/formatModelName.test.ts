import { describe, expect, it } from 'vitest';
import { formatModelName } from './formatModelName.js';
import { getChatModelInfo } from './modelInformation/getChatModelInfo.js';

describe( `formatModelName`, () => {
    it( `capitalises single segment`, () => {
        expect( formatModelName( `mistral` ) ).toBe( `Mistral` );
    } );

    it( `capitalises each hyphen-separated segment and strips the latest marker`, () => {
        expect( formatModelName( `mistral-large-latest` ) ).toBe( `Mistral Large` );
    } );

    it( `strips trailing date-stamp segments`, () => {
        expect( formatModelName( `devstral-small-2505` ) ).toBe( `Devstral Small` );
    } );
} );

describe( `getChatModelInfo`, () => {
    const base = {
        id: `mistral-large-latest`,
        name: `Mistral Large`,
        maxInputTokens: 128000,
        maxOutputTokens: 16384,
        defaultCompletionTokens: 65536,
        toolCalling: true,
        supportsParallelToolCalls: true,
        supportsVision: true,
        supportsCompletionFim: false,
        completionChat: true,
    };

    it( `maps all fields`, () => {
        const info = getChatModelInfo( base );
        expect( info.id ).toBe( `mistral-large-latest` );
        expect( info.name ).toBe( `Mistral Large` );
        expect( info.family ).toBe( `mistral` );
        expect( info.maxInputTokens ).toBe( 128000 );
        expect( info.maxOutputTokens ).toBe( 16384 );
        expect( info.capabilities?.toolCalling ).toBe( true );
        expect( info.capabilities?.imageInput ).toBe( true );
    } );

    it( `omits tooltip so detail field shows in chat picker`, () => {
        expect( getChatModelInfo( { ...base, detail: `Latest flagship` } ).tooltip ).toBeUndefined();
    } );

    it( `imageInput false when supportsVision false`, () => {
        expect( getChatModelInfo( { ...base, supportsVision: false } ).capabilities?.imageInput ).toBe( false );
    } );

    it( `imageInput false when supportsVision undefined`, () => {
        const { supportsVision: _, ...noVision } = base;
        expect( getChatModelInfo( noVision ).capabilities?.imageInput ).toBe( false );
    } );

    it( `uses tier for detail field instead of pricing`, () => {
        const modelWithPricing = getChatModelInfo( {
            ...base,
            id: `mistral-large-latest`,
        } );
        expect( modelWithPricing.detail ).toBe( `Flagship` );
        expect( modelWithPricing.pricing ).toContain( `Flagship` );
    } );

    it( `uses Mistral AI for detail when no pricing available`, () => {
        const modelWithoutPricing = getChatModelInfo( {
            ...base,
            id: `nonexistent-model`,
        } );
        expect( modelWithoutPricing.detail ).toBe( `Mistral AI` );
        expect( modelWithoutPricing.pricing ).toBeUndefined();
    } );
} );
