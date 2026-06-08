import { describe, expect, it, vi } from 'vitest';
import { LanguageModelToolResult } from '../test/vscode.mock.js';
import { formatResults, createSearchTool } from './searchTool.js';
import type { IndexEntry } from './codebaseIndex.js';

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function entry ( file: string, text: string ): IndexEntry {
    return { file, startLine: 1, endLine: 3, text, vector: [ 1 ] };
}

describe( 'formatResults', () => {
    it( 'guides the user to build the index when empty', () => {
        expect( formatResults( [] ) ).toMatch( /Build the Mistral embedding index/ );
    } );

    it( 'labels each snippet with path, line range and score', () => {
        const out = formatResults( [ { entry: entry( 'src/a.ts', 'const x = 1;' ), score: 0.91 } ] );
        expect( out ).toContain( 'src/a.ts:1-3' );
        expect( out ).toContain( '91% match' );
        expect( out ).toContain( 'const x = 1;' );
        expect( out ).toContain( 'Found 1 relevant snippet' );
    } );
} );

describe( 'createSearchTool', () => {
    function fakeIndex ( results: Array<{ entry: IndexEntry; score: number; }> ) {
        return { search: vi.fn().mockResolvedValue( results ) } as any;
    }

    it( 'searches the index and returns a tool result', async () => {
        const index = fakeIndex( [ { entry: entry( 'a.ts', 'code' ), score: 0.8 } ] );
        const tool = createSearchTool( index, log );
        const result = await tool.invoke( { input: { query: 'find x' } } as any, {} as any );
        expect( index.search ).toHaveBeenCalledWith( 'find x', 10, expect.anything() );
        expect( result ).toBeInstanceOf( LanguageModelToolResult );
        expect( ( result as any ).content[ 0 ].value ).toContain( 'a.ts' );
    } );

    it( 'clamps maxResults to 1..30', async () => {
        const index = fakeIndex( [] );
        const tool = createSearchTool( index, log );
        await tool.invoke( { input: { query: 'q', maxResults: 999 } } as any, {} as any );
        expect( index.search ).toHaveBeenCalledWith( 'q', 30, expect.anything() );
    } );

    it( 'short-circuits on empty query without searching', async () => {
        const index = fakeIndex( [] );
        const tool = createSearchTool( index, log );
        const result = await tool.invoke( { input: { query: '   ' } } as any, {} as any );
        expect( index.search ).not.toHaveBeenCalled();
        expect( ( result as any ).content[ 0 ].value ).toBe( 'No query provided.' );
    } );

    it( 'prepareInvocation describes the search', async () => {
        const tool = createSearchTool( fakeIndex( [] ), log );
        const prep = await tool.prepareInvocation!( { input: { query: 'auth flow' } } as any, {} as any );
        expect( ( prep as any ).invocationMessage ).toContain( 'auth flow' );
    } );
} );
