import { describe, expect, it, vi } from 'vitest';
import { fetchModels } from './fetchModels.js';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const chatModel = {
    id: 'mistral-large-latest',
    type: 'base',
    name: 'Mistral Large',
    description: 'Flagship model',
    maxContextLength: 128000,
    defaultModelTemperature: 0.7,
    aliases: [],
    capabilities: { completionChat: true, functionCalling: true, vision: true },
};

const embedModel = {
    id: 'mistral-embed',
    type: 'base',
    name: null,
    description: null,
    maxContextLength: 8192,
    defaultModelTemperature: null,
    aliases: [],
    capabilities: { completionChat: false, functionCalling: false, vision: false },
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
        const [ m ] = await fetchModels( mockClient( [ chatModel ] ), log );
        expect( m.name ).toBe( 'Mistral Large' );
        expect( m.detail ).toBe( 'Flagship model' );
        expect( m.maxInputTokens ).toBe( 128000 );
        expect( m.maxOutputTokens ).toBe( 16384 );
        expect( m.toolCalling ).toBe( true );
        expect( m.supportsParallelToolCalls ).toBe( true );
        expect( m.supportsVision ).toBe( true );
        expect( m.temperature ).toBe( 0.7 );
    } );

    it( 'falls back to formatModelName when name is null', async () => {
        const noName = { ...chatModel, name: null };
        const [ m ] = await fetchModels( mockClient( [ noName ] ), log );
        expect( m.name ).toBe( 'Mistral Large' );
    } );

    it( 'applies MODEL_OUTPUT_LIMITS for known model IDs', async () => {
        const small = { ...chatModel, id: 'mistral-small-latest', name: 'Mistral Small' };
        const [ m ] = await fetchModels( mockClient( [ small ] ), log );
        expect( m.maxOutputTokens ).toBe( 4096 );
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

    it( 'deduplicates display names with model ID suffix when ambiguous', async () => {
        const a = { ...chatModel, id: 'model-a', name: 'Same Name' };
        const b = { ...chatModel, id: 'model-b', name: 'Same Name' };
        const models = await fetchModels( mockClient( [ a, b ] ), log );
        expect( models.every( m => m.name.includes( m.id ) ) ).toBe( true );
    } );
} );
