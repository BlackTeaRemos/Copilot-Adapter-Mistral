import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatCompletionStreamRequestToJSON } from '@mistralai/mistralai/models/components';
import { ProviderBudgetFixture } from './providerBudgetFixture.js';

describe( `provider completion budgets`, () => {
    let fixture: ProviderBudgetFixture;
    beforeEach( () => {
        fixture = new ProviderBudgetFixture();
    } );
    afterEach( () => {
        fixture.provider.dispose();
        vi.restoreAllMocks();
    } );

    it( `reads the global setting again for each request on the same provider`, async () => {
        await fixture.Request();
        fixture.globalMaxTokens = 12000;
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 8192 );
        expect( fixture.stream.mock.calls[ 1 ][ 0 ].maxTokens ).toBe( 12000 );
    } );

    it( `uses the model default when no setting or override is present`, async () => {
        fixture.globalMaxTokens = undefined;
        fixture.model.defaultCompletionTokens = 7000;
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 7000 );
    } );

    it( `gives request overrides priority over per-model and global values`, async () => {
        await fixture.Request( {
            modelOptions: { maxTokens: 9000 },
            modelConfiguration: { maxTokens: 6000 },
        } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 9000 );
    } );

    it( `gives per-model configuration priority over the global value`, async () => {
        await fixture.Request( { modelConfiguration: { maxTokens: 6000 } } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 6000 );
    } );

    it.each( [
        { globalMaxTokens: 1000000, options: {} },
        { globalMaxTokens: 8192, options: { modelConfiguration: { maxTokens: 1000000 } } },
        { globalMaxTokens: 8192, options: { modelOptions: { maxTokens: 1000000 } } },
    ] )( `caps the selected budget from every configuration layer`, async ( testCase ) => {
        fixture.globalMaxTokens = testCase.globalMaxTokens;
        await fixture.Request( testCase.options );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 16384 );
        expect( fixture.log.debug ).toHaveBeenCalledWith( expect.stringContaining( `Clamped to model output limit: 16384 tokens.` ) );
    } );

    it( `serializes the selected budget to the SDK max_tokens field`, async () => {
        await fixture.Request( { modelOptions: { maxTokens: 9000 } } );
        const request = fixture.stream.mock.calls[ 0 ][ 0 ];
        expect( JSON.parse( chatCompletionStreamRequestToJSON( request ) ).max_tokens ).toBe( 9000 );
    } );

    it( `rejects an invalid model output limit before sending a request`, async () => {
        fixture.model.maxOutputTokens = NaN;
        await fixture.Request();
        expect( fixture.stream ).not.toHaveBeenCalled();
        expect( fixture.Text() ).toContain( `model output limit must be a finite positive safe integer` );
    } );

    it( `preserves a lower model limit`, async () => {
        fixture.model.maxOutputTokens = 2048;
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 2048 );
    } );

    it( `preserves the selected model limit when the catalog has no matching model`, async () => {
        vi.mocked( fixture.provider.fetchModels ).mockResolvedValue( [] );
        fixture.model.maxOutputTokens = 2048;
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 2048 );
    } );

    it.each( [ NaN, Infinity, -Infinity, 0, -1, 1.5, `9000`, true, Number.MAX_SAFE_INTEGER + 1 ] )(
        `rejects an invalid global value without forwarding a request: %s`,
        async ( invalidValue ) => {
            fixture.globalMaxTokens = invalidValue;
            await fixture.Request();
            expect( fixture.stream ).not.toHaveBeenCalled();
            expect( fixture.Text() ).toContain( `mistral.maxTokens must be a finite positive safe integer` );
        },
    );

    it.each( [ `modelOptions`, `modelConfiguration` ] )(
        `rejects an invalid selected override in %s`,
        async ( optionKey ) => {
            await fixture.Request( { [ optionKey ]: { maxTokens: 0 } } );
            expect( fixture.stream ).not.toHaveBeenCalled();
            expect( fixture.Text() ).toContain( `must be a finite positive safe integer` );
        },
    );

    it( `allows a valid override to replace an invalid lower-priority setting`, async () => {
        fixture.globalMaxTokens = NaN;
        await fixture.Request( { modelOptions: { maxTokens: 5000 }, modelConfiguration: { maxTokens: 0 } } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 5000 );
    } );

    it( `reports the effective budget and clamp after length termination`, async () => {
        fixture.finishReason = `length`;
        fixture.globalMaxTokens = 1000000;
        await fixture.Request();
        const text = fixture.Text();
        expect( text ).toContain( `Partial answer` );
        expect( text ).toContain( `Response truncated (finish reason: length)` );
        expect( text ).toContain( `Effective request budget: 16384 tokens.` );
        expect( text ).toContain( `Requested budget: 1000000 tokens (mistral.maxTokens).` );
        expect( text ).toContain( `Clamped to model output limit: 16384 tokens.` );
        expect( fixture.log.warn ).toHaveBeenCalledWith( expect.stringContaining( `Effective request budget: 16384 tokens.` ) );
        expect( fixture.provider.getUsageStats() ).toEqual( { input: 8, output: 4, cached: 0, lastPrompt: 8 } );
    } );

    it( `reports an unclamped override instead of the model default`, async () => {
        fixture.finishReason = `length`;
        await fixture.Request( { modelOptions: { maxTokens: 6000 } } );
        expect( fixture.Text() ).toContain( `Effective request budget: 6000 tokens.` );
        expect( fixture.Text() ).toContain( `Requested budget: 6000 tokens (request override).` );
        expect( fixture.Text() ).toContain( `no clamp applied` );
        expect( fixture.Text() ).not.toContain( `4096 tokens` );
    } );

    it( `retains the original request budget if settings change during the stream`, async () => {
        fixture.finishReason = `length`;
        fixture.stream.mockImplementationOnce( async function* () {
            fixture.globalMaxTokens = 12000;
            yield { data: { choices: [ { delta: { content: `Partial answer` }, finishReason: `length` } ] } };
        } );
        await fixture.Request();
        expect( fixture.Text() ).toContain( `Effective request budget: 8192 tokens.` );
    } );

    it( `honors a larger configured budget when only a shared context limit is known`, async () => {
        fixture.finishReason = `length`;
        fixture.model.maxContextWindowTokens = 262144;
        fixture.model.maxInputTokens = 258048;
        fixture.model.maxOutputTokens = 262143;
        fixture.model.outputLimitSource = `context window`;
        fixture.globalMaxTokens = 65536;
        await fixture.Request( { modelConfiguration: { contextSize: 258048 } } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 65536 );
        expect( fixture.Text() ).toContain( `Effective request budget: 65536 tokens.` );
        expect( fixture.Text() ).toContain( `Separate server output limit is not published` );
        expect( fixture.Text() ).toContain( `Input context allowance: 258048 tokens` );
    } );

    it( `does not treat the native context selection as an output override`, async () => {
        fixture.model.maxContextWindowTokens = 262144;
        fixture.model.maxInputTokens = 258048;
        fixture.model.maxOutputTokens = 262143;
        fixture.model.outputLimitSource = `context window`;
        fixture.globalMaxTokens = 4096;
        await fixture.Request( { modelConfiguration: { contextSize: 258048 } } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 4096 );
    } );

    it( `honors the Mistral wire-format request override above model and global settings`, async () => {
        await fixture.Request( { modelOptions: { max_tokens: 12000 }, modelConfiguration: { maxTokens: 6000 } } );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBe( 12000 );
    } );

    it( `bounds an oversized output request by remaining prompt context`, async () => {
        fixture.model.maxContextWindowTokens = 32768;
        fixture.model.maxInputTokens = 28672;
        fixture.model.maxOutputTokens = 32767;
        fixture.model.outputLimitSource = `context window`;
        fixture.globalMaxTokens = 1000000;
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBeGreaterThan( 4096 );
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].maxTokens ).toBeLessThan( 32768 );
        expect( fixture.log.debug ).toHaveBeenCalledWith( expect.stringContaining( `Remaining context bound` ) );
    } );

    it( `dispatches the API-declared canonical ID when the host selected an alias`, async () => {
        const canonical = { ...fixture.model, id: `mistral-medium-3-5`, aliases: [ fixture.model.id ] };
        vi.mocked( fixture.provider.fetchModels ).mockResolvedValue( [ canonical ] );
        await fixture.Request();
        expect( fixture.stream.mock.calls[ 0 ][ 0 ].model ).toBe( canonical.id );
    } );

    it( `does not report truncation for normal termination`, async () => {
        await fixture.Request();
        expect( fixture.Text() ).toBe( `Partial answer` );
        expect( fixture.log.warn ).not.toHaveBeenCalled();
    } );
} );
