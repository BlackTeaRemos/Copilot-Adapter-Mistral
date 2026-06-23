import { beforeEach, describe, expect, it } from 'vitest';
import { CapabilityModelStore, familyPrefix, pickCanonical } from './modelStore.js';
import type { MistralModel } from '../types.js';

function model ( id: string, over: Partial<MistralModel> = {} ): MistralModel {
    return {
        id,
        name: id,
        maxInputTokens: 32768,
        maxOutputTokens: 4096,
        defaultCompletionTokens: 4096,
        toolCalling: false,
        supportsParallelToolCalls: false,
        supportsVision: false,
        supportsCompletionFim: false,
        completionChat: true,
        ...over,
    };
}

describe( `familyPrefix`, () => {
    it( `strips a trailing -latest segment`, () => {
        expect( familyPrefix( `mistral-large-latest` ) ).toBe( `mistral-large` );
    } );

    it( `strips a trailing 4-digit date stamp`, () => {
        expect( familyPrefix( `mistral-large-2512` ) ).toBe( `mistral-large` );
    } );

    it( `leaves ids without a latest/date suffix untouched`, () => {
        expect( familyPrefix( `codestral` ) ).toBe( `codestral` );
    } );

    it( `only strips the final segment, not embedded digits`, () => {
        expect( familyPrefix( `mistral-medium-3` ) ).toBe( `mistral-medium-3` );
    } );
} );

describe( `pickCanonical`, () => {
    it( `picks the higher date-stamped version`, () => {
        expect( pickCanonical( [ `mistral-large-2055`, `mistral-large-2103` ] ) ).toBe( `mistral-large-2103` );
    } );

    it( `picks the higher semver`, () => {
        expect( pickCanonical( [ `mistral-medium-3.1`, `mistral-medium-3.5` ] ) ).toBe( `mistral-medium-3.5` );
    } );

    it( `picks the highest numeric version`, () => {
        expect( pickCanonical( [ `m-3`, `m-3-5`, `m-3.5`, `m-c21211-r0-75` ] ) ).toBe( `m-c21211-r0-75` );
    } );

    it( `picks a versioned id over a non-versioned one`, () => {
        expect( pickCanonical( [ `mistral-large-2512`, `mistral-large-latest` ] ) ).toBe( `mistral-large-2512` );
    } );

    it( `returns the sole id for a singleton list`, () => {
        expect( pickCanonical( [ `only-one` ] ) ).toBe( `only-one` );
    } );
} );

describe( `CapabilityModelStore`, () => {
    let store: CapabilityModelStore;

    beforeEach( () => {
        store = CapabilityModelStore.getInstance();
        store.clear();
    } );

    it( `getInstance returns a singleton`, () => {
        expect( CapabilityModelStore.getInstance() ).toBe( store );
    } );

    it( `keeps only the canonical model per family`, () => {
        store.insertModel( model( `mistral-large-2103` ) );
        store.insertModel( model( `mistral-large-2512` ) );
        const all = store.getAllModels();
        expect( all ).toHaveLength( 1 );
        expect( all[ 0 ].id ).toBe( `mistral-large-2512` );
    } );

    it( `ignores insertion order when picking the canonical`, () => {
        store.insertModel( model( `mistral-large-2512` ) );
        store.insertModel( model( `mistral-large-2103` ) );
        expect( store.getAllModels().map( m => {
            return m.id;
        } ) ).toEqual( [ `mistral-large-2512` ] );
    } );

    it( `picks versioned id over latest-suffixed id`, () => {
        store.insertModel( model( `mistral-large-latest` ) );
        store.insertModel( model( `mistral-large-2512` ) );
        const all = store.getAllModels();
        expect( all ).toHaveLength( 1 );
        expect( all[ 0 ].id ).toBe( `mistral-large-2512` );
    } );

    it( `indexes models by capability`, () => {
        store.insertModel( model( `a-latest`, { toolCalling: true, supportsVision: true } ) );
        store.insertModel( model( `b-latest`, { supportsCompletionFim: true } ) );
        expect( store.getModelsWithToolCalling().map( m => {
            return m.id;
        } ) ).toEqual( [ `a-latest` ] );
        expect( store.getModelsWithVision().map( m => {
            return m.id;
        } ) ).toEqual( [ `a-latest` ] );
        expect( store.getModelsWithCompletionFim().map( m => {
            return m.id;
        } ) ).toEqual( [ `b-latest` ] );
    } );

    it( `getChatModels returns models flagged completionChat`, () => {
        store.insertModel( model( `chat-latest`, { completionChat: true } ) );
        store.insertModel( model( `embed-latest`, { completionChat: false } ) );
        expect( store.getChatModels().map( m => {
            return m.id;
        } ) ).toEqual( [ `chat-latest` ] );
    } );

    it( `clear empties every index`, () => {
        store.insertModel( model( `a-latest`, { toolCalling: true } ) );
        store.clear();
        expect( store.getAllModels() ).toEqual( [] );
        expect( store.getModelsWithToolCalling() ).toEqual( [] );
    } );
} );
