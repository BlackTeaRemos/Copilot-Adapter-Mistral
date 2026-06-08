import * as vscode from 'vscode';
import type { CodebaseEmbeddingIndex } from './codebaseIndex.js';

/**
 * Status-bar control for the embedding index — mirrors the inline-completion
 * toggle. Shows index state (empty / indexing / ready with chunk count) and
 * opens an action menu on click.
 */
export class EmbeddingStatus {
    private readonly statusBar: vscode.StatusBarItem;

    constructor (
        context: vscode.ExtensionContext,
        private readonly index: CodebaseEmbeddingIndex,
        private readonly getModel: () => string,
    ) {
        this.statusBar = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Right, 99 );
        this.statusBar.name = 'Mistral Embedding Index';
        this.statusBar.command = 'mistral-adapter.embeddingMenu';
        context.subscriptions.push( this.statusBar, index.onChange( () => this.render() ) );
    }

    render (): void {
        const model = this.getModel();
        switch ( this.index.getState() ) {
            case 'indexing':
                this.statusBar.text = '$(sync~spin) Mistral Index';
                this.statusBar.tooltip = `Building embedding index with ${ model }…`;
                this.statusBar.backgroundColor = undefined;
                break;
            case 'ready':
                this.statusBar.text = `$(database) Mistral Index: ${ this.index.chunkCount }`;
                this.statusBar.tooltip =
                    `Mistral embedding index ready — ${ this.index.chunkCount } chunks across ${ this.index.fileCount } files (${ model }).\nClick for actions.`;
                this.statusBar.backgroundColor = undefined;
                break;
            default:
                this.statusBar.text = '$(database) Mistral Index: off';
                this.statusBar.tooltip = 'No embedding index yet. Click to build one for semantic code search.';
                this.statusBar.backgroundColor = new vscode.ThemeColor( 'statusBarItem.warningBackground' );
        }
        this.statusBar.show();
    }
}
