import { LanguageModelToolResult, LanguageModelTextPart } from 'vscode';

export function GetToolResultText ( result: unknown ): string {
    if ( !( result instanceof LanguageModelToolResult ) ) {
        throw new Error( `Expected a language-model tool result` );
    }
    return result.content.map( part => {
        return part instanceof LanguageModelTextPart ? part.value : ``;
    } ).join( `` );
}
