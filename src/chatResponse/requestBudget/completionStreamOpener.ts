import type { Mistral } from '@mistralai/mistralai';
import type { ChatCompletionStreamRequest } from '@mistralai/mistralai/models/components';
import type { CompletionBudget } from '../../completionBudget/completionBudget.js';
import type { MistralClientLogger } from '../../client/clientLogger.js';
import { streamChatCompletion } from '../../client/streamChatCompletion.js';
import { TokenBudgetRejectionParser } from './tokenBudgetRejectionParser.js';
import type { CompletionStreamOpenResult } from './completionStreamOpenResult.js';

const MAX_ATTEMPTS = 7;

export class CompletionStreamOpener {
    private readonly _parser = new TokenBudgetRejectionParser();

    public async Open (
        client: Mistral,
        request: ChatCompletionStreamRequest,
        initialBudget: CompletionBudget,
        signal: AbortSignal,
        log: MistralClientLogger,
    ): Promise<CompletionStreamOpenResult> {
        let budget = initialBudget;
        for ( let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++ ) {
            if ( signal.aborted ) {
                throw new Error( `[Mistral] Request cancelled before opening the completion stream.` );
            }
            try {
                const stream = await streamChatCompletion( client, { ...request, maxTokens: budget.effectiveTokens }, signal, log );
                return { stream, budget };
            } catch ( error ) {
                const decision = signal.aborted || attempt === MAX_ATTEMPTS ? undefined
                    : this._parser.Evaluate( error, budget.effectiveTokens );
                if ( !decision ) {
                    throw error;
                }
                log.warn(
                    `[Mistral] Server rejected output budget ${ budget.effectiveTokens }; retry ${ attempt }/${ MAX_ATTEMPTS - 1 }` +
                    ` with ${ decision.nextTokens } tokens (${ decision.reportedLimit === undefined ? `reduced budget; server ceiling unknown` : `server-reported output limit` }).`,
                );
                budget = {
                    ...budget,
                    effectiveTokens: decision.nextTokens,
                    maxOutputTokens: decision.reportedLimit ?? budget.maxOutputTokens,
                    limitSource: decision.reportedLimit === undefined ? `retry budget` : `server output limit`,
                };
            }
        }
        throw new Error( `[Mistral] Completion stream could not be opened.` );
    }
}
