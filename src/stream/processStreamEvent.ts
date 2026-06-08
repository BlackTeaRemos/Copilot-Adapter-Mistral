import type { CompletionEvent } from '@mistralai/mistralai/models/components';
import { Progress, LanguageModelResponsePart } from 'vscode';
import type { ToolCallIdMap, UsageStats } from '../types.js';
import { processContentDelta, ContentDeltaState } from './processContentDelta.js';
import { processToolCallDelta, flushToolCallState, ToolCallState } from './processToolCallDelta.js';

export type StreamContext = {
    contentState: ContentDeltaState;
    toolCallState: ToolCallState;
    map: ToolCallIdMap;
    usage: UsageStats;
    servedModel?: string;
    truncated?: boolean;
};

export type StreamLogger = {
    trace: ( msg: string ) => void;
    debug: ( msg: string ) => void;
    info: ( msg: string ) => void;
    warn: ( msg: string ) => void;
};

export function processStreamEvent (
    event: CompletionEvent,
    ctx: StreamContext,
    progress: Progress<LanguageModelResponsePart>,
    log: StreamLogger,
): void {
    const chunk = event.data;

    if ( chunk?.model && chunk.model !== ctx.servedModel ) {
        ctx.servedModel = chunk.model;
        log.info( `[Mistral] served by model: ${ chunk.model }` );
    }

    if ( chunk?.usage ) {
        // Mistral sends absolute totals for the current request (not deltas).
        // promptTokens already includes all prior context — take the max to avoid double-counting.
        // completionTokens is cumulative across the conversation.
        const prompt = chunk.usage.promptTokens ?? 0;
        const completion = chunk.usage.completionTokens ?? 0;
        const total = chunk.usage.totalTokens;
        ctx.usage.input = Math.max( ctx.usage.input, prompt );
        ctx.usage.lastPrompt = prompt;
        ctx.usage.output += completion;
        // Streaming chunk.usage is the plain UsageInfo type, which carries cache fields only via its
        // catchall (raw snake_case). Mistral has used several shapes across versions — try each.
        const rawUsage = chunk.usage as Record<string, unknown>;
        const detail = ( rawUsage[ 'prompt_tokens_details' ] ?? rawUsage[ 'prompt_token_details' ] ) as
            { cached_tokens?: number; } | undefined;
        const cached = detail?.cached_tokens ?? ( rawUsage[ 'num_cached_tokens' ] as number | undefined ) ?? 0;
        if ( cached > 0 ) { ctx.usage.cached = Math.max( ctx.usage.cached, cached ); }
        log.trace(
            `[Mistral] token usage — prompt: ${ prompt }, completion: ${ completion }, cached: ${ cached }` +
            ( total !== undefined ? `, total: ${ total }` : '' ),
        );
    }

    const choice = chunk?.choices?.[ 0 ];
    if ( !choice ) {
        log.trace( '[Mistral] stream chunk has no choices, skipping' );
        return;
    }

    const finishReason = choice.finishReason;
    if ( finishReason ) {
        log.trace( `[Mistral] stream chunk finishReason=${ finishReason }` );
        if ( finishReason === 'length' ) {
            ctx.truncated = true;
            log.warn( '[Mistral] response truncated — hit maxTokens limit' );
        }
    }

    const delta = choice.delta;

    if ( delta?.content ) {
        const content =
            typeof delta.content === 'string'
                ? delta.content
                : delta.content.map( c => ( 'text' in c ? c.text ?? '' : '' ) ).join( '' );
        if ( content ) {
            log.trace( `[Mistral] content delta len=${ content.length }` );
            processContentDelta( content, ctx.contentState, progress, log );
        }
    }

    if ( delta?.toolCalls ) {
        log.trace( `[Mistral] tool call delta count=${ delta.toolCalls.length }` );
        processToolCallDelta( delta.toolCalls, ctx.toolCallState, ctx.map, progress, log );
    }

    if ( finishReason === 'stop' || finishReason === 'tool_calls' ) {
        flushToolCallState( ctx.toolCallState, progress, log );
    }
}
