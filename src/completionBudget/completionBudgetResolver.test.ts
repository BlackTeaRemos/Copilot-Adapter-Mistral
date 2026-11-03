import { describe, expect, it } from 'vitest';
import { CompletionBudgetResolver } from './completionBudgetResolver.js';

describe( `CompletionBudgetResolver`, () => {
    const defaults = { defaultCompletionTokens: 4096, maxOutputTokens: 16384 };

    it.each( [
        { values: {}, expected: 4096, source: `model default` },
        { values: { globalMaxTokens: 8000 }, expected: 8000, source: `mistral.maxTokens` },
        { values: { globalMaxTokens: 8000, modelMaxTokens: 6000 }, expected: 6000, source: `per-model configuration` },
        { values: { globalMaxTokens: 8000, modelMaxTokens: 6000, requestMaxTokens: 9000 }, expected: 9000, source: `request override` },
    ] )( `resolves the highest-priority present value: $source`, ( testCase ) => {
        expect( new CompletionBudgetResolver().Resolve( { ...defaults, ...testCase.values } ) ).toEqual( {
            requestedTokens: testCase.expected,
            effectiveTokens: testCase.expected,
            maxOutputTokens: 16384,
            source: testCase.source,
        } );
    } );

    it.each( [ `requestMaxTokens`, `modelMaxTokens`, `globalMaxTokens`, `defaultCompletionTokens`, `maxOutputTokens` ] )(
        `validates the selected budget or ceiling in %s`,
        ( field ) => {
            for ( const invalidValue of [ NaN, Infinity, -Infinity, 0, -4, 0.5, `4096`, null, false, Number.MAX_SAFE_INTEGER + 1 ] ) {
                expect( () => {
                    return new CompletionBudgetResolver().Resolve( { ...defaults, [ field ]: invalidValue } );
                } ).toThrow( `must be a finite positive safe integer` );
            }
        },
    );

    it( `accepts a one-token budget`, () => {
        expect( new CompletionBudgetResolver().Resolve( { ...defaults, requestMaxTokens: 1 } ).effectiveTokens ).toBe( 1 );
    } );

    it( `leaves an exact model-limit request unchanged`, () => {
        expect( new CompletionBudgetResolver().Resolve( { ...defaults, requestMaxTokens: 16384 } ).effectiveTokens ).toBe( 16384 );
    } );

    it( `caps a valid large budget without raising the model ceiling`, () => {
        expect( new CompletionBudgetResolver().Resolve( { ...defaults, requestMaxTokens: 1000000 } ) ).toEqual( {
            requestedTokens: 1000000, effectiveTokens: 16384, maxOutputTokens: 16384, source: `request override`,
        } );
    } );
} );
