import { LanguageModelTextPart, LanguageModelToolCallPart, Progress, LanguageModelResponsePart } from 'vscode';
import type { ToolCallBuffer, ToolCallIdMap } from '../types.js';
import { toJsonObject } from '../assertions/index.js';
import { getOrCreateVsCodeToolCallId } from '../conversion/index.js';

export type ToolCallState = {
    buffers: Map<string, ToolCallBuffer>;
    emitted: Set<string>;
};

export function createToolCallState(): ToolCallState {
    return { buffers: new Map(), emitted: new Set() };
}

export function processToolCallDelta(
    toolCalls: Array<{ id?: string; function?: { name?: string; arguments?: string | Record<string, unknown>; }; }>,
    state: ToolCallState,
    map: ToolCallIdMap,
    progress: Progress<LanguageModelResponsePart>,
    log: { info: ( msg: string ) => void; debug: ( msg: string ) => void; },
): void {
    for ( const toolCall of toolCalls ) {
        const mistralId = toolCall.id;
        if ( !mistralId || mistralId === `null` ) {
            log.debug( `[Mistral] tool call delta skipped — missing or null id` );
            continue;
        }

        const vsCodeId = getOrCreateVsCodeToolCallId( map, mistralId );
        const isNew = !state.buffers.has( vsCodeId );
        const buf = state.buffers.get( vsCodeId ) ?? { argsText: `` };

        if ( toolCall.function?.name ) {
            buf.name = toolCall.function.name;
            if ( isNew ) {
                log.debug( `[Mistral] tool call new buffer — mistralId=${ mistralId } vsCodeId=${ vsCodeId } name=${ buf.name }` );
            }
        }

        const args = toolCall.function?.arguments;
        if ( typeof args === `string` ) {
            buf.argsText += args;
        } else if ( args && typeof args === `object` ) {
            buf.argsText = JSON.stringify( args );
        }

        log.debug( `[Mistral] tool call buffer vsCodeId=${ vsCodeId } name=${ buf.name ?? `(pending)` } argsLen=${ buf.argsText.length }` );
        state.buffers.set( vsCodeId, buf );

        if ( !state.emitted.has( vsCodeId ) && buf.name && buf.argsText ) {
            try {
                const parsed: unknown = JSON.parse( buf.argsText );
                const parsedObj = toJsonObject( parsed );
                log.info( `[Mistral] Emitting tool call id=${ vsCodeId } name=${ buf.name } argsLen=${ buf.argsText.length }` );
                progress.report( new LanguageModelToolCallPart( vsCodeId, buf.name, parsedObj ) );
                state.emitted.add( vsCodeId );
            } catch {
                log.debug( `[Mistral] tool call args not yet valid JSON, buffering — vsCodeId=${ vsCodeId } argsLen=${ buf.argsText.length }` );
            }
        }
    }
}

export function flushToolCallState(
    state: ToolCallState,
    progress: Progress<LanguageModelResponsePart>,
    log: { info: ( msg: string ) => void; warn: ( msg: string ) => void; },
): void {
    for ( const [vsCodeId, buf] of state.buffers ) {
        if ( state.emitted.has( vsCodeId ) || !buf.name ) {
            continue;
        }
        let parsedArgs: unknown;
        try {
            parsedArgs = buf.argsText ? JSON.parse( buf.argsText ) : {};
        } catch {
            log.warn(
                `[Mistral] Tool call "${ buf.name }" has invalid JSON arguments: ${ String( buf.argsText ).substring( 0, 100 ) }`,
            );
            progress.report(
                new LanguageModelTextPart(
                    `[Warning: Tool call "${ buf.name }" produced invalid arguments and was skipped.]\n`,
                ),
            );
            state.emitted.add( vsCodeId );
            continue;
        }
        const parsedArgsObj = toJsonObject( parsedArgs );
        log.info( `[Mistral] Flushing tool call id=${ vsCodeId } name=${ buf.name }` );
        progress.report( new LanguageModelToolCallPart( vsCodeId, buf.name, parsedArgsObj ) );
        state.emitted.add( vsCodeId );
    }
}
