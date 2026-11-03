import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderBudgetFixture } from './providerBudgetFixture.js';

describe( `automatic maximum and pre-stream budget retries`, () => {
    let fixture: ProviderBudgetFixture;
    beforeEach( () => {
        fixture = new ProviderBudgetFixture();
        fixture.model.maxContextWindowTokens = 262144;
        fixture.model.maxInputTokens = 258048;
        fixture.model.maxOutputTokens = 262143;
        fixture.model.defaultCompletionTokens = 262143;
        fixture.model.outputLimitSource = `context window`;
        fixture.globalMaxTokens = undefined;
    } );
    afterEach( () => {
        fixture.provider.dispose();
        vi.restoreAllMocks();
    } );

    it( `automatically requests remaining context capacity without an inherited 4096 output default`, async () => {
        await fixture.Request( { modelConfiguration: { contextSize: 258048 } } );
        const request = fixture.stream.mock.calls[ 0 ][ 0 ];
        expect( request.maxTokens ).toBeGreaterThan( 65536 );
        expect( request.maxTokens ).toBeLessThan( 262144 );
        expect( fixture.log.debug ).toHaveBeenCalledWith( expect.stringContaining( `automatic maximum` ) );
    } );

    it( `retries a reported output limit and diagnoses the accepted budget on length termination`, async () => {
        fixture.finishReason = `length`;
        fixture.stream.mockRejectedValueOnce( {
            statusCode: 400, body: `max_tokens must be less than or equal to 32768`,
        } );
        await fixture.Request();
        expect( fixture.stream ).toHaveBeenCalledTimes( 2 );
        expect( fixture.stream.mock.calls[ 1 ][ 0 ].maxTokens ).toBe( 32768 );
        expect( fixture.Text() ).toContain( `Partial answer` );
        expect( fixture.Text() ).toContain( `Effective request budget: 32768 tokens` );
        expect( fixture.Text() ).toContain( `Server-reported output limit: 32768` );
    } );

    it( `uses a smaller budget when the server rejects tokens without publishing a ceiling`, async () => {
        fixture.stream.mockRejectedValueOnce( { statusCode: 400, body: `maximum context length exceeded` } );
        await fixture.Request();
        expect( fixture.stream ).toHaveBeenCalledTimes( 2 );
        expect( fixture.stream.mock.calls[ 1 ][ 0 ].maxTokens ).toBeLessThan( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens );
        expect( fixture.Text() ).toBe( `Partial answer` );
    } );

    it( `bounds repeated token rejections instead of retrying forever`, async () => {
        fixture.stream.mockRejectedValue( { statusCode: 400, message: `max_tokens exceeds maximum allowed` } );
        await fixture.Request();
        expect( fixture.stream ).toHaveBeenCalledTimes( 7 );
        const budgets = fixture.stream.mock.calls.map( call => {
            return call[ 0 ].maxTokens;
        } );
        expect( new Set( budgets ).size ).toBe( 7 );
        expect( fixture.Text() ).toContain( `Error:` );
    } );

    it( `does not retry an accepted stream after partial text or a later failure`, async () => {
        fixture.stream.mockImplementationOnce( async function* () {
            yield { data: { choices: [ { delta: { content: `Keep this text` }, finishReason: null } ] } };
            throw { statusCode: 400, message: `max_tokens exceeds maximum allowed` };
        } );
        await fixture.Request();
        expect( fixture.stream ).toHaveBeenCalledTimes( 1 );
        expect( fixture.Text() ).toContain( `Keep this text` );
        expect( fixture.Text() ).toContain( `Error:` );
    } );

    it( `does not retry authentication failures or retry after cancellation`, async () => {
        fixture.stream.mockRejectedValueOnce( { statusCode: 401, message: `max_tokens exceeds limit` } );
        await fixture.Request();
        expect( fixture.stream ).toHaveBeenCalledTimes( 1 );
        fixture.stream.mockClear();
        fixture.stream.mockImplementationOnce( async () => {
            fixture.token.isCancellationRequested = true;
            fixture.token.onCancellationRequested.mock.calls[ 1 ][ 0 ]();
            throw { statusCode: 400, message: `max_tokens exceeds limit` };
        } );
        await fixture.Request();
        expect( fixture.stream ).toHaveBeenCalledTimes( 1 );
    } );

    it( `treats the existing nullable global setting as automatic mode`, async () => {
        fixture.globalMaxTokens = null;
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBeGreaterThan( 65536 );
    } );

    it( `keeps explicit output overrides below the automatic maximum`, async () => {
        await fixture.Request( { modelConfiguration: { maxTokens: 16384 } } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 16384 );
        fixture.globalMaxTokens = 4096;
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 1 ][ 0 ].maxTokens ).toBe( 4096 );
    } );
} );
