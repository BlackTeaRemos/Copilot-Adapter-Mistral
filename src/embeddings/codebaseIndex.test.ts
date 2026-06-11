import { describe, expect, it } from 'vitest';
import { chunkDocument, planReindex, hashContent } from './codebaseIndex.js';

describe( `chunkDocument`, () => {
    it( `returns a single chunk for small input with full line range`, () => {
        const chunks = chunkDocument( `line1\nline2\nline3` );
        expect( chunks ).toHaveLength( 1 );
        expect( chunks[ 0 ].startLine ).toBe( 1 );
        expect( chunks[ 0 ].endLine ).toBe( 3 );
        expect( chunks[ 0 ].text ).toBe( `line1\nline2\nline3` );
    } );

    it( `splits on the maxLines boundary with contiguous ranges`, () => {
        const text = Array.from( { length: 10 }, ( _, i ) => {
            return `L${ i + 1 }`;
        } ).join( `\n` );
        const chunks = chunkDocument( text, { maxLines: 4, maxChars: 10_000 } );
        expect( chunks.map( c => {
            return [ c.startLine, c.endLine ];
        } ) ).toEqual( [ [ 1, 4 ], [ 5, 8 ], [ 9, 10 ] ] );
    } );

    it( `splits when the char budget is exceeded`, () => {
        const text = [ `a`.repeat( 30 ), `b`.repeat( 30 ), `c`.repeat( 30 ) ].join( `\n` );
        const chunks = chunkDocument( text, { maxLines: 100, maxChars: 50 } );
        expect( chunks.length ).toBeGreaterThan( 1 );
    } );

    it( `drops whitespace-only chunks`, () => {
        expect( chunkDocument( `\n\n   \n\t\n` ) ).toEqual( [] );
    } );

    it( `handles CRLF line endings`, () => {
        const chunks = chunkDocument( `a\r\nb\r\nc` );
        expect( chunks[ 0 ].endLine ).toBe( 3 );
        expect( chunks[ 0 ].text ).toBe( `a\nb\nc` );
    } );

    it( `covers every source line across chunks without gaps`, () => {
        const text = Array.from( { length: 25 }, ( _, i ) => {
            return `x${ i }`;
        } ).join( `\n` );
        const chunks = chunkDocument( text, { maxLines: 7, maxChars: 10_000 } );
        expect( chunks[ 0 ].startLine ).toBe( 1 );
        for ( let i = 1; i < chunks.length; i++ ) {
            expect( chunks[ i ].startLine ).toBe( chunks[ i - 1 ].endLine + 1 );
        }
        expect( chunks.at( -1 )!.endLine ).toBe( 25 );
    } );
} );

describe( `hashContent`, () => {
    it( `is stable and content-sensitive`, () => {
        expect( hashContent( `abc` ) ).toBe( hashContent( `abc` ) );
        expect( hashContent( `abc` ) ).not.toBe( hashContent( `abd` ) );
    } );
} );

describe( `planReindex`, () => {
    it( `reuses unchanged files, embeds new/changed, removes deleted`, () => {
        const current = [
            { file: `a.ts`, hash: `h1` }, // unchanged
            { file: `b.ts`, hash: `h2new` }, // changed
            { file: `c.ts`, hash: `h3` }, // new
        ];
        const cached = {
            'a.ts': { hash: `h1` },
            'b.ts': { hash: `h2old` },
            'd.ts': { hash: `h4` }, // deleted
        };
        const plan = planReindex( current, cached );
        expect( plan.reuse ).toEqual( [ `a.ts` ] );
        expect( plan.embed.sort() ).toEqual( [ `b.ts`, `c.ts` ] );
        expect( plan.remove ).toEqual( [ `d.ts` ] );
    } );

    it( `embeds everything when cache is empty`, () => {
        const plan = planReindex( [ { file: `x`, hash: `h` } ], {} );
        expect( plan.embed ).toEqual( [ `x` ] );
        expect( plan.reuse ).toEqual( [] );
        expect( plan.remove ).toEqual( [] );
    } );

    it( `reuses all when nothing changed (no wasted embedding)`, () => {
        const files = [ { file: `a`, hash: `1` }, { file: `b`, hash: `2` } ];
        const cached = { a: { hash: `1` }, b: { hash: `2` } };
        const plan = planReindex( files, cached );
        expect( plan.embed ).toEqual( [] );
        expect( plan.reuse.sort() ).toEqual( [ `a`, `b` ] );
    } );
} );
