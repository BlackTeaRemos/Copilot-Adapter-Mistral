import {
    type LanguageModelChatRequestMessage,
    LanguageModelDataPart,
    LanguageModelTextPart,
    LanguageModelToolCallPart,
    LanguageModelToolResultPart,
} from 'vscode';
import type { MistralToolCall, ToolCallIdMap } from '../../types.js';
import { getOrCreateMistralToolCallId } from '../toolCallIdMap.js';

export function ProcessMessageParts (
    message: LanguageModelChatRequestMessage,
    textParts: string[],
    imageParts: { mimeType: string; data: Uint8Array; }[],
    toolNameByCallId: Map<string, string>,
    toolCallIdMap: ToolCallIdMap,
    toolCalls: MistralToolCall[],
    toolResults: { callId: string; content: string; }[],
): void {
    for ( const part of message.content ) {
        if ( part instanceof LanguageModelTextPart ) {
            textParts.push( part.value );
        } else if ( part instanceof LanguageModelDataPart ) {
            if ( part.mimeType?.startsWith( `image/` ) ) {
                imageParts.push( { mimeType: part.mimeType, data: part.data } );
            }
        } else if ( part instanceof LanguageModelToolCallPart ) {
            const mistralId = getOrCreateMistralToolCallId( toolCallIdMap, part.callId );
            toolNameByCallId.set( mistralId, part.name );
            toolCalls.push( {
                id: mistralId,
                type: `function`,
                function: { name: part.name, arguments: JSON.stringify( part.input ?? {} ) },
            } );
        } else if ( part instanceof LanguageModelToolResultPart ) {
            const mistralId = getOrCreateMistralToolCallId( toolCallIdMap, part.callId );
            const resultText = part.content
                .reduce( ( combinedText: string, resultPart ) => {
                    return combinedText + ( resultPart instanceof LanguageModelTextPart ? resultPart.value : `` );
                }, `` );
            toolResults.push( {
                callId: mistralId,
                content: resultText.length > 0 ? resultText : JSON.stringify( part.content ),
            } );
        }
    }
}
