import type { CompletionEvent, ContentChunk } from '@mistralai/mistralai/models/components';
import { Progress, LanguageModelResponsePart } from 'vscode';
import type { ToolCallIdMap, UsageStats } from '../types.js';
import { processContentDelta, ContentDeltaState } from './processContentDelta.js';
import { reportThinking } from './thinkingPart.js';
import { processToolCallDelta, flushToolCallState, ToolCallState } from './processToolCallDelta.js';

function processContentChunk (
    chunk: ContentChunk,
    ctx: StreamContext,
    progress: Progress<LanguageModelResponsePart>,
    log: StreamLogger,
): void {
    const type = ( chunk as { type?: string } ).type;
    if ( type === `thinking` ) {
        const thinking = ( chunk as { thinking?: Array<{ type?: string; text?: string }> } ).thinking ?? [];
        const text = thinking.map( t => {
            return t.type === `text` || t.text !== undefined ? t.text ?? `` : ``;
        } ).join( `` );
        if ( text ) {
            log.trace( `[Mistral] thinking chunk len=${ text.length }` );
            reportThinking( text, progress, log );
        }
        return;
    }
    const text = ( chunk as { text?: string } ).text;
    if ( typeof text === `string` && text ) {
        log.trace( `[Mistral] content chunk len=${ text.length }` );
        processContentDelta( text, ctx.contentState, progress, log );
    }
}

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
        // promptTokens already includes all prior context - take the max to avoid double-counting.
        // completionTokens is cumulative across the conversation.
        const prompt = chunk.usage.promptTokens ?? 0;
        const completion = chunk.usage.completionTokens ?? 0;
        const total = chunk.usage.totalTokens;
        ctx.usage.input = Math.max( ctx.usage.input, prompt );
        ctx.usage.lastPrompt = prompt;
        ctx.usage.output += completion;
        // Streaming chunk.usage is the plain UsageInfo type, which carries cache fields only via its
        // catchall (raw snake_case). Mistral has used several shapes across versions - try each.
        const rawUsage = chunk.usage as Record<string, unknown>;
        const detail = ( rawUsage[ `prompt_tokens_details` ] ?? rawUsage[ `prompt_token_details` ] ) as
            { cached_tokens?: number; } | undefined;
        const cached = detail?.cached_tokens ?? ( rawUsage[ `num_cached_tokens` ] as number | undefined ) ?? 0;
        if ( cached > 0 ) {
            ctx.usage.cached = Math.max( ctx.usage.cached, cached );
        }
        log.trace(
            `[Mistral] token usage - prompt: ${ prompt }, completion: ${ completion }, cached: ${ cached }` +
            ( total !== undefined ? `, total: ${ total }` : `` ),
        );
    }

    const choice = chunk?.choices?.[ 0 ];
    if ( !choice ) {
        log.trace( `[Mistral] stream chunk has no choices, skipping` );
        return;
    }

    const finishReason = choice.finishReason;
    if ( finishReason ) {
        log.trace( `[Mistral] stream chunk finishReason=${ finishReason }` );
        if ( finishReason === `length` ) {
            ctx.truncated = true;
            log.warn( `[Mistral] response truncated - hit maxTokens limit` );
        }
    }

    const delta = choice.delta;

    if ( delta?.content ) {
        if ( typeof delta.content === `string` ) {
            if ( delta.content ) {
                log.trace( `[Mistral] content delta len=${ delta.content.length }` );
                processContentDelta( delta.content, ctx.contentState, progress, log );
            }
        } else {
            for ( const chunk of delta.content ) {
                processContentChunk( chunk as ContentChunk, ctx, progress, log );
            }
        }
    }

    if ( delta?.toolCalls ) {
        log.trace( `[Mistral] tool call delta count=${ delta.toolCalls.length }` );
        processToolCallDelta( delta.toolCalls, ctx.toolCallState, ctx.map, progress, log );
    }

    if ( finishReason === `stop` || finishReason === `tool_calls` ) {
        flushToolCallState( ctx.toolCallState, progress, log );
    }
}
