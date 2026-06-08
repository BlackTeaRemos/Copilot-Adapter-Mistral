import {
    LanguageModelChatMessage,
    LanguageModelDataPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from 'vscode';
import type { MistralMessage, MistralToolCall, ToolCallIdMap } from '../types.js';
import { toMistralRole } from './toMistralRole.js';
import { getOrCreateMistralToolCallId } from './toolCallIdMap.js';

export function toMistralMessages(
    messages: readonly LanguageModelChatMessage[],
    map: ToolCallIdMap,
): MistralMessage[] {
    const out: MistralMessage[] = [];
    const toolNameByCallId = new Map<string, string>();
    for ( const msg of messages ) {
        buildMistralMessage( msg, toolNameByCallId, map, out );
    }
    return out;
}

function buildMistralMessage(
    msg: LanguageModelChatMessage,
    toolNameByCallId: Map<string, string>,
    map: ToolCallIdMap,
    out: MistralMessage[],
): void {
    const role = toMistralRole( msg.role );
    const textParts: string[] = [];
    const imageParts: Array<{ mimeType: string; data: Uint8Array; }> = [];
    const toolCalls: MistralToolCall[] = [];
    const toolResults: Array<{ callId: string; content: string; }> = [];

    processMessageParts( msg, textParts, imageParts, toolNameByCallId, map, toolCalls, toolResults );

    const content = textParts.join( `` );

    let messageContent: MistralMessage[ `content` ] | undefined;
    if ( imageParts.length > 0 ) {
        const chunks: Array<{ type: `text`; text: string; } | { type: `image_url`; imageUrl: string; }> = [];
        if ( content.length > 0 ) {
            chunks.push( { type: `text`, text: content } );
        }
        for ( const img of imageParts ) {
            chunks.push( {
                type: `image_url`,
                imageUrl: `data:${ img.mimeType };base64,${ Buffer.from( img.data ).toString( `base64` ) }`,
            } );
        }
        messageContent = chunks;
    } else if ( content.length > 0 ) {
        messageContent = content;
    }

    if ( messageContent === undefined && toolCalls.length === 0 && toolResults.length === 0 ) {
        return;
    }

    // Only emit the wrapper when there is actual content or tool calls.
    // Tool results live in their own `tool` role messages — must NOT be preceded by an empty user turn.
    const hasWrapper = messageContent !== undefined || toolCalls.length > 0;
    if ( hasWrapper ) {
        if ( role === `assistant` ) {
            out.push( {
                role,
                content: messageContent ?? null,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            } );
        } else if ( role === `system` ) {
            // System messages (e.g. compaction summary injected by VS Code) pass through verbatim.
            // Text-only; images and tool parts in a system message are silently dropped.
            out.push( { role: `system`, content: typeof messageContent === `string` ? messageContent : `` } );
        } else {
            out.push( { role: `user`, content: messageContent ?? `` } );
        }
    }

    for ( const tr of toolResults ) {
        out.push( {
            role: `tool`,
            content: tr.content,
            toolCallId: tr.callId,
            name: toolNameByCallId.get( tr.callId ),
        } );
    }
}

function processMessageParts(
    msg: LanguageModelChatMessage,
    textParts: string[],
    imageParts: Array<{ mimeType: string; data: Uint8Array; }>,
    toolNameByCallId: Map<string, string>,
    map: ToolCallIdMap,
    toolCalls: MistralToolCall[],
    toolResults: Array<{ callId: string; content: string; }>,
): void {
    for ( const part of msg.content ) {
        if ( part instanceof LanguageModelTextPart ) {
            textParts.push( part.value );
        } else if ( part instanceof LanguageModelDataPart ) {
            if ( part.mimeType?.startsWith( `image/` ) ) {
                imageParts.push( { mimeType: part.mimeType, data: part.data } );
            } else {
                textParts.push( `[data:${ part.mimeType }]` );
            }
        } else if ( part instanceof LanguageModelToolCallPart ) {
            const mistralId = getOrCreateMistralToolCallId( map, part.callId );
            toolNameByCallId.set( mistralId, part.name );
            toolCalls.push( {
                id: mistralId,
                type: `function`,
                function: { name: part.name, arguments: JSON.stringify( part.input ?? {} ) },
            } );
        } else if ( part instanceof LanguageModelToolResultPart ) {
            const mistralId = getOrCreateMistralToolCallId( map, part.callId );
            const resultText = part.content
                .reduce( ( acc: string, p ) => {
                    return acc + ( p instanceof LanguageModelTextPart ? p.value : `` );
                }, `` );
            toolResults.push( {
                callId: mistralId,
                content: resultText.length > 0 ? resultText : JSON.stringify( part.content ),
            } );
        }
    }
}
