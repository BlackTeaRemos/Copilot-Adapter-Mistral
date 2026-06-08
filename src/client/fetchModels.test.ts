import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchModels, pickCanonical } from './fetchModels.js';
import { CapabilityModelStore } from './modelStore.js';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach( () => {
    CapabilityModelStore.getInstance().clear();
} );

const chatModel = {
    id: 'mistral-large-latest',
    type: 'base',
    name: 'Mistral Large',
    description: 'Flagship model',
    maxContextLength: 128000,
    defaultModelTemperature: 0.7,
    aliases: [],
    capabilities: { completionChat: true, functionCalling: true, vision: true, completionFim: true },
};

const embedModel = {
    id: 'mistral-embed',
    type: 'base',
    name: null,
    description: null,
    maxContextLength: 8192,
    defaultModelTemperature: null,
    aliases: [],
    capabilities: { completionChat: false, functionCalling: false, vision: false, completionFim: false },
};

function mockClient ( data: unknown[] ) {
    return { models: { list: vi.fn().mockResolvedValue( { data } ) } } as any;
}

describe( 'fetchModels', () => {
    it( 'filters out models without completionChat', async () => {
        const models = await fetchModels( mockClient( [ chatModel, embedModel ] ), log );
        expect( models ).toHaveLength( 1 );
        expect( models[ 0 ].id ).toBe( 'mistral-large-latest' );
    } );

    it( 'maps API fields to MistralModel', async () => {
        const [ model ] = await fetchModels( mockClient( [ chatModel ] ), log );
        expect( model.name ).toBe( 'Mistral Large' );
        expect( model.detail ).toBe( 'Flagship model' );
        expect( model.maxInputTokens ).toBe( 128000 );
        expect( model.maxOutputTokens ).toBe( 16384 );
        expect( model.toolCalling ).toBe( true );
        expect( model.supportsParallelToolCalls ).toBe( true );
        expect( model.supportsVision ).toBe( true );
        expect( model.supportsCompletionFim ).toBe( true );
        expect( model.temperature ).toBe( 0.7 );
    } );

    it( 'falls back to formatModelName when name is null', async () => {
        const noName = { ...chatModel, name: null };
        const [ model ] = await fetchModels( mockClient( [ noName ] ), log );
        expect( model.name ).toBe( 'Mistral Large' );
    } );

    it( 'applies MODEL_OUTPUT_LIMITS for known model IDs', async () => {
        const small = { ...chatModel, id: 'mistral-small-latest', name: 'Mistral Small' };
        const [ model ] = await fetchModels( mockClient( [ small ] ), log );
        expect( model.maxOutputTokens ).toBe( 4096 );
    } );

    it( 'returns empty array on API error', async () => {
        const client = { models: { list: vi.fn().mockRejectedValue( new Error( 'network' ) ) } } as any;
        const models = await fetchModels( client, log );
        expect( models ).toEqual( [] );
    } );

    it( 'returns empty array for empty data', async () => {
        expect( await fetchModels( mockClient( [] ), log ) ).toEqual( [] );
    } );

    it( 'prefers latest variant within family', async () => {
        const versioned = { ...chatModel, id: 'mistral-large-2512' };
        const models = await fetchModels( mockClient( [ chatModel, versioned ] ), log );
        expect( models ).toHaveLength( 1 );
        expect( models[ 0 ].id ).toBe( 'mistral-large-latest' );
    } );

    it( 'deduplicates models with the same name to one', async () => {
        const a = { ...chatModel, id: 'model-a-latest', name: 'Same Name' };
        const b = { ...chatModel, id: 'model-b', name: 'Same Name' };
        const models = await fetchModels( mockClient( [ a, b ] ), log );
        expect( models ).toHaveLength( 1 );
        expect( models[ 0 ].id ).toBe( 'model-a-latest' );
    } );

    it( 'deduplicates models with the same name to latest', async () => {
        const codestralLatest = { ...chatModel, id: 'codestral-latest', name: 'Codestral' };
        const mistralCodeFimLatest = { ...chatModel, id: 'mistral-code-fim-latest', name: 'Codestral' };
        const mistralCodeLatest = { ...chatModel, id: 'mistral-code-latest', name: 'Codestral' };

        const models = await fetchModels( mockClient( [ codestralLatest, mistralCodeFimLatest, mistralCodeLatest ] ), log );

        // Only the latest model (canonical) should be returned.
        expect( models ).toHaveLength( 1 );
        expect( models[ 0 ].id ).toBe( 'codestral-latest' );
    } );

    it( 'deduplicates models with the same name to latest', async () => {
        const mistralMediumLatest = { ...chatModel, id: 'mistral-medium-latest', name: 'Mistral Medium' };
        const mistralVibeCliWithTools = { ...chatModel, id: 'mistral-vibe-cli-with-tools', name: 'Mistral Medium' };

        const models = await fetchModels( mockClient( [ mistralMediumLatest, mistralVibeCliWithTools ] ), log );

        // Only the latest model should be returned.
        expect( models ).toHaveLength( 1 );
        expect( models[ 0 ].id ).toBe( 'mistral-medium-latest' );
    } );

    it( 'deduplicates models with versioned IDs to latest', async () => {
        const mistralMedium35 = { ...chatModel, id: 'mistral-medium-3-5', name: 'Mistral Medium 3 5' };
        const mistralMedium35Latest = { ...chatModel, id: 'mistral-medium-3.5', name: 'Mistral Medium 3 5' };
        const mistralMedium3 = { ...chatModel, id: 'mistral-medium-3', name: 'Mistral Medium 3 5' };
        const mistralMediumC21211R075 = { ...chatModel, id: 'mistral-medium-c21211-r0-75', name: 'Mistral Medium 3 5' };
        const mistralVibeCliLatest = { ...chatModel, id: 'mistral-vibe-cli-latest', name: 'Mistral Medium 3 5' };

        const models = await fetchModels( mockClient( [ mistralMedium35, mistralMedium35Latest, mistralMedium3, mistralMediumC21211R075, mistralVibeCliLatest ] ), log );

        // Only the latest model should be returned.
        expect( models ).toHaveLength( 1 );
        expect( models[ 0 ].id ).toBe( 'mistral-vibe-cli-latest' );
    } );

    it( 'pickCanonical selects the latest model', () => {
        // Test with a latest model.
        expect( pickCanonical( [ 'codestral-latest', 'mistral-code-fim-latest', 'mistral-code-latest' ] ) ).toBe( 'codestral-latest' );

        // Test with versioned models.
        expect( pickCanonical( [ 'mistral-medium-3-5', 'mistral-medium-3.5', 'mistral-medium-3', 'mistral-medium-c21211-r0-75', 'mistral-vibe-cli-latest' ] ) ).toBe( 'mistral-vibe-cli-latest' );

        // Test with versioned models without a latest model.
        expect( pickCanonical( [ 'mistral-medium-3-5', 'mistral-medium-3.5', 'mistral-medium-3', 'mistral-medium-c21211-r0-75' ] ) ).toBe( 'mistral-medium-c21211-r0-75' );
    } );
} );
