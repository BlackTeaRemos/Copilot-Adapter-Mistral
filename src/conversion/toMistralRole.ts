import { LanguageModelChatMessageRole } from 'vscode';

export function toMistralRole( role: LanguageModelChatMessageRole ): `user` | `assistant` | `system` {
    switch ( role ) {
        case LanguageModelChatMessageRole.User:
            return `user`;
        case LanguageModelChatMessageRole.Assistant:
            return `assistant`;
        default:
            if ( ( role as unknown ) === 3 ) {
                // LanguageModelChatMessageRole.System = 3 (forward compat)
                return `system`;
            }
            console.warn( `[Mistral] Unknown chat message role: ${ String( role ) }, mapping to 'user'` );
            return `user`;
    }
}
