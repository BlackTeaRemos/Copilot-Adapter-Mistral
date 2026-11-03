import type { CompletionEvent, ContentChunk } from '@mistralai/mistralai/models/components';
import type { Progress, LanguageModelResponsePart } from 'vscode';
import { processContentDelta } from './content/processContentDelta.js';
import { ProcessContentChunk } from './content/processContentChunk.js';
import { processToolCallDelta, flushToolCallState } from './toolCalls/index.js';
import { UsageAccumulator } from './usageAccumulator.js';
import type { StreamContext } from './streamContext.js';
import type { StreamLogger } from './streamLogger.js';

export type { StreamContext } from './streamContext.js';
export type { StreamLogger } from './streamLogger.js';

export function processStreamEvent (
    event: CompletionEvent,
    context: StreamContext,
    progress: Progress<LanguageModelResponsePart>,
    log: StreamLogger,
): void {
    const chunk = event.data;
    if ( chunk?.model && chunk.model !== context.servedModel ) {
        context.servedModel = chunk.model;
        log.info( `[Mistral] served by model: ${ chunk.model }` );
    }
    if ( chunk?.usage ) {
        new UsageAccumulator().Record( chunk.usage, context.usage, log );
    }
    const choice = chunk?.choices?.[ 0 ];
    if ( !choice ) {
        return;
    }
    const finishReason = choice.finishReason;
    if ( finishReason ) {
        context.finishReason = finishReason;
        if ( finishReason !== `stop` && finishReason !== `length` && finishReason !== `tool_calls` && !context.failureReason ) {
            context.failureReason = finishReason;
        }
    }
    if ( finishReason === `length` ) {
        context.truncated = true;
        log.warn( `[Mistral] response truncated - length termination` );
    }
    const delta = choice.delta;
    if ( typeof delta?.content === `string` ) {
        processContentDelta( delta.content, context.contentState, progress, log );
    } else if ( delta?.content ) {
        for ( const content of delta.content ) {
            ProcessContentChunk( content as ContentChunk, context, progress, log );
        }
    }
    if ( delta?.toolCalls ) {
        processToolCallDelta( delta.toolCalls, context.toolCallState, context.map, progress, log );
    }
    if ( !context.truncated && !context.failureReason && ( finishReason === `stop` || finishReason === `tool_calls` ) ) {
        flushToolCallState( context.toolCallState, progress, log );
    }
}
