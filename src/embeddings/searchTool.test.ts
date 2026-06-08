import { describe, expect, it, vi } from 'vitest';
import { LanguageModelToolResult } from '../test/vscode.mock.js';
import { formatResults, createSearchTool, limitByCharBudget, MIN_SCORE } from './searchTool.js';
import type { IndexEntry } from './codebaseIndex.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function entry( file: string, text: string ): IndexEntry {
    return { file, startLine: 1, endLine: 3, text, vector: [1] };
}

describe( `formatResults`, () => {
    it( `guides the user to build the index when empty`, () => {
        expect( formatResults( [] ) ).toMatch( /Build the Mistral embedding index/ );
    } );

    it( `labels each snippet with path, line range and score`, () => {
        const out = formatResults( [{ entry: entry( `src/a.ts`, `const x = 1;` ), score: 0.91 }] );
        expect( out ).toContain( `src/a.ts:1-3` );
        expect( out ).toContain( `91% match` );
        expect( out ).toContain( `const x = 1;` );
        expect( out ).toContain( `Found 1 relevant snippet` );
    } );
} );

describe( `limitByCharBudget`, () => {
    const r = ( text: string ) => {
        return  { entry: { text } };
    };
    it( `stops once the budget is exceeded but always keeps the first`, () => {
        const out = limitByCharBudget( [r( `a`.repeat( 100 ) ), r( `b`.repeat( 100 ) ), r( `c` )], 150 );
        expect( out ).toHaveLength( 1 );
    } );
    it( `keeps the lone first hit even if it exceeds the budget`, () => {
        expect( limitByCharBudget( [r( `x`.repeat( 999 ) )], 10 ) ).toHaveLength( 1 );
    } );
} );

describe( `createSearchTool`, () => {
    function fakeIndex( results: Array<{ entry: IndexEntry; score: number; }>, state: `ready` | `empty` = `ready` ) {
        return {
            search: vi.fn().mockResolvedValue( results ),
            load: vi.fn().mockResolvedValue( undefined ),
            getState: vi.fn().mockReturnValue( state ),
            build: vi.fn().mockResolvedValue( { total: 0, embedded: 0, reused: 0 } ),
        } as any;
    }

    it( `searches a ready index and returns a tool result`, async() => {
        const index = fakeIndex( [{ entry: entry( `a.ts`, `code` ), score: 0.8 }] );
        const tool = createSearchTool( index, log );
        const result = await tool.invoke( { input: { query: `find x` } } as any, {} as any );
        expect( index.build ).not.toHaveBeenCalled();
        expect( index.search ).toHaveBeenCalledWith( `find x`, 10, expect.anything() );
        expect( result ).toBeInstanceOf( LanguageModelToolResult );
        expect( ( result as any ).content[ 0 ].value ).toContain( `a.ts` );
    } );

    it( `auto-builds the index when not ready, then searches`, async() => {
        const index = fakeIndex( [{ entry: entry( `a.ts`, `code` ), score: 0.9 }], `empty` );
        const tool = createSearchTool( index, log );
        await tool.invoke( { input: { query: `q` } } as any, {} as any );
        expect( index.build ).toHaveBeenCalledOnce();
        expect( index.search ).toHaveBeenCalled();
    } );

    it( `drops weak matches below MIN_SCORE`, async() => {
        const index = fakeIndex( [
            { entry: entry( `strong.ts`, `keep` ), score: MIN_SCORE + 0.5 },
            { entry: entry( `weak.ts`, `drop` ), score: MIN_SCORE - 0.1 },
        ] );
        const tool = createSearchTool( index, log );
        const out = ( await tool.invoke( { input: { query: `q` } } as any, {} as any ) ) as any;
        expect( out.content[ 0 ].value ).toContain( `strong.ts` );
        expect( out.content[ 0 ].value ).not.toContain( `weak.ts` );
    } );

    it( `falls back to top results when none clear MIN_SCORE`, async() => {
        const index = fakeIndex( [{ entry: entry( `best.ts`, `x` ), score: 0.05 }] );
        const tool = createSearchTool( index, log );
        const out = ( await tool.invoke( { input: { query: `q` } } as any, {} as any ) ) as any;
        expect( out.content[ 0 ].value ).toContain( `best.ts` );
    } );

    it( `clamps maxResults to 1..30`, async() => {
        const index = fakeIndex( [] );
        const tool = createSearchTool( index, log );
        await tool.invoke( { input: { query: `q`, maxResults: 999 } } as any, {} as any );
        expect( index.search ).toHaveBeenCalledWith( `q`, 30, expect.anything() );
    } );

    it( `short-circuits on empty query without searching`, async() => {
        const index = fakeIndex( [] );
        const tool = createSearchTool( index, log );
        const result = await tool.invoke( { input: { query: `   ` } } as any, {} as any );
        expect( index.search ).not.toHaveBeenCalled();
        expect( ( result as any ).content[ 0 ].value ).toBe( `No query provided.` );
    } );

    it( `reports a build failure as tool text`, async() => {
        const index = fakeIndex( [], `empty` );
        index.build.mockRejectedValue( new Error( `no api key` ) );
        const tool = createSearchTool( index, log );
        const out = ( await tool.invoke( { input: { query: `q` } } as any, {} as any ) ) as any;
        expect( out.content[ 0 ].value ).toContain( `no api key` );
        expect( index.search ).not.toHaveBeenCalled();
    } );

    it( `prepareInvocation describes the search`, async() => {
        const tool = createSearchTool( fakeIndex( [] ), log );
        const prep = await tool.prepareInvocation!( { input: { query: `auth flow` } } as any, {} as any );
        expect( ( prep as any ).invocationMessage ).toContain( `auth flow` );
    } );
} );
