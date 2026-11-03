import type { Mistral } from '@mistralai/mistralai';
import type { ExtensionContext } from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderBudgetFixture } from './providerBudgetFixture.js';
import { DeferredValue } from './deferredValue.js';
import type { MistralModel } from '../../types.js';

vi.mock( `../../tokenizer/mistralTokenizer.js`, () => {
    return { getMistralTokenizer: vi.fn().mockReturnValue( null ) };
} );

const CARD = {
    id: `test-model`, type: `base`, name: `Test Model`,
    maxContextLength: 128000,
    capabilities: { completionChat: true, functionCalling: false },
};

describe( `provider model refresh ownership`, () => {
    let fixture: ProviderBudgetFixture;
    let state: { client: Mistral; context: ExtensionContext; fetchedModels: MistralModel[] | null };

    beforeEach( () => {
        fixture = new ProviderBudgetFixture();
        vi.mocked( fixture.provider.fetchModels ).mockRestore();
        state = fixture.provider as unknown as typeof state;
    } );
    afterEach( () => {
        fixture.provider.dispose();
        vi.restoreAllMocks();
    } );

    it( `coalesces overlapping catalog refreshes for the same client`, async () => {
        const response = new DeferredValue<{ data: unknown[] }>();
        const list = vi.fn().mockReturnValue( response.promise );
        state.client = { models: { list }, chat: { stream: fixture.stream } } as unknown as Mistral;
        const first = fixture.provider.fetchModels();
        const second = fixture.provider.fetchModels();
        response.Resolve( { data: [ CARD ] } );
        const [ firstModels, secondModels ] = await Promise.all( [ first, second ] );
        expect( list ).toHaveBeenCalledTimes( 1 );
        expect( firstModels ).toBe( secondModels );
    } );

    it( `does not publish an old client's catalog after credentials change`, async () => {
        const response = new DeferredValue<{ data: unknown[] }>();
        state.client = { models: { list: vi.fn().mockReturnValue( response.promise ) } } as unknown as Mistral;
        const pending = fixture.provider.fetchModels();
        state.client = { models: { list: vi.fn() }, chat: { stream: fixture.stream } } as unknown as Mistral;
        response.Resolve( { data: [ CARD ] } );
        expect( await pending ).toEqual( [] );
        expect( state.fetchedModels ).toBeNull();
        expect( state.context.globalState.update ).not.toHaveBeenCalled();
    } );

    it( `keeps successful requests usable when metadata and calibration cache writes fail`, async () => {
        vi.mocked( state.context.globalState.update ).mockRejectedValue( new Error( `Storage full` ) );
        state.client = {
            models: { list: vi.fn().mockResolvedValue( { data: [ CARD ] } ) },
            chat: { stream: fixture.stream },
        } as unknown as Mistral;
        await fixture.Request();
        await Promise.resolve();
        expect( fixture.stream ).toHaveBeenCalledTimes( 1 );
        expect( fixture.Text() ).toBe( `Partial answer` );
        expect( fixture.log.warn ).toHaveBeenCalledWith( expect.stringContaining( `Model cache could not be saved` ) );
        expect( fixture.log.warn ).toHaveBeenCalledWith( expect.stringContaining( `Tokenizer calibration could not be saved` ) );
    } );
} );
