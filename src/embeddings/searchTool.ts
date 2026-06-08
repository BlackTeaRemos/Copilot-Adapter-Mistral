import * as vscode from 'vscode';
import type { CodebaseEmbeddingIndex, IndexEntry } from './codebaseIndex.js';
import type { EmbeddingsLogger } from './mistralEmbeddings.js';

/** Tool id — must match the `languageModelTools` contribution in package.json. */
export const SEARCH_TOOL_NAME = `mistral_searchCodebase`;

/** Drop hits weaker than this cosine score — they add noise, not signal. */
export const MIN_SCORE = 0.25;
/** Cap total returned snippet text so the tool stays within the model's budget. */
export const MAX_RESULT_CHARS = 8000;

export interface SearchToolInput {
    query: string;
    maxResults?: number;
}

/**
 * Keeps results in order until their combined text reaches `maxChars` (always
 * keeps at least the first hit), so a tool call never floods the model context.
 */
export function limitByCharBudget<T extends { entry: { text: string; }; }>(
    results: readonly T[],
    maxChars: number,
): T[] {
    const out: T[] = [];
    let total = 0;
    for ( const r of results ) {
        if ( out.length > 0 && total + r.entry.text.length > maxChars ) {
            break;
        }
        out.push( r );
        total += r.entry.text.length;
    }
    return out;
}

/**
 * Renders search hits as a model-readable block: each snippet labelled with its
 * file path, line range, and similarity, followed by the code in a fence.
 */
export function formatResults( results: ReadonlyArray<{ entry: IndexEntry; score: number; }> ): string {
    if ( results.length === 0 ) {
        return `No indexed matches. Build the Mistral embedding index first ("Mistral: Build Codebase Embedding Index").`;
    }
    const blocks = results.map( ( { entry, score } ) => {
        return `### ${ entry.file }:${ entry.startLine }-${ entry.endLine } (${ ( score * 100 ).toFixed( 0 ) }% match)\n` +
        `\`\`\`\n` + entry.text + `\n\`\`\``;
    },
    );
    return `Found ${ results.length } relevant snippet(s) from the Mistral embedding index:\n\n${ blocks.join( `\n\n` ) }`;
}

/**
 * Builds the language-model tool backing `mistral_searchCodebase`. Separated
 * from registration so it can be unit-tested without the `vscode.lm` host.
 */
export function createSearchTool(
    index: CodebaseEmbeddingIndex,
    log: EmbeddingsLogger,
): vscode.LanguageModelTool<SearchToolInput> {
    const text = ( s: string ) => {
        return new vscode.LanguageModelToolResult( [new vscode.LanguageModelTextPart( s )] );
    };
    return {
        async invoke( options, token ) {
            const query = options.input?.query?.trim();
            if ( !query ) {
                return text( `No query provided.` );
            }
            const maxResults = Math.min( Math.max( options.input.maxResults ?? 10, 1 ), 30 );

            // Auto-build on first use so the model gets results without a manual step.
            await index.load();
            if ( index.getState() !== `ready` ) {
                log.info( `[Mistral] searchCodebase: index empty — building before first search.` );
                try {
                    await index.build( undefined, token );
                } catch( err ) {
                    return text( `Could not build the Mistral embedding index: ${ err instanceof Error ? err.message : String( err ) }` );
                }
            }

            log.info( `[Mistral] searchCodebase tool: "${ query }" (max ${ maxResults })` );
            const all = await index.search( query, maxResults, token );
            // Prefer strong matches; if none clear the bar, fall back to the top few.
            const strong = all.filter( r => {
                return r.score >= MIN_SCORE;
            } );
            const chosen = limitByCharBudget( strong.length > 0 ? strong : all.slice( 0, 3 ), MAX_RESULT_CHARS );
            return text( formatResults( chosen ) );
        },
        async prepareInvocation( options ) {
            return { invocationMessage: `Searching Mistral codebase index for “${ options.input?.query ?? `` }”` };
        },
    };
}

/**
 * Registers the codebase-search tool so chat models (Copilot agent mode, the
 * `@mistral` participant, or any `lm.invokeTool` caller) can query the Mistral
 * embedding index themselves.
 */
export function registerCodebaseSearchTool(
    index: CodebaseEmbeddingIndex,
    log: EmbeddingsLogger,
): vscode.Disposable {
    return vscode.lm.registerTool( SEARCH_TOOL_NAME, createSearchTool( index, log ) );
}
