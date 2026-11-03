import type { CompletionEvent } from '@mistralai/mistralai/models/components';
import { describe, expect, it, vi } from 'vitest';
import { LanguageModelTextPart } from 'vscode';
import { processStreamEvent } from './processStreamEvent.js';
import { StreamFixture } from './tests/streamFixture.js';

const log = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

function event ( data: unknown ) {
    return { data } as CompletionEvent;
}

describe( `processStreamEvent`, () => {
    it( `forwards content deltas to progress`, () => {
        const c = new StreamFixture().context;
        const progress = { report: vi.fn() };
        processStreamEvent( event( { choices: [ { delta: { content: `hello` } } ] } ), c, progress, log );
        expect( progress.report ).toHaveBeenCalledTimes( 1 );
        expect( ( progress.report.mock.calls[ 0 ][ 0 ] as LanguageModelTextPart ).value ).toBe( `hello` );
    } );

    it( `emits array content parts as text`, () => {
        const c = new StreamFixture().context;
        const progress = { report: vi.fn() };
        processStreamEvent(
            event( { choices: [ { delta: { content: [ { type: `text`, text: `a` }, { type: `text`, text: `b` } ] } } ] } ),
            c, progress, log,
        );
        const text = progress.report.mock.calls.map( ( call ) => {
            return call[ 0 ]?.value ?? ``;
        } ).join( `` );
        expect( text ).toBe( `ab` );
    } );

    it( `routes thinking content chunks to thinking parts`, () => {
        const c = new StreamFixture().context;
        const progress = { report: vi.fn() };
        processStreamEvent(
            event( { choices: [ { delta: { content: [
                { type: `thinking`, thinking: [ { type: `text`, text: `reasoning` } ] },
                { type: `text`, text: `Answer` },
            ] } } ] } ),
            c, progress, log,
        );
        const answer = progress.report.mock.calls
            .filter( ( call ) => {
                return call[ 0 ]?.constructor?.name !== `LanguageModelThinkingPart`;
            } )
            .map( ( call ) => {
                return call[ 0 ]?.value ?? ``;
            } ).join( `` );
        const thinking = progress.report.mock.calls
            .filter( ( call ) => {
                return call[ 0 ]?.constructor?.name === `LanguageModelThinkingPart`;
            } )
            .map( ( call ) => {
                return call[ 0 ]?.value ?? ``;
            } ).join( `` );
        expect( answer ).toBe( `Answer` );
        expect( thinking ).toBe( `reasoning` );
    } );

    it( `preserves absolute prompt and completion totals`, () => {
        const c = new StreamFixture().context;
        const progress = { report: vi.fn() };
        processStreamEvent( event( { usage: { promptTokens: 100, completionTokens: 5 } } ), c, progress, log );
        processStreamEvent( event( { usage: { promptTokens: 100, completionTokens: 8 } } ), c, progress, log );
        expect( c.usage.input ).toBe( 100 );
        expect( c.usage.output ).toBe( 8 );
        expect( c.usage.lastPrompt ).toBe( 100 );
    } );

    it( `reads cached tokens from prompt_tokens_details`, () => {
        const c = new StreamFixture().context;
        processStreamEvent(
            event( { usage: { promptTokens: 100, completionTokens: 1, prompt_tokens_details: { cached_tokens: 40 } } } ),
            c, { report: vi.fn() }, log,
        );
        expect( c.usage.cached ).toBe( 40 );
    } );

    it( `falls back to num_cached_tokens for cache count`, () => {
        const c = new StreamFixture().context;
        processStreamEvent(
            event( { usage: { promptTokens: 100, completionTokens: 1, num_cached_tokens: 25 } } ),
            c, { report: vi.fn() }, log,
        );
        expect( c.usage.cached ).toBe( 25 );
    } );

    it( `records the served model id`, () => {
        const c = new StreamFixture().context;
        processStreamEvent( event( { model: `mistral-large-2512`, choices: [] } ), c, { report: vi.fn() }, log );
        expect( c.servedModel ).toBe( `mistral-large-2512` );
    } );

    it( `flags truncation on finishReason length`, () => {
        const c = new StreamFixture().context;
        processStreamEvent( event( { choices: [ { delta: {}, finishReason: `length` } ] } ), c, { report: vi.fn() }, log );
        expect( c.truncated ).toBe( true );
    } );

    it( `ignores chunks with no choices`, () => {
        const c = new StreamFixture().context;
        const progress = { report: vi.fn() };
        processStreamEvent( event( { choices: [] } ), c, progress, log );
        expect( progress.report ).not.toHaveBeenCalled();
    } );
} );
