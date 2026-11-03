import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderBudgetFixture } from '../../chatResponse/tests/providerBudgetFixture.js';

describe( `provider context selection`, () => {
    let fixture: ProviderBudgetFixture;
    beforeEach( () => {
        fixture = new ProviderBudgetFixture();
        fixture.model.maxContextWindowTokens = 128000;
        fixture.model.maxInputTokens = 111616;
    } );
    afterEach( () => {
        fixture.provider.dispose();
        vi.restoreAllMocks();
    } );

    it( `reads native per-model selections for each request`, async () => {
        await fixture.Request( { modelConfiguration: { contextSize: 32768 } } );
        await fixture.Request( { modelConfiguration: { contextSize: 65536 } } );
        expect( fixture.log.debug ).toHaveBeenCalledWith(
            `[Mistral] Input context budget: requested=32768 effective=32768 modelInputLimit=111616 contextWindow=128000`,
        );
        expect( fixture.log.debug ).toHaveBeenCalledWith(
            `[Mistral] Input context budget: requested=65536 effective=65536 modelInputLimit=111616 contextWindow=128000`,
        );
    } );

    it( `keeps output overrides separate and omits contextSize from the SDK request`, async () => {
        await fixture.Request( {
            modelConfiguration: { contextSize: 32768, maxTokens: 6000 },
            modelOptions: { maxTokens: 9000 },
        } );
        const request = fixture.stream.mock.calls[ 0 ][ 0 ];
        expect( request.maxTokens ).toBe( 9000 );
        expect( request ).not.toHaveProperty( `contextSize` );
        expect( request ).not.toHaveProperty( `maxContextWindowTokens` );
        expect( request.messages[ 0 ].content ).toBe( `hello` );
    } );

    it( `caps an oversized selection without raising output capacity`, async () => {
        await fixture.Request( { modelConfiguration: { contextSize: 1000000 } } );
        expect( fixture.log.debug ).toHaveBeenCalledWith(
            `[Mistral] Input context budget: requested=1000000 effective=111616 modelInputLimit=111616 contextWindow=128000`,
        );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 8192 );
        expect( fixture.model.maxInputTokens ).toBe( 111616 );
        expect( fixture.model.maxOutputTokens ).toBe( 16384 );
    } );

    it.each( [ 0, -1, NaN, Infinity, 1.5, `32768`, null ] )(
        `rejects an invalid context selection before forwarding: %s`,
        async ( contextSize ) => {
            await fixture.Request( { modelConfiguration: { contextSize } } );
            expect( fixture.stream ).not.toHaveBeenCalled();
            expect( fixture.Text() ).toContain( `contextSize must be a finite positive safe integer` );
        },
    );

    it( `defaults to the full input allowance when no selection is supplied`, async () => {
        await fixture.Request();
        expect( fixture.log.debug ).toHaveBeenCalledWith(
            `[Mistral] Input context budget: requested=111616 effective=111616 modelInputLimit=111616 contextWindow=128000`,
        );
    } );
} );
