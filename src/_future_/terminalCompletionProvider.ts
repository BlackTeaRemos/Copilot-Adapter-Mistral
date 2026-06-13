import * as vscode from 'vscode';
import type { Mistral } from '@mistralai/mistralai';

const MIN_INPUT_LENGTH = 3;
const MAX_SUGGESTIONS = 5;

interface TerminalCompletionItemLike {
    label: string;
    replacementRange: readonly [ number, number ];
    kind?: number;
}

interface TerminalCompletionContextLike {
    readonly commandLine: string;
    readonly cursorIndex: number;
}

interface TerminalCompletionProviderLike {
    provideTerminalCompletions (
        terminal: unknown,
        context: TerminalCompletionContextLike,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<TerminalCompletionItemLike[]>;
}

type RegisterTerminalCompletionProvider = (
    provider: TerminalCompletionProviderLike,
    ...triggerCharacters: string[]
) => vscode.Disposable;

function isEnabled (): boolean {
    return vscode.workspace.getConfiguration( `mistral` ).get<boolean>( `terminalCompletionEnabled` ) ?? false;
}

function smallModelId (): string {
    const qualified = vscode.workspace.getConfiguration( `mistral` ).get<string>( `utilitySmallModel` ) || `mistral/mistral-small-latest`;
    return qualified.startsWith( `mistral/` ) ? qualified.slice( `mistral/`.length ) : qualified;
}

async function suggestCommands (
    client: Mistral,
    model: string,
    commandLine: string,
    signal: AbortSignal,
    log: vscode.LogOutputChannel,
): Promise<string[]> {
    const response = await client.chat.complete( {
        model,
        maxTokens: 64,
        temperature: 0.2,
        messages: [
            {
                role: `system`,
                content: `You complete shell commands. Given a partial command line, return up to ${ MAX_SUGGESTIONS } likely full commands, one per line, no explanations, no markdown, no numbering.`,
            },
            { role: `user`, content: commandLine },
        ],
    }, { fetchOptions: { signal } } );
    const content = response.choices?.[ 0 ]?.message?.content;
    const text = typeof content === `string`
        ? content
        : Array.isArray( content )
            ? content.map( c => {
                return ( `text` in c ? c.text ?? `` : `` );
            } ).join( `` )
            : ``;
    const lines = text.split( `\n` ).map( l => {
        return l.trim();
    } ).filter( l => {
        return l.length > 0;
    } );
    log.debug( `[Mistral][probe] terminal suggestions model=${ model } count=${ lines.length }` );
    return lines.slice( 0, MAX_SUGGESTIONS );
}

export function registerMistralTerminalCompletions (
    getClient: () => Promise<Mistral | null>,
    log: vscode.LogOutputChannel,
): vscode.Disposable {
    const register = ( vscode.window as unknown as { registerTerminalCompletionProvider?: RegisterTerminalCompletionProvider; } )
        .registerTerminalCompletionProvider;
    if ( typeof register !== `function` ) {
        log.info( `[Mistral] registerTerminalCompletionProvider unavailable - terminal completions disabled` );
        return { dispose () { } };
    }

    const provider: TerminalCompletionProviderLike = {
        async provideTerminalCompletions ( _terminal, context, token ) {
            if ( !isEnabled() || token.isCancellationRequested ) {
                return [];
            }
            const prefix = context.commandLine.slice( 0, context.cursorIndex );
            if ( prefix.trim().length < MIN_INPUT_LENGTH ) {
                return [];
            }
            const client = await getClient();
            if ( !client || token.isCancellationRequested ) {
                return [];
            }
            const abort = new AbortController();
            token.onCancellationRequested( () => {
                return abort.abort();
            } );
            try {
                log.info( `[Mistral][probe] provideTerminalCompletions len=${ prefix.length }` );
                const commands = await suggestCommands( client, smallModelId(), prefix, abort.signal, log );
                if ( token.isCancellationRequested ) {
                    return [];
                }
                const range: readonly [ number, number ] = [ 0, context.cursorIndex ];
                return commands.map( cmd => {
                    return { label: cmd, replacementRange: range };
                } );
            } catch ( error ) {
                log.debug( `[Mistral] terminal completion error: ` + String( error ) );
                return [];
            }
        },
    };

    try {
        const disposable = register( provider );
        log.info( `[Mistral][probe] terminal completion provider registered` );
        return disposable;
    } catch ( error ) {
        log.info( `[Mistral] terminal completion registration failed (proposal not enabled): ` + String( error ) );
        return { dispose () { } };
    }
}
