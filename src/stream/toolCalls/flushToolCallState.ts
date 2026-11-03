import { LanguageModelTextPart, LanguageModelToolCallPart, type Progress, type LanguageModelResponsePart } from 'vscode';
import type { ToolCallState } from './toolCallState.js';

export function flushToolCallState (
    state: ToolCallState,
    progress: Progress<LanguageModelResponsePart>,
    log: { info: ( message: string ) => void; warn: ( message: string ) => void },
): void {
    for ( const [ vsCodeId, buffer ] of state.buffers ) {
        if ( state.emitted.has( vsCodeId ) || !buffer.name ) {
            continue;
        }
        let argumentsObject: Record<string, unknown>;
        try {
            const parsed: unknown = buffer.argsText ? JSON.parse( buffer.argsText ) : {};
            if ( parsed === null || typeof parsed !== `object` || Array.isArray( parsed ) ) {
                throw new TypeError( `Tool arguments must be an object` );
            }
            argumentsObject = parsed as Record<string, unknown>;
        } catch {
            log.warn( `[Mistral] Tool call "${ buffer.name }" has invalid object arguments and was skipped.` );
            progress.report( new LanguageModelTextPart( `[Warning: Tool call "${ buffer.name }" produced invalid arguments and was skipped.]\n` ) );
            state.emitted.add( vsCodeId );
            continue;
        }
        log.info( `[Mistral] Flushing tool call id=${ vsCodeId } name=${ buffer.name }` );
        progress.report( new LanguageModelToolCallPart( vsCodeId, buffer.name, argumentsObject ) );
        state.emitted.add( vsCodeId );
    }
}
