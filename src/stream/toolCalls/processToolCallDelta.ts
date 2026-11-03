import type { LanguageModelResponsePart, Progress } from 'vscode';
import type { ToolCallIdMap } from '../../types.js';
import { getOrCreateVsCodeToolCallId } from '../../conversion/index.js';
import type { IncomingToolCallDelta } from './incomingToolCallDelta.js';
import type { ToolCallState } from './toolCallState.js';

export function processToolCallDelta (
    toolCalls: IncomingToolCallDelta[],
    state: ToolCallState,
    map: ToolCallIdMap,
    _progress: Progress<LanguageModelResponsePart>,
    log: { info: ( message: string ) => void; debug: ( message: string ) => void },
): void {
    for ( const toolCall of toolCalls ) {
        const index = typeof toolCall.index === `number` && Number.isSafeInteger( toolCall.index ) && toolCall.index >= 0
            ? toolCall.index
            : undefined;
        const explicitId = toolCall.id && toolCall.id !== `null` ? toolCall.id : undefined;
        const mistralId = explicitId ?? ( index === undefined ? undefined : state.idsByIndex.get( index ) );
        if ( !mistralId ) {
            log.debug( `[Mistral] tool call delta skipped - no established id for index=${ index ?? `missing` }` );
            continue;
        }
        if ( index !== undefined ) {
            state.idsByIndex.set( index, mistralId );
        }
        const vsCodeId = getOrCreateVsCodeToolCallId( map, mistralId );
        if ( state.emitted.has( vsCodeId ) ) {
            continue;
        }
        const buffer = state.buffers.get( vsCodeId ) ?? { argsText: `` };
        if ( toolCall.function?.name ) {
            buffer.name = toolCall.function.name;
        }
        const argumentsDelta = toolCall.function?.arguments;
        if ( typeof argumentsDelta === `string` ) {
            buffer.argsText += argumentsDelta;
        } else if ( argumentsDelta && typeof argumentsDelta === `object` ) {
            buffer.argsText = JSON.stringify( argumentsDelta );
        }
        state.buffers.set( vsCodeId, buffer );
        log.debug( `[Mistral] tool call buffered id=${ vsCodeId } name=${ buffer.name ?? `pending` } argsLen=${ buffer.argsText.length }` );
    }
}
