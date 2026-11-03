import { LanguageModelTextPart, LanguageModelToolCallPart, LanguageModelToolResultPart } from 'vscode';

export function ExtractText ( part: unknown ): string {
    if ( part instanceof LanguageModelTextPart ) {
        return part.value;
    }
    if ( part instanceof LanguageModelToolCallPart ) {
        return part.name + JSON.stringify( part.input );
    }
    if ( part instanceof LanguageModelToolResultPart ) {
        return part.content
            .filter( part => {
                return part instanceof LanguageModelTextPart;
            } )
            .map( part => {
                return ( part as LanguageModelTextPart ).value;
            } )
            .join( `` );
    }
    return ``;
}
