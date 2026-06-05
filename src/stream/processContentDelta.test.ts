import { describe, expect, it, vi } from 'vitest';
import { LanguageModelTextPart } from 'vscode';
import { createContentDeltaState, processContentDelta, flushContentDeltaState } from './processContentDelta.js';

function makeCtx () {
    const reported: string[] = [];
    const progress = { report: vi.fn( ( part: any ) => { if ( part?.value !== undefined ) reported.push( part.value ); } ) };
    const log = { debug: vi.fn() };
    const state = createContentDeltaState();
    return { state, progress, log, reported };
}

describe( 'processContentDelta', () => {
    it( 'passes plain text through', () => {
        const { state, progress, log, reported } = makeCtx();
        processContentDelta( 'Hello world', state, progress, log );
        expect( reported.join( '' ) ).toBe( 'Hello world' );
    } );

    it( 'strips inline think block', () => {
        const { state, progress, log, reported } = makeCtx();
        processContentDelta( '<think>reasoning</think>Answer', state, progress, log );
        expect( reported.join( '' ) ).toBe( 'Answer' );
    } );

    it( 'strips think block split across chunks', () => {
        const { state, progress, log, reported } = makeCtx();
        processContentDelta( '<think>step one', state, progress, log );
        processContentDelta( ' step two</think>Result', state, progress, log );
        expect( reported.join( '' ) ).toBe( 'Result' );
    } );

    it( 'emits nothing when response is entirely a think block', () => {
        const { state, progress, log, reported } = makeCtx();
        processContentDelta( '<think>only thinking</think>', state, progress, log );
        expect( reported.join( '' ) ).toBe( '' );
    } );

    it( 'text before and after think block both emitted', () => {
        const { state, progress, log, reported } = makeCtx();
        processContentDelta( 'Before<think>hidden</think>After', state, progress, log );
        expect( reported.join( '' ) ).toBe( 'BeforeAfter' );
    } );

    it( 'multiple chunks — no think tags — all text emitted', () => {
        const { state, progress, log, reported } = makeCtx();
        processContentDelta( 'Hello ', state, progress, log );
        processContentDelta( 'World', state, progress, log );
        expect( reported.join( '' ) ).toBe( 'Hello World' );
    } );
} );

describe( 'flushContentDeltaState', () => {
    it( 'logs and clears buffered think content on flush', () => {
        const { state, log } = makeCtx();
        processContentDelta( '<think>unfinished', state, { report: vi.fn() }, log );
        expect( state.thinkBuffer.length ).toBeGreaterThan( 0 );
        flushContentDeltaState( state, log );
        expect( state.thinkBuffer ).toBe( '' );
        expect( log.debug ).toHaveBeenCalled();
    } );

    it( 'no-op when buffer is empty', () => {
        const { state, log } = makeCtx();
        flushContentDeltaState( state, log );
        expect( log.debug ).not.toHaveBeenCalled();
    } );
} );
