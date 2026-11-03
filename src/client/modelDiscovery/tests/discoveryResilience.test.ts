import { describe, expect, it } from 'vitest';
import { ModelDiscoveryFixture } from './modelDiscoveryFixture.js';

const VALID_CARD = {
    id: `mistral-medium-3-5`, type: `base`, name: `Mistral Medium 3.5`,
    maxContextLength: 262144,
    capabilities: { completionChat: true, functionCalling: true, vision: false },
};

describe( `model discovery output bounds`, () => {
    it( `keeps valid models when another card has unusable limits`, async () => {
        const fixture = new ModelDiscoveryFixture( [
            { ...VALID_CARD, id: `invalid-model`, maxContextLength: 0 }, VALID_CARD,
        ] );
        const models = await fixture.Fetch();
        expect( models.some( model => {
            return model.id === VALID_CARD.id;
        } ) ).toBe( true );
        expect( models.some( model => {
            return model.id === `invalid-model`;
        } ) ).toBe( false );
        expect( fixture.log.warn ).toHaveBeenCalledWith( expect.stringContaining( `invalid-model` ) );
    } );

    it( `retains an authoritative API context and the documented GLM output ceiling`, async () => {
        const models = await new ModelDiscoveryFixture( [ {
            ...VALID_CARD, id: `zai-glm-5-3`, maxContextLength: 256000,
            capabilities: { completionChat: true, vision: true },
        } ] ).Fetch();
        expect( models.find( model => {
            return model.id === `zai-glm-5-3`;
        } ) ).toMatchObject( { maxContextWindowTokens: 256000, maxInputTokens: 128000, maxOutputTokens: 128000, supportsVision: true } );
    } );

    it( `does not convert the rolling Medium alias into a 4096-token ceiling`, async () => {
        const models = await new ModelDiscoveryFixture( [ {
            ...VALID_CARD, aliases: [ `mistral-medium-latest`, `mistral-vibe-cli-with-tools` ],
        } ] ).Fetch();
        expect( models.find( model => {
            return model.id === VALID_CARD.id;
        } ) ).toMatchObject( {
            maxContextWindowTokens: 262144, maxInputTokens: 258048,
            maxOutputTokens: 262143, outputLimitSource: `context window`,
        } );
    } );

    it( `resolves a documented ceiling through an API-declared stable public ID`, async () => {
        const models = await new ModelDiscoveryFixture( [ {
            ...VALID_CARD, id: `glm-deployment`, aliases: [ `zai-glm-5-3` ],
        } ] ).Fetch();
        expect( models.find( model => {
            return model.id === `glm-deployment`;
        } ) ).toMatchObject( { maxOutputTokens: 128000, outputLimitSource: `API-declared alias` } );
    } );

    it.each( [ `constructor`, `__proto__`, `toString` ] )( `does not inherit output ceilings for model %s`, async identifier => {
        const models = await new ModelDiscoveryFixture( [ { ...VALID_CARD, id: identifier } ] ).Fetch();
        expect( models.find( model => {
            return model.id === identifier;
        } )?.maxOutputTokens ).toBe( 262143 );
    } );
} );
