import { LanguageModelChatMessageRole, type LanguageModelChatRequestMessage } from 'vscode';

export function CreateUserMessage ( ...parts: unknown[] ): LanguageModelChatRequestMessage {
    return { role: LanguageModelChatMessageRole.User, content: parts, name: undefined };
}
