import { ContentStreamFixture } from './tests/contentStreamFixture.js';
import { describe, expect, it } from 'vitest';
import { processContentDelta, flushContentDeltaState } from './content/index.js';



describe( `processContentDelta`, () => {
    it( `passes plain text through`, () => {
        const { state, progress, log, answer } = new ContentStreamFixture();
        processContentDelta( `Hello world`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Hello world` );
    } );

    it( `routes inline think block to thinking, keeps answer`, () => {
        const { state, progress, log, answer, thinking } = new ContentStreamFixture();
        processContentDelta( `<think>reasoning</think>Answer`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Answer` );
        expect( thinking.join( `` ) ).toBe( `reasoning` );
    } );

    it( `routes think block split across chunks`, () => {
        const { state, progress, log, answer, thinking } = new ContentStreamFixture();
        processContentDelta( `<think>step one`, state, progress, log );
        processContentDelta( ` step two</think>Result`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Result` );
        expect( thinking.join( `` ) ).toBe( `step one step two` );
    } );

    it( `emits no answer when response is entirely a think block`, () => {
        const { state, progress, log, answer, thinking } = new ContentStreamFixture();
        processContentDelta( `<think>only thinking</think>`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `` );
        expect( thinking.join( `` ) ).toBe( `only thinking` );
    } );

    it( `text before and after think block both emitted as answer`, () => {
        const { state, progress, log, answer, thinking } = new ContentStreamFixture();
        processContentDelta( `Before<think>hidden</think>After`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `BeforeAfter` );
        expect( thinking.join( `` ) ).toBe( `hidden` );
    } );

    it( `multiple chunks - no think tags - all text emitted`, () => {
        const { state, progress, log, answer } = new ContentStreamFixture();
        processContentDelta( `Hello `, state, progress, log );
        processContentDelta( `World`, state, progress, log );
        expect( answer.join( `` ) ).toBe( `Hello World` );
    } );
} );

describe( `flushContentDeltaState`, () => {
    it( `resets depth and logs when stream ends mid-think`, () => {
        const { state, progress, log } = new ContentStreamFixture();
        processContentDelta( `<think>unfinished`, state, progress, log );
        expect( state.thinkDepth ).toBeGreaterThan( 0 );
        flushContentDeltaState( state, progress, log );
        expect( state.thinkDepth ).toBe( 0 );
        expect( log.debug ).toHaveBeenCalled();
    } );

    it( `no-op when not inside a think block`, () => {
        const { state, progress, log } = new ContentStreamFixture();
        flushContentDeltaState( state, progress, log );
        expect( log.debug ).not.toHaveBeenCalled();
    } );
} );
