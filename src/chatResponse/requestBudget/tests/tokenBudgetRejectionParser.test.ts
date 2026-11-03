import { describe, expect, it } from 'vitest';
import { TokenBudgetRejectionParser } from '../tokenBudgetRejectionParser.js';

describe( `token-budget server rejection classification`, () => {
    const parser = new TokenBudgetRejectionParser();

    it( `uses an explicit server-reported output maximum`, () => {
        expect( parser.Evaluate( {
            statusCode: 400, body: `max_tokens must be less than or equal to 32768`,
        }, 200000 ) ).toEqual( { nextTokens: 32768, reportedLimit: 32768 } );
    } );

    it( `accepts a comma-formatted output ceiling without truncating its value`, () => {
        expect( parser.Evaluate( { statusCode: 400, body: `max_tokens must be <= 32,768` }, 200000 ) )
            .toEqual( { nextTokens: 32768, reportedLimit: 32768 } );
    } );

    it( `recognizes the context_length_exceeded validation code`, () => {
        expect( parser.Evaluate( { statusCode: 400, body: `context_length_exceeded` }, 65536 ) )
            .toEqual( { nextTokens: 32768 } );
    } );

    it( `reads a structured upper bound only for the max_tokens field`, () => {
        const body = JSON.stringify( { detail: [ {
            loc: [ `body`, `max_tokens` ], msg: `Input should be less than or equal to 16384`, ctx: { le: 16384 },
        } ] } );
        expect( parser.Evaluate( { statusCode: 422, body }, 65536 ) ).toEqual( { nextTokens: 16384, reportedLimit: 16384 } );
    } );

    it( `reduces the budget without claiming an undocumented server ceiling`, () => {
        expect( parser.Evaluate( { statusCode: 400, body: `maximum context length exceeded` }, 1000000 ) )
            .toEqual( { nextTokens: 131072 } );
    } );

    it.each( [ 401, 403, 404, 408, 429, 500, 503 ] )( `does not retry HTTP status %s`, statusCode => {
        expect( parser.Evaluate( { statusCode, body: `max_tokens exceeds limit` }, 65536 ) ).toBeUndefined();
    } );

    it.each( [ `invalid tool schema`, `unsupported parameter max_tokens`, `temperature must be less than 1` ] )(
        `does not misclassify another parameter error: %s`, body => {
            expect( parser.Evaluate( { statusCode: 400, body }, 65536 ) ).toBeUndefined();
        },
    );

    it( `stops at a one-token request and ignores an unusable reported bound`, () => {
        expect( parser.Evaluate( { statusCode: 400, body: `max_tokens exceeds limit` }, 1 ) ).toBeUndefined();
        expect( parser.Evaluate( { statusCode: 400, body: `max_tokens maximum is 100000` }, 65536 ) )
            .toEqual( { nextTokens: 32768 } );
    } );
} );
