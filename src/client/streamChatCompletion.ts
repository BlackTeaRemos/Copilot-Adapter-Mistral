import { Mistral } from '@mistralai/mistralai';
import type { ChatCompletionStreamRequest, CompletionEvent } from '@mistralai/mistralai/models/components';
import type { MistralClientLogger } from './clientLogger.js';
import { toMistralMessageShape } from '../assertions/index.js';

export async function streamChatCompletion (
    client: Mistral,
    request: ChatCompletionStreamRequest,
    signal: AbortSignal,
    log: MistralClientLogger,
): Promise<AsyncIterable<CompletionEvent>> {
    log.debug(
        `[Mistral] streamChatCompletion — model=${ request.model }` +
        ` messages=${ request.messages?.length ?? 0 }` +
        ` maxTokens=${ request.maxTokens ?? 'default' }` +
        ` temperature=${ request.temperature ?? 'default' }` +
        ` topP=${ request.topP ?? 'default' }` +
        ` tools=${ request.tools?.length ?? 0 }` +
        ` toolChoice=${ request.toolChoice ?? 'none' }` +
        ` parallelToolCalls=${ request.parallelToolCalls ?? false }`,
    );
    if ( request.messages ) {
        for ( let i = 0; i < request.messages.length; i++ ) {
            const msg = toMistralMessageShape( request.messages[ i ] );
            const contentLen =
                typeof msg.content === 'string' ? msg.content.length
                    : Array.isArray( msg.content ) ? msg.content.length
                        : 0;
            log.debug(
                `[Mistral]   message[${ i }] role=${ msg.role ?? 'unknown' }` +
                ` contentLen=${ contentLen }` +
                ( msg.toolCalls ? ` toolCalls=${ msg.toolCalls.length }` : '' ),
            );
        }
    }
    return client.chat.stream( request, { signal } ) as Promise<AsyncIterable<CompletionEvent>>;
}
