import { describe, expect, it } from 'vitest';
import { StreamFixture } from './streamFixture.js';

describe( `stream usage and tool finalization`, () => {
    it( `does not add repeated request usage totals or lose omitted prompt totals`, () => {
        const fixture = new StreamFixture();
        fixture.Process( { usage: { promptTokens: 100, completionTokens: 5 }, choices: [] } );
        fixture.Process( { usage: { promptTokens: 100, completionTokens: 8 }, choices: [] } );
        fixture.Process( { usage: { completionTokens: 8 }, choices: [] } );
        expect( fixture.context.usage ).toEqual( { input: 100, output: 8, cached: 0, lastPrompt: 100 } );
    } );

    it( `does not poison counters with invalid usage metadata`, () => {
        const fixture = new StreamFixture();
        fixture.Process( { usage: { promptTokens: 100, completionTokens: 8 }, choices: [] } );
        fixture.Process( { usage: { promptTokens: NaN, completionTokens: Infinity, num_cached_tokens: `broken` }, choices: [] } );
        expect( fixture.context.usage ).toEqual( { input: 100, output: 8, cached: 0, lastPrompt: 100 } );
    } );

    it( `reassembles interleaved indexed tool continuations with missing IDs`, () => {
        const fixture = new StreamFixture();
        fixture.Process( { choices: [ { delta: { toolCalls: [
            { index: 0, id: `first`, function: { name: `alpha`, arguments: `{"value":` } },
            { index: 1, id: `second`, function: { name: `beta`, arguments: `{"other":` } },
        ] } } ] } );
        fixture.Process( { choices: [ { delta: { toolCalls: [
            { index: 1, function: { arguments: `2}` } },
            { index: 0, function: { arguments: `1}` } },
        ] } } ] } );
        expect( fixture.ToolCalls() ).toHaveLength( 0 );
        fixture.Process( { choices: [ { delta: {}, finishReason: `tool_calls` } ] } );
        expect( fixture.ToolCalls().map( call => {
            return { name: call.name, input: call.input };
        } ) ).toEqual( [
            { name: `alpha`, input: { value: 1 } },
            { name: `beta`, input: { other: 2 } },
        ] );
    } );

    it( `does not dispatch parseable arguments before successful termination`, () => {
        const fixture = new StreamFixture();
        fixture.Process( { choices: [ { delta: { toolCalls: [
            { id: `call`, index: 0, function: { name: `change`, arguments: `{}` } },
        ] } } ] } );
        expect( fixture.ToolCalls() ).toHaveLength( 0 );
        fixture.Process( { choices: [ { delta: {}, finishReason: `length` } ] } );
        fixture.Process( { choices: [ { delta: {}, finishReason: `stop` } ] } );
        expect( fixture.ToolCalls() ).toHaveLength( 0 );
        expect( fixture.context.truncated ).toBe( true );
    } );

    it( `does not dispatch buffered calls after a failed-generation terminal event`, () => {
        const fixture = new StreamFixture();
        fixture.Process( { choices: [ { delta: { toolCalls: [
            { id: `call`, function: { name: `change`, arguments: `{}` } },
        ] }, finishReason: `error` } ] } );
        fixture.Process( { choices: [ { delta: {}, finishReason: `stop` } ] } );
        expect( fixture.ToolCalls() ).toHaveLength( 0 );
        expect( fixture.context.failureReason ).toBe( `error` );
    } );

    it.each( [ `[]`, `null`, `42`, `"value"`, `{broken` ] )(
        `skips invalid object arguments instead of wrapping them: %s`,
        argumentsText => {
            const fixture = new StreamFixture();
            fixture.Process( { choices: [ { delta: { toolCalls: [
                { id: `call`, function: { name: `change`, arguments: argumentsText } },
            ] }, finishReason: `tool_calls` } ] } );
            expect( fixture.ToolCalls() ).toHaveLength( 0 );
            expect( fixture.Text() ).toContain( `invalid arguments` );
        },
    );
} );
