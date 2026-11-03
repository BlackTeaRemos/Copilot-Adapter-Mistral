import { describe, expect, it, vi } from 'vitest';
import { PromptReservationEstimator } from '../promptReservationEstimator.js';
import { CompletionBudgetResolver } from '../../../completionBudget/completionBudgetResolver.js';

describe( `shared context output bounds`, () => {
    it( `counts tool schemas and reserves message/template overhead`, () => {
        const count = vi.fn().mockReturnValue( 100 );
        const reservation = new PromptReservationEstimator().Estimate(
            `model`, [ { role: `user`, content: `hello` } ],
            [ { function: { name: `search`, parameters: { type: `object` } } } ], 258048, { Count: count },
        );
        expect( count ).toHaveBeenCalledWith( `model`, expect.stringContaining( `search` ) );
        expect( reservation ).toEqual( { tokens: 392, source: `estimated prompt` } );
    } );

    it( `uses the host input reservation for images instead of tokenizing encoded image bytes`, () => {
        const count = vi.fn();
        const reservation = new PromptReservationEstimator().Estimate(
            `model`, [ { role: `user`, content: [ { type: `image_url`, imageUrl: `data:image/png;base64,ignored` } ] } ],
            undefined, 32768, { Count: count },
        );
        expect( reservation ).toEqual( { tokens: 32768, source: `selected input allowance` } );
        expect( count ).not.toHaveBeenCalled();
    } );

    it( `does not reject the native full-input allowance because a local estimate is higher`, () => {
        const reservation = new PromptReservationEstimator().Estimate(
            `model`, [ { role: `user`, content: `large input` } ], undefined, 258048,
            { Count: () => {
                return 258000;
            } },
        );
        expect( reservation ).toEqual( { tokens: 258048, source: `selected input allowance` } );
    } );

    it( `keeps a documented model ceiling below available context and vice versa`, () => {
        const resolver = new CompletionBudgetResolver();
        const defaults = { defaultCompletionTokens: 4096, globalMaxTokens: 65536, maxOutputTokens: 32000 };
        expect( resolver.Resolve( { ...defaults, contextOutputTokens: 50000 } ).effectiveTokens ).toBe( 32000 );
        expect( resolver.Resolve( { ...defaults, contextOutputTokens: 20000 } ) ).toMatchObject( {
            effectiveTokens: 20000, limitSource: `context headroom`,
        } );
        expect( resolver.Resolve( { ...defaults, maxOutputTokens: undefined, contextOutputTokens: 50000 } ).effectiveTokens ).toBe( 50000 );
    } );
} );
