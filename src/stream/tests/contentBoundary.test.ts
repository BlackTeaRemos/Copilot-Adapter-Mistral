import { describe, expect, it } from 'vitest';
import { ContentStreamFixture } from './contentStreamFixture.js';

describe( `content delimiter boundaries`, () => {
    it.each( [ 1, 2, 3, 4, 5, 6 ] )( `handles an opening delimiter split at %s`, splitPosition => {
        const fixture = new ContentStreamFixture();
        const tag = `<think>`;
        fixture.Append( tag.slice( 0, splitPosition ), tag.slice( splitPosition ) + `reasoning</think>Answer` );
        fixture.Finish();
        expect( fixture.answer.join( `` ) ).toBe( `Answer` );
        expect( fixture.thinking.join( `` ) ).toBe( `reasoning` );
    } );

    it.each( [ 1, 2, 3, 4, 5, 6, 7 ] )( `handles a closing delimiter split at %s`, splitPosition => {
        const fixture = new ContentStreamFixture();
        const tag = `</think>`;
        fixture.Append( `<think>reasoning` + tag.slice( 0, splitPosition ), tag.slice( splitPosition ) + `Answer` );
        fixture.Finish();
        expect( fixture.answer.join( `` ) ).toBe( `Answer` );
        expect( fixture.thinking.join( `` ) ).toBe( `reasoning` );
    } );

    it( `handles delimiters emitted one character at a time`, () => {
        const fixture = new ContentStreamFixture();
        fixture.Append( ...`Before<think>reasoning</think>After` );
        fixture.Finish();
        expect( fixture.answer.join( `` ) ).toBe( `BeforeAfter` );
        expect( fixture.thinking.join( `` ) ).toBe( `reasoning` );
    } );

    it( `flushes a final literal prefix without losing text`, () => {
        const fixture = new ContentStreamFixture();
        fixture.Append( `Answer ends <thi` );
        fixture.Finish();
        expect( fixture.answer.join( `` ) ).toBe( `Answer ends <thi` );
        expect( fixture.state.pendingText ).toBe( `` );
    } );
} );
