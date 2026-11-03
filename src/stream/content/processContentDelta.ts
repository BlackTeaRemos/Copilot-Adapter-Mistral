import type { LanguageModelResponsePart, Progress } from 'vscode';
import type { ContentDeltaState } from './contentDeltaState.js';
import { FindPendingTagLength } from './findPendingTagLength.js';
import { ReportContentText } from './reportContentText.js';

const THINK_OPEN = `<think>`;
const THINK_CLOSE = `</think>`;

export function processContentDelta (
    raw: string,
    state: ContentDeltaState,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( message: string ) => void; info: ( message: string ) => void },
): void {
    let remaining = state.pendingText + raw;
    state.pendingText = ``;
    while ( remaining.length > 0 ) {
        const tag = state.thinkDepth > 0 ? THINK_CLOSE : THINK_OPEN;
        const tagIndex = remaining.indexOf( tag );
        if ( tagIndex < 0 ) {
            const pendingLength = FindPendingTagLength( remaining, tag );
            const contentLength = remaining.length - pendingLength;
            ReportContentText( remaining.slice( 0, contentLength ), state, progress, log );
            state.pendingText = remaining.slice( contentLength );
            return;
        }
        ReportContentText( remaining.slice( 0, tagIndex ), state, progress, log );
        state.thinkDepth = state.thinkDepth > 0 ? 0 : 1;
        remaining = remaining.slice( tagIndex + tag.length );
    }
}
