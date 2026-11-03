import { describe, expect, it } from 'vitest';
import { ContextWindowResolver } from '../contextWindowResolver.js';

describe( `ContextWindowResolver`, () => {
    const resolver = new ContextWindowResolver();

    it( `reserves output within the combined context window`, () => {
        expect( resolver.ResolveLimits( 128000, 16384 ) ).toEqual( {
            maxContextWindowTokens: 128000,
            maxInputTokens: 111616,
            maxOutputTokens: 16384,
        } );
    } );

    it( `keeps a small context window usable without exceeding its capacity`, () => {
        expect( resolver.ResolveLimits( 1024, 4096 ) ).toEqual( {
            maxContextWindowTokens: 1024, maxInputTokens: 1, maxOutputTokens: 1023,
        } );
    } );

    it.each( [ NaN, Infinity, -Infinity, 0, -1, 2.5, `128000`, null, true, Number.MAX_SAFE_INTEGER + 1 ] )(
        `rejects invalid context capacity: %s`,
        ( invalidValue ) => {
            expect( () => {
                return resolver.ResolveLimits( invalidValue, 4096 );
            } ).toThrow( `model context window must be a finite positive safe integer` );
        },
    );

    it( `rejects a context window with no room for both directions`, () => {
        expect( () => {
            return resolver.ResolveLimits( 1, 4096 );
        } ).toThrow( `must leave room for input and output` );
    } );

    it( `uses the full input allowance when no selection is present`, () => {
        expect( resolver.ResolveSelection( 111616, undefined ).effectiveTokens ).toBe( 111616 );
    } );

    it( `uses a smaller native selection without changing the model ceiling`, () => {
        expect( resolver.ResolveSelection( 111616, 32768 ) ).toEqual( {
            requestedTokens: 32768, effectiveTokens: 32768, maxInputTokens: 111616,
        } );
    } );

    it( `clamps an oversized selection to the physical input allowance`, () => {
        expect( resolver.ResolveSelection( 111616, 1000000 ) ).toEqual( {
            requestedTokens: 1000000, effectiveTokens: 111616, maxInputTokens: 111616,
        } );
    } );

    it.each( [ NaN, Infinity, 0, -1, 1.5, `32768`, null, false, Number.MAX_SAFE_INTEGER + 1 ] )(
        `rejects an invalid native selection: %s`,
        ( invalidValue ) => {
            expect( () => {
                return resolver.ResolveSelection( 111616, invalidValue );
            } ).toThrow( `contextSize must be a finite positive safe integer` );
        },
    );
} );
