import { describe, expect, it, vi } from 'vitest';
import { LanguageModelToolResult } from '../test/vscode.mock.js';
import { formatResults, createSearchTool, limitByCharBudget, MIN_SCORE } from './searchTool.js';
import { CreateIndexEntry as entry } from './tests/createIndexEntry.js';
import { CreateFakeSearchIndex as fakeIndex } from './tests/createFakeSearchIndex.js';
import { GetToolResultText } from './tests/getToolResultText.js';
import { CreateToolInvocationOptions } from '../test/createToolInvocationOptions.js';
import { NO_CANCEL_TOKEN } from '../test/noCancelToken.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };



describe( `formatResults`, () => {
    it( `guides the user to build the index when empty`, () => {
        expect( formatResults( [] ) ).toMatch( /Build the Mistral embedding index/ );
    } );

    it( `labels each snippet with path, line range and score`, () => {
        const out = formatResults( [ { entry: entry( `src/a.ts`, `const x = 1;` ), score: 0.91 } ] );
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
        const out = limitByCharBudget( [ r( `a`.repeat( 100 ) ), r( `b`.repeat( 100 ) ), r( `c` ) ], 150 );
        expect( out ).toHaveLength( 1 );
    } );
    it( `keeps the lone first hit even if it exceeds the budget`, () => {
        expect( limitByCharBudget( [ r( `x`.repeat( 999 ) ) ], 10 ) ).toHaveLength( 1 );
    } );
} );

describe( `createSearchTool`, () => {


    it( `searches a ready index and returns a tool result`, async () => {
        const index = fakeIndex( [ { entry: entry( `a.ts`, `code` ), score: 0.8 } ] );
        const tool = createSearchTool( index, log );
        const result = await tool.invoke( CreateToolInvocationOptions( { query: `find x` } ), NO_CANCEL_TOKEN );
        expect( index.build ).not.toHaveBeenCalled();
        expect( index.search ).toHaveBeenCalledWith( `find x`, 10, expect.anything() );
        expect( result ).toBeInstanceOf( LanguageModelToolResult );
        expect( GetToolResultText( result ) ).toContain( `a.ts` );
    } );

    it( `auto-builds the index when not ready, then searches`, async () => {
        const index = fakeIndex( [ { entry: entry( `a.ts`, `code` ), score: 0.9 } ], `empty` );
        const tool = createSearchTool( index, log );
        await tool.invoke( CreateToolInvocationOptions( { query: `q` } ), NO_CANCEL_TOKEN );
        expect( index.build ).toHaveBeenCalledOnce();
        expect( index.search ).toHaveBeenCalled();
    } );

    it( `drops weak matches below MIN_SCORE`, async () => {
        const index = fakeIndex( [
            { entry: entry( `strong.ts`, `keep` ), score: MIN_SCORE + 0.5 },
            { entry: entry( `weak.ts`, `drop` ), score: MIN_SCORE - 0.1 },
        ] );
        const tool = createSearchTool( index, log );
        const out = ( await tool.invoke( CreateToolInvocationOptions( { query: `q` } ), NO_CANCEL_TOKEN ) );
        expect( GetToolResultText( out ) ).toContain( `strong.ts` );
        expect( GetToolResultText( out ) ).not.toContain( `weak.ts` );
    } );

    it( `falls back to top results when none clear MIN_SCORE`, async () => {
        const index = fakeIndex( [ { entry: entry( `best.ts`, `x` ), score: 0.05 } ] );
        const tool = createSearchTool( index, log );
        const out = ( await tool.invoke( CreateToolInvocationOptions( { query: `q` } ), NO_CANCEL_TOKEN ) );
        expect( GetToolResultText( out ) ).toContain( `best.ts` );
    } );

    it( `clamps maxResults to 1..30`, async () => {
        const index = fakeIndex( [] );
        const tool = createSearchTool( index, log );
        await tool.invoke( CreateToolInvocationOptions( { query: `q`, maxResults: 999 } ), NO_CANCEL_TOKEN );
        expect( index.search ).toHaveBeenCalledWith( `q`, 30, expect.anything() );
    } );

    it( `short-circuits on empty query without searching`, async () => {
        const index = fakeIndex( [] );
        const tool = createSearchTool( index, log );
        const result = await tool.invoke( CreateToolInvocationOptions( { query: `   ` } ), NO_CANCEL_TOKEN );
        expect( index.search ).not.toHaveBeenCalled();
        expect( GetToolResultText( result ) ).toBe( `No query provided.` );
    } );

    it( `reports a build failure as tool text`, async () => {
        const index = fakeIndex( [], `empty` );
        index.build.mockRejectedValue( new Error( `no api key` ) );
        const tool = createSearchTool( index, log );
        const out = ( await tool.invoke( CreateToolInvocationOptions( { query: `q` } ), NO_CANCEL_TOKEN ) );
        expect( GetToolResultText( out ) ).toContain( `no api key` );
        expect( index.search ).not.toHaveBeenCalled();
    } );

    it( `prepareInvocation describes the search`, async () => {
        const tool = createSearchTool( fakeIndex( [] ), log );
        if ( !tool.prepareInvocation ) {
            throw new Error( `Expected search-tool preparation` );
        }
        const prep = await tool.prepareInvocation( { input: { query: `auth flow` } }, NO_CANCEL_TOKEN );
        expect( prep?.invocationMessage ).toContain( `auth flow` );
    } );
} );
