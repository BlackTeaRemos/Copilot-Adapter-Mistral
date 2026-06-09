import * as vscode from 'vscode';
import type { CodebaseEmbeddingIndex } from './codebaseIndex.js';

/**
 * Status-bar control for the embedding index — mirrors the inline-completion
 * toggle. Shows index state (empty / indexing / ready with chunk count) and
 * opens an action menu on click.
 */
export class EmbeddingStatus {
    constructor(
        context: vscode.ExtensionContext,
        private readonly index: CodebaseEmbeddingIndex,
        private readonly getModel: () => string,
        private readonly onRender?:( state: { indexState: `off` | `indexing` | `ready`; chunkCount: number; fileCount: number; model: string } ) => void,
    ) {
        context.subscriptions.push( index.onChange( () => this.render() ) );
    }

    render(): void {
        this.onRender?.( {
            indexState: this.index.getState() as `off` | `indexing` | `ready`,
            chunkCount: this.index.chunkCount,
            fileCount: this.index.fileCount,
            model: this.getModel(),
        } );
    }
}
