import { describe, expect, it, vi } from 'vitest';
import { LanguageModelTextPart } from 'vscode';
import { processStreamEvent, type StreamContext } from './processStreamEvent.js';
import { createContentDeltaState } from './processContentDelta.js';
import { createToolCallState } from './processToolCallDelta.js';
import { createToolCallIdMap } from '../conversion/index.js';

const log = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

function ctx(): StreamContext {
    return {
        contentState: createContentDeltaState(),
        toolCallState: createToolCallState(),
        map: createToolCallIdMap(),
        usage: { input: 0, output: 0, cached: 0, lastPrompt: 0 },
    };
}

function event( data: any ) {
    return { data } as any;
}

describe( `processStreamEvent`, () => {
    it( `forwards content deltas to progress`, () => {
        const c = ctx();
        const progress = { report: vi.fn() };
        processStreamEvent( event( { choices: [{ delta: { content: `hello` } }] } ), c, progress as any, log );
        expect( progress.report ).toHaveBeenCalledTimes( 1 );
        expect( ( progress.report.mock.calls[ 0 ][ 0 ] as LanguageModelTextPart ).value ).toBe( `hello` );
    } );

    it( `joins array content parts`, () => {
        const c = ctx();
        const progress = { report: vi.fn() };
        processStreamEvent(
            event( { choices: [{ delta: { content: [{ type: `text`, text: `a` }, { type: `text`, text: `b` }] } }] } ),
            c, progress as any, log,
        );
        expect( ( progress.report.mock.calls[ 0 ][ 0 ] as LanguageModelTextPart ).value ).toBe( `ab` );
    } );

    it( `takes the max promptTokens and accumulates completionTokens`, () => {
        const c = ctx();
        const progress = { report: vi.fn() };
        processStreamEvent( event( { usage: { promptTokens: 100, completionTokens: 5 } } ), c, progress as any, log );
        processStreamEvent( event( { usage: { promptTokens: 100, completionTokens: 8 } } ), c, progress as any, log );
        expect( c.usage.input ).toBe( 100 );
        expect( c.usage.output ).toBe( 13 );
        expect( c.usage.lastPrompt ).toBe( 100 );
    } );

    it( `reads cached tokens from prompt_tokens_details`, () => {
        const c = ctx();
        processStreamEvent(
            event( { usage: { promptTokens: 100, completionTokens: 1, prompt_tokens_details: { cached_tokens: 40 } } } ),
            c, { report: vi.fn() } as any, log,
        );
        expect( c.usage.cached ).toBe( 40 );
    } );

    it( `falls back to num_cached_tokens for cache count`, () => {
        const c = ctx();
        processStreamEvent(
            event( { usage: { promptTokens: 100, completionTokens: 1, num_cached_tokens: 25 } } ),
            c, { report: vi.fn() } as any, log,
        );
        expect( c.usage.cached ).toBe( 25 );
    } );

    it( `records the served model id`, () => {
        const c = ctx();
        processStreamEvent( event( { model: `mistral-large-2512`, choices: [] } ), c, { report: vi.fn() } as any, log );
        expect( c.servedModel ).toBe( `mistral-large-2512` );
    } );

    it( `flags truncation on finishReason length`, () => {
        const c = ctx();
        processStreamEvent( event( { choices: [{ delta: {}, finishReason: `length` }] } ), c, { report: vi.fn() } as any, log );
        expect( c.truncated ).toBe( true );
    } );

    it( `ignores chunks with no choices`, () => {
        const c = ctx();
        const progress = { report: vi.fn() };
        processStreamEvent( event( { choices: [] } ), c, progress as any, log );
        expect( progress.report ).not.toHaveBeenCalled();
    } );
} );
