import * as vscode from 'vscode';
import type { Mistral } from '@mistralai/mistralai';
import { createEmbeddings, EMBEDDING_MODELS, type EmbeddingsLogger } from './mistralEmbeddings.js';

// The embeddings API is a proposed VS Code API (`enabledApiProposals: ["embeddings"]`).
// It is registered best-effort: where the host exposes it the providers light up,
// elsewhere the call is a no-op so the extension still runs on stable VS Code.
type LmWithEmbeddings = typeof vscode.lm & {
    registerEmbeddingsProvider?: (
        model: string,
        provider: { provideEmbeddings ( input: string[], token: vscode.CancellationToken ): vscode.ProviderResult<Array<{ values: number[]; }>>; },
    ) => vscode.Disposable;
};

/**
 * Registers Mistral embedding models with the proposed `lm` embeddings API so
 * other extensions can call `lm.computeEmbeddings('mistral-embed', …)`.
 *
 * @returns A disposable for all registrations, or a no-op disposable when the
 *          proposed API is unavailable.
 */
export function registerMistralEmbeddingsProviders (
    getClient: () => Promise<Mistral | null>,
    log: EmbeddingsLogger,
): vscode.Disposable {
    try {
        const lm = vscode.lm as LmWithEmbeddings;
        if ( typeof lm.registerEmbeddingsProvider !== `function` ) {
            log.info( `[Mistral] lm.registerEmbeddingsProvider unavailable (proposed "embeddings" API not enabled) - skipping.` );
            return { dispose () { } };
        }

        const disposables = EMBEDDING_MODELS.map( model => {
            return lm.registerEmbeddingsProvider!( model, {
                async provideEmbeddings ( input: string[] ): Promise<Array<{ values: number[]; }>> {
                    const client = await getClient();
                    if ( !client ) {
                        log.warn( `[Mistral] Embeddings requested but no API key is set.` );
                        return [];
                    }
                    const vectors = await createEmbeddings( client, model, input, { log } );
                    return vectors.map( values => {
                        return { values };
                    } );
                },
            } );
        },
        );
        log.info( `[Mistral] Registered embeddings providers: ${ EMBEDDING_MODELS.join( `, ` ) }.` );
        return {
            dispose () {
                for ( const d of disposables ) {
                    d.dispose();
                }
            },
        };
    } catch ( err ) {
        log.info( `[Mistral] lm.registerEmbeddingsProvider failed (proposed API unavailable): ${ err instanceof Error ? err.message : String( err ) }` );
        return { dispose () { } };
    }
}
