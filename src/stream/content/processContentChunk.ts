import type { ContentChunk } from '@mistralai/mistralai/models/components';
import type { LanguageModelResponsePart, Progress } from 'vscode';
import { reportThinking } from '../../_future_/thinkingPart.js';
import { processContentDelta } from './processContentDelta.js';
import type { StreamContext } from '../streamContext.js';
import type { StreamLogger } from '../streamLogger.js';

export function ProcessContentChunk (
    chunk: ContentChunk,
    context: StreamContext,
    progress: Progress<LanguageModelResponsePart>,
    log: StreamLogger,
): void {
    if ( chunk.type === `thinking` ) {
        const thinking = ( chunk as { thinking?: { type?: string; text?: string }[] } ).thinking ?? [];
        const text = thinking.map( part => {
            return part.type === `text` || part.text !== undefined ? part.text ?? `` : ``;
        } ).join( `` );
        if ( text ) {
            reportThinking( text, progress, log );
        }
        return;
    }
    const text = ( chunk as { text?: string } ).text;
    if ( typeof text === `string` && text ) {
        processContentDelta( text, context.contentState, progress, log );
    }
}
