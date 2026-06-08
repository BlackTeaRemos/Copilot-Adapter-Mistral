import { LanguageModelTextPart, Progress, LanguageModelResponsePart } from 'vscode';

export type ContentDeltaState = {
    thinkDepth: number;
    thinkBuffer: string;
};

export function createContentDeltaState(): ContentDeltaState {
    return { thinkDepth: 0, thinkBuffer: `` };
}

const THINK_OPEN = `<think>`;
const THINK_CLOSE = `</think>`;

function reportText(
    text: string,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( msg: string ) => void; },
): void {
    if ( text ) {
        log.debug( `[Mistral] content delta: ` + text.slice( 0, 200 ) );
        progress.report( new LanguageModelTextPart( text ) );
    }
}

export function processContentDelta(
    raw: string,
    state: ContentDeltaState,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( msg: string ) => void; },
): void {
    let i = 0;
    while ( i < raw.length ) {
        const tagIdx = state.thinkDepth > 0
            ? raw.indexOf( THINK_CLOSE, i )
            : raw.indexOf( THINK_OPEN, i );

        if ( tagIdx === -1 ) {
            if ( state.thinkDepth > 0 ) {
                state.thinkBuffer += raw.slice( i );
            } else {
                reportText( raw.slice( i ), progress, log );
            }
            return;
        }

        if ( state.thinkDepth > 0 ) {
            state.thinkBuffer += raw.slice( i, tagIdx );
            log.debug( `[Mistral] think block closed — buffered ${ state.thinkBuffer.length } chars, depth ${ state.thinkDepth } → ${ state.thinkDepth - 1 }` );
            state.thinkBuffer = ``;
            state.thinkDepth--;
            i = tagIdx + THINK_CLOSE.length;
        } else {
            reportText( raw.slice( i, tagIdx ), progress, log );
            log.debug( `[Mistral] think block opened — depth 0 → 1` );
            state.thinkDepth++;
            i = tagIdx + THINK_OPEN.length;
        }
    }
}

export function flushContentDeltaState(
    state: ContentDeltaState,
    log: { debug: ( msg: string ) => void; },
): void {
    if ( state.thinkBuffer.length > 0 ) {
        log.debug( `[Mistral] thinking delta length (flush): ` + state.thinkBuffer.length );
        state.thinkBuffer = ``;
    }
}
