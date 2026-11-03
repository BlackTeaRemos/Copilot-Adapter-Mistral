const UTILITY_INITIATOR_PREFIXES = [ `vscode.chat-title`, `vscode.chat-summary`, `vscode.editor`, `github.copilot.editsAgent.summary` ];

export function IsInteractiveInitiator ( initiator: string | undefined ): boolean {
    if ( !initiator ) {
        return false;
    }
    if ( UTILITY_INITIATOR_PREFIXES.some( prefix => {
        return initiator.startsWith( prefix );
    } ) ) {
        return false;
    }
    return true;
}
