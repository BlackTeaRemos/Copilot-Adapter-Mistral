import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatResponseSession } from '../chatResponseSession.js';
import { ProviderBudgetFixture } from './providerBudgetFixture.js';
import { DeferredValue } from './deferredValue.js';
import type { Mistral } from '@mistralai/mistralai';
import type { MistralModel } from '../../types.js';

describe( `provider request lifecycle`, () => {
    let fixture: ProviderBudgetFixture;
    beforeEach( () => {
        fixture = new ProviderBudgetFixture();
    } );
    afterEach( () => {
        fixture.provider.dispose();
        vi.restoreAllMocks();
    } );

    it( `does not send an already cancelled request`, async () => {
        fixture.token.isCancellationRequested = true;
        await fixture.Request();
        expect( fixture.stream ).not.toHaveBeenCalled();
        expect( fixture.progress.report ).not.toHaveBeenCalled();
    } );

    it( `does not turn cancellation during streaming into an error response`, async () => {
        fixture.stream.mockImplementationOnce( async () => {
            fixture.token.isCancellationRequested = true;
            throw new Error( `Request aborted` );
        } );
        await fixture.Request();
        expect( fixture.Text() ).toBe( `` );
        expect( fixture.log.error ).not.toHaveBeenCalled();
        expect( fixture.token.onCancellationRequested.mock.results[ 0 ].value.dispose ).toHaveBeenCalled();
    } );

    it( `isolates tool identifiers for overlapping requests awaiting the catalog`, async () => {
        const catalog = new DeferredValue<MistralModel[]>();
        vi.mocked( fixture.provider.fetchModels ).mockReturnValue( catalog.promise );
        const session = vi.spyOn( ChatResponseSession.prototype, `Run` );
        const firstRequest = fixture.Request();
        const secondRequest = fixture.Request();
        catalog.Resolve( [ fixture.model ] );
        await Promise.all( [ firstRequest, secondRequest ] );
        expect( session.mock.calls[ 0 ][ 0 ].toolCallIdMap ).not.toBe( session.mock.calls[ 1 ][ 0 ].toolCallIdMap );
    } );

    it( `preserves a truncation warning when a later stream read fails`, async () => {
        fixture.stream.mockImplementationOnce( async function* () {
            yield { data: { choices: [ { delta: { content: `Partial <` }, finishReason: `length` } ] } };
            throw new Error( `Connection lost` );
        } );
        await fixture.Request();
        expect( fixture.Text() ).toContain( `Partial <` );
        expect( fixture.Text() ).toContain( `Response truncated` );
        expect( fixture.Text() ).toContain( `Connection lost` );
    } );

    it( `does not dispatch through a client replaced while model discovery was pending`, async () => {
        const catalog = new DeferredValue<MistralModel[]>();
        vi.mocked( fixture.provider.fetchModels ).mockReturnValue( catalog.promise );
        const pending = fixture.Request();
        ( fixture.provider as unknown as { client: Mistral } ).client = {} as Mistral;
        catalog.Resolve( [ fixture.model ] );
        await pending;
        expect( fixture.stream ).not.toHaveBeenCalled();
        expect( fixture.progress.report ).not.toHaveBeenCalled();
    } );

    it( `does not replace the interactive model name with a redirected utility model`, async () => {
        await fixture.Request( { requestInitiator: `chat` } );
        fixture.stream.mockImplementationOnce( async function* () {
            yield { data: {
                model: `utility-model-actual`,
                choices: [ { delta: { content: `Title` }, finishReason: `stop` } ],
            } };
        } );
        await fixture.Request( { requestInitiator: `vscode.chat-title` } );
        expect( fixture.provider.currentModelName ).toBe( fixture.model.name );
    } );

    it( `reports an explicit failed-generation finish reason`, async () => {
        fixture.stream.mockImplementationOnce( async function* () {
            yield { data: { choices: [ { delta: { content: `Partial answer` }, finishReason: `error` } ] } };
        } );
        await fixture.Request();
        expect( fixture.Text() ).toContain( `Partial answer` );
        expect( fixture.Text() ).toContain( `generation failed (finish reason: error)` );
    } );

    it( `reports an incomplete response when the stream ends without terminal metadata`, async () => {
        fixture.stream.mockImplementationOnce( async function* () {
            yield { data: { choices: [ { delta: { content: `Partial answer` }, finishReason: null } ] } };
        } );
        await fixture.Request();
        expect( fixture.Text() ).toContain( `Partial answer` );
        expect( fixture.Text() ).toContain( `stream ended without a terminal finish reason` );
    } );

    it( `does not assume tool support when the selected model is missing from the catalog`, async () => {
        vi.mocked( fixture.provider.fetchModels ).mockResolvedValue( [] );
        await fixture.Request( { tools: [ { name: `tool`, inputSchema: {} } ] } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].tools ).toBeUndefined();
    } );
} );
