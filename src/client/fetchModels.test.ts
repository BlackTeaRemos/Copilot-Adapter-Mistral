import type { Mistral } from '@mistralai/mistralai';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchModels } from './fetchModels.js';
import { CapabilityModelStore } from './modelStore.js';
import { CreateAuthoredModelCards } from './modelDiscovery/createAuthoredModelCards.js';

const AUTHORED_IDS = CreateAuthoredModelCards().map( card => {
    return card.id;
} );

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach( () => {
    CapabilityModelStore.getInstance().clear();
} );

const chatModel = {
    id: `mistral-large-latest`,
    type: `base`,
    name: `Mistral Large`,
    description: `Flagship model`,
    maxContextLength: 128000,
    defaultModelTemperature: 0.7,
    aliases: [],
    capabilities: { completionChat: true, functionCalling: true, vision: true, completionFim: true },
};

const embedModel = {
    id: `mistral-embed`,
    type: `base`,
    name: null,
    description: null,
    maxContextLength: 8192,
    defaultModelTemperature: null,
    aliases: [],
    capabilities: { completionChat: false, functionCalling: false, vision: false, completionFim: false },
};

function CreateMockClient ( data: unknown[] ): Mistral {
    return { models: { list: vi.fn().mockResolvedValue( { data } ) } } as unknown as Mistral;
}

describe( `fetchModels`, () => {
    it( `filters out models without completionChat while retaining the authored card`, async () => {
        const models = await fetchModels( CreateMockClient( [ chatModel, embedModel ] ), log );
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( [ ...AUTHORED_IDS, `mistral-large-latest` ] );
    } );

    it( `maps API fields to MistralModel`, async () => {
        const models = await fetchModels( CreateMockClient( [ chatModel ] ), log );
        const model = models.find( candidate => {
            return candidate.id === chatModel.id;
        } );
        if ( !model ) {
            throw new Error( `Expected the discovered chat model` );
        }
        expect( model.name ).toBe( `Mistral Large` );
        expect( model.detail ).toBe( `Flagship model` );
        expect( model.maxInputTokens ).toBe( 123904 );
        expect( model.maxContextWindowTokens ).toBe( 128000 );
        expect( model.maxOutputTokens ).toBe( 127999 );
        expect( model.toolCalling ).toBe( true );
        expect( model.supportsParallelToolCalls ).toBe( true );
        expect( model.supportsVision ).toBe( true );
        expect( model.supportsCompletionFim ).toBe( true );
        expect( model.temperature ).toBe( 0.7 );
    } );

    it( `falls back to formatModelName when name is null`, async () => {
        const models = await fetchModels( CreateMockClient( [ { ...chatModel, name: null } ] ), log );
        expect( models.find( model => {
            return model.id === chatModel.id;
        } )?.name ).toBe( `Mistral Large` );
    } );

    it( `does not use a legacy rolling alias as an independent output ceiling`, async () => {
        const small = { ...chatModel, id: `mistral-small-latest`, name: `Mistral Small` };
        const models = await fetchModels( CreateMockClient( [ small ] ), log );
        expect( models.find( model => {
            return model.id === small.id;
        } )?.maxOutputTokens ).toBe( 127999 );
    } );

    it( `returns empty array on API error`, async () => {
        const client = { models: { list: vi.fn().mockRejectedValue( new Error( `network` ) ) } } as unknown as Mistral;
        const models = await fetchModels( client, log );
        expect( models ).toEqual( [] );
    } );

    it( `retains the locally authored card when the API returns no models`, async () => {
        const models = await fetchModels( CreateMockClient( [] ), log );
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( AUTHORED_IDS );
    } );

    it( `preserves distinct releases instead of guessing canonical identity from suffixes`, async () => {
        const versioned = { ...chatModel, id: `mistral-large-2512` };
        const models = await fetchModels( CreateMockClient( [ chatModel, versioned ] ), log );
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( [ ...AUTHORED_IDS, chatModel.id, `mistral-large-2512` ] );
    } );

    it( `keeps distinct model families with the same display name`, async () => {
        const firstModel = { ...chatModel, id: `model-a-latest`, name: `Same Name` };
        const secondModel = { ...chatModel, id: `model-b`, name: `Same Name` };
        const models = await fetchModels( CreateMockClient( [ firstModel, secondModel ] ), log );
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( [ ...AUTHORED_IDS, firstModel.id, secondModel.id ] );
    } );

    it( `keeps the distinct Codestral catalog entries`, async () => {
        const codestral = { ...chatModel, id: `codestral-latest`, name: `Codestral` };
        const codeFim = { ...chatModel, id: `mistral-code-fim-latest`, name: `Codestral` };
        const code = { ...chatModel, id: `mistral-code-latest`, name: `Codestral` };
        const models = await fetchModels( CreateMockClient( [ codestral, codeFim, code ] ), log );
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( [ ...AUTHORED_IDS, codestral.id, codeFim.id, code.id ] );
    } );

    it( `keeps a Vibe model distinct from the Medium family`, async () => {
        const medium = { ...chatModel, id: `mistral-medium-latest`, name: `Mistral Medium` };
        const vibe = { ...chatModel, id: `mistral-vibe-cli-with-tools`, name: `Mistral Medium` };
        const models = await fetchModels( CreateMockClient( [ medium, vibe ] ), log );
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( [ ...AUTHORED_IDS, medium.id, vibe.id ] );
    } );

    it( `keeps independent versioned families instead of collapsing their display names`, async () => {
        const identifiers = [
            `mistral-medium-3-5`, `mistral-medium-3.5`, `mistral-medium-3`,
            `mistral-medium-c21211-r0-75`, `mistral-vibe-cli-latest`,
        ];
        const models = await fetchModels( CreateMockClient( identifiers.map( identifier => {
            return { ...chatModel, id: identifier, name: `Mistral Medium 3 5` };
        } ) ), log );
        expect( models.map( model => {
            return model.id;
        } ) ).toEqual( [ ...AUTHORED_IDS, ...identifiers.slice( 1 ) ] );
    } );

} );
