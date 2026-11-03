import type { LanguageModelChatRequestMessage } from 'vscode';
import type { MistralMessage, ToolCallIdMap } from '../types.js';
import { BuildMistralMessage } from './messageConversion/buildMistralMessage.js';

export function toMistralMessages (
    messages: readonly LanguageModelChatRequestMessage[],
    toolCallIdMap: ToolCallIdMap,
): MistralMessage[] {
    const outputMessages: MistralMessage[] = [];
    const toolNameByCallId = new Map<string, string>();
    for ( const message of messages ) {
        BuildMistralMessage( message, toolNameByCallId, toolCallIdMap, outputMessages );
    }
    return outputMessages;
}
