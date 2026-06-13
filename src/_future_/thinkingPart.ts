import * as vscode from 'vscode';
import { LanguageModelTextPart, Progress, LanguageModelResponsePart } from 'vscode';

type ThinkingPartCtor = new ( value: string ) => LanguageModelResponsePart;

const thinkingPartCtor = ( vscode as unknown as { LanguageModelThinkingPart?: ThinkingPartCtor; } ).LanguageModelThinkingPart;

let loggedFallback = false;

export function reportThinking (
    text: string,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( msg: string ) => void; info: ( msg: string ) => void; },
): void {
    if ( !text ) {
        return;
    }
    if ( thinkingPartCtor ) {
        progress.report( new thinkingPartCtor( text ) );
        log.debug( `[Mistral][probe] thinking part emitted len=${ text.length }` );
        return;
    }
    if ( !loggedFallback ) {
        loggedFallback = true;
        log.info( `[Mistral] LanguageModelThinkingPart unavailable - streaming reasoning as text` );
    }
    progress.report( new LanguageModelTextPart( text ) );
}
