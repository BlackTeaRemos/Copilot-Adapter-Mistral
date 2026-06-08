import * as vscode from 'vscode';
import type { CodebaseEmbeddingIndex, IndexEntry } from './codebaseIndex.js';
import type { EmbeddingsLogger } from './mistralEmbeddings.js';

/** Tool id — must match the `languageModelTools` contribution in package.json. */
export const SEARCH_TOOL_NAME = 'mistral_searchCodebase';

export interface SearchToolInput {
    query: string;
    maxResults?: number;
}

/**
 * Renders search hits as a model-readable block: each snippet labelled with its
 * file path, line range, and similarity, followed by the code in a fence.
 */
export function formatResults ( results: ReadonlyArray<{ entry: IndexEntry; score: number; }> ): string {
    if ( results.length === 0 ) {
        return 'No indexed matches. Build the Mistral embedding index first ("Mistral: Build Codebase Embedding Index").';
    }
    const blocks = results.map( ( { entry, score } ) =>
        `### ${ entry.file }:${ entry.startLine }-${ entry.endLine } (${ ( score * 100 ).toFixed( 0 ) }% match)\n` +
        '```\n' + entry.text + '\n```',
    );
    return `Found ${ results.length } relevant snippet(s) from the Mistral embedding index:\n\n${ blocks.join( '\n\n' ) }`;
}

/**
 * Builds the language-model tool backing `mistral_searchCodebase`. Separated
 * from registration so it can be unit-tested without the `vscode.lm` host.
 */
export function createSearchTool (
    index: CodebaseEmbeddingIndex,
    log: EmbeddingsLogger,
): vscode.LanguageModelTool<SearchToolInput> {
    return {
        async invoke ( options, token ) {
            const query = options.input?.query?.trim();
            if ( !query ) {
                return new vscode.LanguageModelToolResult( [ new vscode.LanguageModelTextPart( 'No query provided.' ) ] );
            }
            const maxResults = Math.min( Math.max( options.input.maxResults ?? 10, 1 ), 30 );
            log.info( `[Mistral] searchCodebase tool: "${ query }" (max ${ maxResults })` );
            const results = await index.search( query, maxResults, token );
            return new vscode.LanguageModelToolResult( [ new vscode.LanguageModelTextPart( formatResults( results ) ) ] );
        },
        async prepareInvocation ( options ) {
            return { invocationMessage: `Searching Mistral codebase index for “${ options.input?.query ?? '' }”` };
        },
    };
}

/**
 * Registers the codebase-search tool so chat models (Copilot agent mode, the
 * `@mistral` participant, or any `lm.invokeTool` caller) can query the Mistral
 * embedding index themselves.
 */
export function registerCodebaseSearchTool (
    index: CodebaseEmbeddingIndex,
    log: EmbeddingsLogger,
): vscode.Disposable {
    return vscode.lm.registerTool( SEARCH_TOOL_NAME, createSearchTool( index, log ) );
}
