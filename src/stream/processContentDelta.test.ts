import { describe, expect, it, vi } from 'vitest';
import { createContentDeltaState, processContentDelta, flushContentDeltaState } from './processContentDelta.js';

function makeCtx () {
    const answer: string[] = [];
    const thinking: string[] = [];
    const progress = {
        report: vi.fn( ( part: any ) => {
            const kind = part?.constructor?.name;
            if ( kind === `LanguageModelThinkingPart` ) {
                thinking.push( part.value );
            } else if ( part?.value !== undefined ) {
                answer.push( part.value );
            }
        } ),
    };
    const log = { debug: vi.fn(), info: vi.fn() };
    const state = createContentDeltaState();
    return { state, progress, log, answer, thinking };
}

describe( `processContentDelta`, () => {
    it( `passes plain text through`, () => {
        const { state, progress, log, answer } = makeCtx();
        processContentDelta( `Hello world`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Hello world` );
    } );

    it( `routes inline think block to thinking, keeps answer`, () => {
        const { state, progress, log, answer, thinking } = makeCtx();
        processContentDelta( `<think>reasoning</think>Answer`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Answer` );
        expect( thinking.join( `` ) ).toBe( `reasoning` );
    } );

    it( `routes think block split across chunks`, () => {
        const { state, progress, log, answer, thinking } = makeCtx();
        processContentDelta( `<think>step one`, state, progress, log );
        processContentDelta( ` step two</think>Result`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Result` );
        expect( thinking.join( `` ) ).toBe( `step one step two` );
    } );

    it( `emits no answer when response is entirely a think block`, () => {
        const { state, progress, log, answer, thinking } = makeCtx();
        processContentDelta( `<think>only thinking</think>`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `` );
        expect( thinking.join( `` ) ).toBe( `only thinking` );
    } );

    it( `text before and after think block both emitted as answer`, () => {
        const { state, progress, log, answer, thinking } = makeCtx();
        processContentDelta( `Before<think>hidden</think>After`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `BeforeAfter` );
        expect( thinking.join( `` ) ).toBe( `hidden` );
    } );

    it( `multiple chunks - no think tags - all text emitted`, () => {
        const { state, progress, log, answer } = makeCtx();
        processContentDelta( `Hello `, state, progress, log );
        processContentDelta( `World`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Hello World` );
    } );
} );

describe( `flushContentDeltaState`, () => {
    it( `resets depth and logs when stream ends mid-think`, () => {
        const { state, progress, log } = makeCtx();
        processContentDelta( `<think>unfinished`, state, progress, log );
        expect( state.thinkDepth ).toBeGreaterThan( 0 );
        flushContentDeltaState( state, log );
        expect( state.thinkDepth ).toBe( 0 );
        expect( log.debug ).toHaveBeenCalled();
    } );

    it( `no-op when not inside a think block`, () => {
        const { state, log } = makeCtx();
        flushContentDeltaState( state, log );
        expect( log.debug ).not.toHaveBeenCalled();
    } );
} );
