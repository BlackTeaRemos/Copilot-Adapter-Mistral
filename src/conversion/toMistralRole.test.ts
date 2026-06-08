import { describe, expect, it } from 'vitest';
import { LanguageModelChatMessageRole } from 'vscode';
import { toMistralRole } from './toMistralRole.js';

describe( `toMistralRole`, () => {
    it( `maps User → "user"`, () => {
        expect( toMistralRole( LanguageModelChatMessageRole.User ) ).toBe( `user` );
    } );

    it( `maps Assistant → "assistant"`, () => {
        expect( toMistralRole( LanguageModelChatMessageRole.Assistant ) ).toBe( `assistant` );
    } );

    it( `maps numeric 3 (future System) → "system"`, () => {
        expect( toMistralRole( 3 as any ) ).toBe( `system` );
    } );

    it( `maps unknown → "user"`, () => {
        expect( toMistralRole( 99 as any ) ).toBe( `user` );
    } );
} );
