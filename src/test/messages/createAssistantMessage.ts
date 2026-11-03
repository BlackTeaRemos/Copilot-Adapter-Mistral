import { LanguageModelChatMessageRole, type LanguageModelChatRequestMessage } from 'vscode';

export function CreateAssistantMessage ( ...parts: unknown[] ): LanguageModelChatRequestMessage {
    return { role: LanguageModelChatMessageRole.Assistant, content: parts, name: undefined };
}
