import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMistralTokenizer, resetMistralTokenizer } from './mistralTokenizer.js';

// Tests resolve assets from the repo root (extensionPath equivalent).
const repoRoot = process.cwd();

describe( `getMistralTokenizer`, () => {
    beforeEach( () => {
        return resetMistralTokenizer();
    } );
    afterEach( () => {
        return resetMistralTokenizer();
    } );

    it( `loads the native tekken tokenizer from assets`, () => {
        const enc = getMistralTokenizer( repoRoot );
        expect( enc ).not.toBeNull();
    } );

    it( `encodes text to a plausible token count`, () => {
        const enc = getMistralTokenizer( repoRoot )!;
        expect( enc.encode( `Hello world` ).length ).toBe( 2 );
        const dog = enc.encode( `The quick brown fox jumps over the lazy dog.` ).length;
        expect( dog ).toBeGreaterThan( 5 );
        expect( dog ).toBeLessThan( 20 );
    } );

    it( `round-trips encode/decode`, () => {
        const enc = getMistralTokenizer( repoRoot )!;
        const text = `function add(a, b) { return a + b; }`;
        expect( enc.decode( enc.encode( text ) ) ).toBe( text );
    } );

    it( `caches the instance across calls`, () => {
        expect( getMistralTokenizer( repoRoot ) ).toBe( getMistralTokenizer( repoRoot ) );
    } );

    it( `returns null (cached) when assets are missing`, () => {
        expect( getMistralTokenizer( `/no/such/path` ) ).toBeNull();
        // Cached null short-circuits even when a valid path follows.
        expect( getMistralTokenizer( repoRoot ) ).toBeNull();
    } );
} );
