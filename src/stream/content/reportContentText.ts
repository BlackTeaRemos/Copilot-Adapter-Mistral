import { LanguageModelTextPart, type LanguageModelResponsePart, type Progress } from 'vscode';
import { reportThinking } from '../../_future_/thinkingPart.js';
import type { ContentDeltaState } from './contentDeltaState.js';

export function ReportContentText (
    text: string,
    state: ContentDeltaState,
    progress: Progress<LanguageModelResponsePart>,
    log: { debug: ( message: string ) => void; info: ( message: string ) => void },
): void {
    if ( !text ) {
        return;
    }
    if ( state.thinkDepth > 0 ) {
        reportThinking( text, progress, log );
        return;
    }
    log.debug( `[Mistral] content delta: ` + text.slice( 0, 200 ) );
    progress.report( new LanguageModelTextPart( text ) );
}
