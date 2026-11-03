import type { LanguageModelResponsePart, Progress } from 'vscode';
import type { ContentDeltaState } from './contentDeltaState.js';
import { ReportContentText } from './reportContentText.js';

export function flushContentDeltaState (
    state: ContentDeltaState,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( message: string ) => void; info: ( message: string ) => void },
): void {
    ReportContentText( state.pendingText, state, progress, log );
    state.pendingText = ``;
    if ( state.thinkDepth > 0 ) {
        log.debug( `[Mistral] stream ended inside think block (depth ${ state.thinkDepth })` );
        state.thinkDepth = 0;
    }
}
