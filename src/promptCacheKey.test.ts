import { describe, expect, it } from 'vitest';
import { computePromptCacheKey } from './promptCacheKey.js';
import type { MistralMessage } from './types.js';

const sys = ( content: string ): MistralMessage => ( { role: 'system', content } );
const user = ( content: MistralMessage[ 'content' ] ): MistralMessage => ( { role: 'user', content } as MistralMessage );

describe( 'computePromptCacheKey', () => {
    it( 'produces a stable vscode-prefixed 32-char hex key', () => {
        const key = computePromptCacheKey( 'mistral-large', [ sys( 'be brief' ), user( 'hi' ) ] );
        expect( key ).toMatch( /^vscode-[0-9a-f]{32}$/ );
    } );

    it( 'is deterministic for the same inputs', () => {
        const msgs: MistralMessage[] = [ sys( 'be brief' ), user( 'hi' ) ];
        expect( computePromptCacheKey( 'm', msgs ) ).toBe( computePromptCacheKey( 'm', msgs ) );
    } );

    it( 'is stable across later turns (ignores messages after first user)', () => {
        const base: MistralMessage[] = [ sys( 'sys' ), user( 'first' ) ];
        const extended: MistralMessage[] = [ ...base, user( 'second' ), user( 'third' ) ];
        expect( computePromptCacheKey( 'm', extended ) ).toBe( computePromptCacheKey( 'm', base ) );
    } );

    it( 'differs when the model id differs', () => {
        const msgs: MistralMessage[] = [ user( 'hi' ) ];
        expect( computePromptCacheKey( 'a', msgs ) ).not.toBe( computePromptCacheKey( 'b', msgs ) );
    } );

    it( 'differs when the system prompt differs', () => {
        expect( computePromptCacheKey( 'm', [ sys( 'x' ), user( 'hi' ) ] ) )
            .not.toBe( computePromptCacheKey( 'm', [ sys( 'y' ), user( 'hi' ) ] ) );
    } );

    it( 'differs when the first user message differs', () => {
        expect( computePromptCacheKey( 'm', [ user( 'a' ) ] ) )
            .not.toBe( computePromptCacheKey( 'm', [ user( 'b' ) ] ) );
    } );

    it( 'flattens array content to text and tags images', () => {
        const withImg = computePromptCacheKey( 'm', [ user( [ { type: 'text', text: 'hi' }, { type: 'image_url', imageUrl: 'data:...' } ] ) ] );
        const textOnly = computePromptCacheKey( 'm', [ user( [ { type: 'text', text: 'hi' } ] ) ] );
        expect( withImg ).toMatch( /^vscode-[0-9a-f]{32}$/ );
        expect( withImg ).not.toBe( textOnly );
    } );
} );
