import * as vscode from 'vscode';
import { fimComplete } from './client/index.js';
import type { MistralChatModelProvider } from './provider.js';

const MAX_PREFIX_CHARS = 8000;
const MAX_SUFFIX_CHARS = 4000;
const DEFAULT_MAX_TOKENS = 256;

export class MistralInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private session = { input: 0, output: 0, total: 0, calls: 0 };

    constructor (
        private readonly provider: MistralChatModelProvider,
        private readonly log: vscode.LogOutputChannel,
    ) { }

    private getModelId (): string {
        return vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionModel` ) ?? ``;
    }

    private isEnabled (): boolean {
        return vscode.workspace.getConfiguration( `mistral` ).get( `inlineCompletionEnabled` ) ?? false;
    }

    async provideInlineCompletionItems (
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken,
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
        if ( !this.isEnabled() ) {
            return undefined;
        }
        const modelId = this.getModelId();
        if ( modelId === `` ) {
            return undefined;
        }

        const client = await this.provider.ensureClient( true );
        if ( !client ) {
            return undefined;
        }
        if ( token.isCancellationRequested ) {
            return undefined;
        }

        const offset = document.offsetAt( position );
        const fullText = document.getText();
        const prefix = fullText.slice( Math.max( 0, offset - MAX_PREFIX_CHARS ), offset );
        const suffix = fullText.slice( offset, offset + MAX_SUFFIX_CHARS );

        if ( prefix.trim() === `` ) {
            return undefined;
        }

        const abortController = new AbortController();
        const sub = token.onCancellationRequested( () => {
            return abortController.abort();
        } );

        const started = Date.now();
        try {
            const result = await fimComplete(
                client,
                {
                    model: modelId,
                    prompt: prefix,
                    suffix: suffix.length > 0 ? suffix : undefined,
                    maxTokens: DEFAULT_MAX_TOKENS,
                    promptCacheKey: `fim:${ document.uri.toString() }`,
                },
                abortController.signal,
                this.log,
            );

            if ( token.isCancellationRequested || !result || result.text === `` ) {
                return undefined;
            }

            this.session.input += result.usage.promptTokens;
            this.session.output += result.usage.completionTokens;
            this.session.total += result.usage.totalTokens;
            this.session.calls += 1;

            this.log.info(
                `[Mistral FIM] ${ modelId } - ${ Date.now() - started }ms, ` +
                `prompt=${ result.usage.promptTokens } completion=${ result.usage.completionTokens } total=${ result.usage.totalTokens } | ` +
                `session: calls=${ this.session.calls } in=${ this.session.input } out=${ this.session.output } total=${ this.session.total }`,
            );

            const item = new vscode.InlineCompletionItem(
                result.text,
                new vscode.Range( position, position ),
            );
            return [ item ];
        } catch ( error ) {
            if ( abortController.signal.aborted || token.isCancellationRequested ) {
                return undefined;
            }
            this.log.error( `[Mistral FIM] error: ${ error instanceof Error ? error.message : String( error ) }` );
            return undefined;
        } finally {
            sub.dispose();
        }
    }
}
