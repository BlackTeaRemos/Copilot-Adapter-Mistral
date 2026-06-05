import * as vscode from 'vscode';
import { MistralChatModelProvider } from './provider.js';
import { getStatusCode, getErrorName, getErrorMessage } from './assertions/index.js';

function getUserFriendlyError ( error: unknown ): string {
    const statusCode = getStatusCode( error );
    if ( typeof statusCode === 'number' ) {
        switch ( statusCode ) {
            case 400:
                return 'Bad request — the message or parameters sent to Mistral were invalid. Check model options and message format.';
            case 401:
                return 'Invalid API key. Run "Mistral: Manage API Key" to update it.';
            case 403:
                return 'Access denied. Your API key lacks permission for this model or feature. Check your Mistral plan at console.mistral.ai.';
            case 404:
                return 'Model not found. The requested model may have been deprecated or renamed. Reload the window to refresh the model list.';
            case 408:
                return 'Request timed out. The model took too long to respond — try a shorter prompt or smaller context.';
            case 413:
                return 'Context too large. Reduce the number of messages or attached files and try again.';
            case 422:
                return 'Invalid request parameters. Check that your model options (temperature, topP, etc.) are within valid ranges.';
            case 429:
                return 'Rate limit exceeded. Too many requests — wait a moment and try again, or check your quota at console.mistral.ai.';
            case 500:
                return 'Mistral server error. The service encountered an internal error — try again shortly.';
            case 502:
                return 'Mistral gateway error. The service is temporarily unreachable — try again in a few seconds.';
            case 503:
                return 'Mistral service unavailable. The API may be under maintenance — check status.mistral.ai for updates.';
            case 504:
                return 'Mistral gateway timeout. The service did not respond in time — try again or use a shorter prompt.';
        }
        if ( statusCode >= 500 ) {
            return `Mistral server error (${ statusCode }). Try again shortly or check status.mistral.ai.`;
        }
        if ( statusCode >= 400 ) {
            return `Request rejected by Mistral (HTTP ${ statusCode }). Check the output channel for details.`;
        }
    }

    const name = getErrorName( error );
    if ( name === 'AbortError' || name === 'CancelledError' ) {
        return 'Request cancelled.';
    }

    const message = getErrorMessage( error );
    if ( message && message.length > 0 ) {
        if ( message.toLowerCase().includes( 'network' ) || message.toLowerCase().includes( 'fetch' ) ) {
            return 'Network error — check your internet connection and try again.';
        }
        return message;
    }

    return 'An unexpected error occurred. Check the Mistral output channel for details.';
}

export function activate ( context: vscode.ExtensionContext ) {
    const logOutputChannel = vscode.window.createOutputChannel( 'Mistral Models', { log: true } );
    const usageStatusBar = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Left, 100 );
    usageStatusBar.name = 'Mistral Usage';
    usageStatusBar.hide();

    const provider = new MistralChatModelProvider( context, logOutputChannel, true, usageStatusBar );
    context.subscriptions.push(
        vscode.lm.registerLanguageModelChatProvider( 'mistral', provider ),
        vscode.commands.registerCommand( 'mistral-adapter.manageApiKey', async () => {
            await provider.setApiKey();
        } ),
        { dispose: () => provider.dispose() },
    );

    context.subscriptions.push( logOutputChannel, usageStatusBar );

    const participantHandler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
    ): Promise<void> => {
        const messages: vscode.LanguageModelChatMessage[] = [];
        const maybeChatResponseTurn2Ctor =
            'ChatResponseTurn2' in vscode
                ? ( vscode as unknown as { ChatResponseTurn2?: new ( ...args: unknown[] ) => unknown; } ).ChatResponseTurn2
                : undefined;

        const extractResponseText = ( responseParts: readonly unknown[] ): string => {
            return responseParts
                .filter( ( r ): r is vscode.ChatResponseMarkdownPart => r instanceof vscode.ChatResponseMarkdownPart )
                .map( r => r.value.value )
                .join( '' );
        };

        for ( const turn of chatContext.history ) {
            if ( turn instanceof vscode.ChatRequestTurn ) {
                messages.push( vscode.LanguageModelChatMessage.User( turn.prompt ) );
            } else if ( turn instanceof vscode.ChatResponseTurn ) {
                const text = extractResponseText( turn.response );
                if ( text ) {
                    messages.push( vscode.LanguageModelChatMessage.Assistant( text ) );
                }
            } else if ( maybeChatResponseTurn2Ctor && ( turn as object ) instanceof maybeChatResponseTurn2Ctor ) {
                const responseParts = ( turn as { response: readonly unknown[]; } ).response;
                const text = extractResponseText( responseParts );
                if ( text ) {
                    messages.push( vscode.LanguageModelChatMessage.Assistant( text ) );
                }
            }
        }

        messages.push( vscode.LanguageModelChatMessage.User( request.prompt ) );

        try {
            const response = await request.model.sendRequest( messages, undefined, token );
            for await ( const chunk of response.stream ) {
                if ( chunk instanceof vscode.LanguageModelTextPart ) {
                    stream.markdown( chunk.value );
                }
            }
        } catch ( error ) {
            const userMessage = getUserFriendlyError( error );
            stream.markdown( `Error: ${ userMessage }` );
            logOutputChannel.error( `[Mistral] Chat participant error: ${ String( error ) }` );
        }
    };

    const participant = vscode.chat.createChatParticipant( 'mistral-api-for-copilot-adapter.mistral', participantHandler );
    participant.iconPath = vscode.Uri.file( `${ context.extensionUri.fsPath }/logo.png` );
    context.subscriptions.push( participant );
}

export function deactivate () { }
