import type { LanguageModelChatRequestMessage } from 'vscode';
import type { MistralMessage, MistralToolCall, ToolCallIdMap } from '../../types.js';
import { toMistralRole } from '../toMistralRole.js';
import { ProcessMessageParts } from './processMessageParts.js';

export function BuildMistralMessage (
    message: LanguageModelChatRequestMessage,
    toolNameByCallId: Map<string, string>,
    toolCallIdMap: ToolCallIdMap,
    outputMessages: MistralMessage[],
): void {
    const role = toMistralRole( message.role );
    const textParts: string[] = [];
    const imageParts: { mimeType: string; data: Uint8Array; }[] = [];
    const toolCalls: MistralToolCall[] = [];
    const toolResults: { callId: string; content: string; }[] = [];

    ProcessMessageParts( message, textParts, imageParts, toolNameByCallId, toolCallIdMap, toolCalls, toolResults );

    const content = textParts.join( `` );

    let messageContent: MistralMessage[ `content` ] | undefined;
    if ( imageParts.length > 0 ) {
        const chunks: ({ type: `text`; text: string; } | { type: `image_url`; imageUrl: string; })[] = [];
        if ( content.length > 0 ) {
            chunks.push( { type: `text`, text: content } );
        }
        for ( const imagePart of imageParts ) {
            chunks.push( {
                type: `image_url`,
                imageUrl: `data:${ imagePart.mimeType };base64,${ Buffer.from( imagePart.data ).toString( `base64` ) }`,
            } );
        }
        messageContent = chunks;
    } else if ( content.length > 0 ) {
        messageContent = content;
    }

    if ( messageContent === undefined && toolCalls.length === 0 && toolResults.length === 0 ) {
        return;
    }
    const hasWrapper = messageContent !== undefined || toolCalls.length > 0;
    if ( hasWrapper ) {
        if ( role === `assistant` ) {
            outputMessages.push( {
                role,
                content: messageContent ?? null,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            } );
        } else if ( role === `system` ) {
            outputMessages.push( { role: `system`, content: typeof messageContent === `string` ? messageContent : `` } );
        } else {
            outputMessages.push( { role: `user`, content: messageContent ?? `` } );
        }
    }

    for ( const toolResult of toolResults ) {
        outputMessages.push( {
            role: `tool`,
            content: toolResult.content,
            toolCallId: toolResult.callId,
            name: toolNameByCallId.get( toolResult.callId ),
        } );
    }
}
