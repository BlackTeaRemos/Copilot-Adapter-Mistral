import { LanguageModelTextPart, Progress, LanguageModelResponsePart } from 'vscode';
import { reportThinking } from '../_future_/thinkingPart.js';

export type ContentDeltaState = {
    thinkDepth: number;
};

export function createContentDeltaState (): ContentDeltaState {
    return { thinkDepth: 0 };
}

const THINK_OPEN = `<think>`;
const THINK_CLOSE = `</think>`;

function reportText (
    text: string,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( msg: string ) => void; },
): void {
    if ( text ) {
        log.debug( `[Mistral] content delta: ` + text.slice( 0, 200 ) );
        progress.report( new LanguageModelTextPart( text ) );
    }
}

export function processContentDelta (
    raw: string,
    state: ContentDeltaState,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( msg: string ) => void; info: ( msg: string ) => void; },
): void {
    let i = 0;
    while ( i < raw.length ) {
        const tagIdx = state.thinkDepth > 0
            ? raw.indexOf( THINK_CLOSE, i )
            : raw.indexOf( THINK_OPEN, i );

        if ( tagIdx === -1 ) {
            if ( state.thinkDepth > 0 ) {
                reportThinking( raw.slice( i ), progress, log );
            } else {
                reportText( raw.slice( i ), progress, log );
            }
            return;
        }

        if ( state.thinkDepth > 0 ) {
            reportThinking( raw.slice( i, tagIdx ), progress, log );
            log.debug( `[Mistral] think block closed - depth ${ state.thinkDepth } → ${ state.thinkDepth - 1 }` );
            state.thinkDepth--;
            i = tagIdx + THINK_CLOSE.length;
        } else {
            reportText( raw.slice( i, tagIdx ), progress, log );
            log.debug( `[Mistral] think block opened - depth 0 → 1` );
            state.thinkDepth++;
            i = tagIdx + THINK_OPEN.length;
        }
    }
}

export function flushContentDeltaState (
    state: ContentDeltaState,
    log: { debug: ( msg: string ) => void; },
): void {
    if ( state.thinkDepth > 0 ) {
        log.debug( `[Mistral] stream ended inside think block (depth ${ state.thinkDepth })` );
        state.thinkDepth = 0;
    }
}
