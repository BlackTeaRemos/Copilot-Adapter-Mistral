import { LanguageModelChatToolMode, LanguageModelTextPart } from 'vscode';
import { assertChatStreamRequest, toModelOptions, getNumberOption, getBooleanOption } from '../assertions/index.js';
import { toMistralMessages } from '../conversion/index.js';
import { ReadModelConfiguration } from '../_future_/modelConfiguration/readModelConfiguration.js';
import { ContextWindowResolver } from '../contextWindow/contextWindowResolver.js';
import { CompletionBudgetResolver } from '../completionBudget/completionBudgetResolver.js';
import type { CompletionBudget } from '../completionBudget/completionBudget.js';
import { computePromptCacheKey } from '../promptCacheKey.js';
import {
    createContentDeltaState,
    createToolCallState,
    flushContentDeltaState,
    processStreamEvent,
} from '../stream/index.js';
import type { StreamContext } from '../stream/index.js';
import type { ChatResponseSessionInput } from './chatResponseSessionInput.js';
import { ReadGlobalTokenSetting } from '../completionBudget/readGlobalTokenSetting.js';
import { ReadCompletionTokenOverride } from '../completionBudget/readCompletionTokenOverride.js';
import { PromptReservationEstimator } from './requestBudget/promptReservationEstimator.js';
import { CompletionStreamOpener } from './requestBudget/completionStreamOpener.js';

export class ChatResponseSession {
    private readonly _budgetResolver = new CompletionBudgetResolver();
    private readonly _contextResolver = new ContextWindowResolver();

    public async Run ( input: ChatResponseSessionInput ): Promise<StreamContext> {
        const { client, model, messages, options, progress, token, log, toolCallIdMap } = input;
        const context: StreamContext = {
            contentState: createContentDeltaState(),
            toolCallState: createToolCallState(),
            map: toolCallIdMap,
            usage: { input: 0, output: 0, cached: 0, lastPrompt: 0 },
        };
        if ( token.isCancellationRequested ) {
            return context;
        }
        const requestOptions = toModelOptions( options.modelOptions );
        const perModelConfig = ReadModelConfiguration( options );
        const modelOptions = { ...requestOptions, ...( perModelConfig ?? {} ) };
        if ( perModelConfig ) {
            log.info( `[Mistral][probe] per-model configuration applied keys=${ Object.keys( perModelConfig ).join( `,` ) }` );
        }
        const contextBudget = this._contextResolver.ResolveSelection( model.maxInputTokens, perModelConfig?.[ `contextSize` ] );
        log.debug(
            `[Mistral] Input context budget: requested=${ contextBudget.requestedTokens } effective=${ contextBudget.effectiveTokens }` +
            ` modelInputLimit=${ contextBudget.maxInputTokens } contextWindow=${ model.maxContextWindowTokens ?? `unknown` }`,
        );
        const mistralMessages = toMistralMessages( messages, toolCallIdMap );
        const mistralTools = options.tools?.map( tool => {
            return {
                type: `function` as const,
                function: { name: tool.name, description: tool.description, parameters: tool.inputSchema || {} },
            };
        } );
        const shouldSendTools = mistralTools && mistralTools.length > 0 && model.toolCalling;
        const globalSetting = ReadGlobalTokenSetting();
        const reservation = model.maxContextWindowTokens === undefined ? undefined
            : new PromptReservationEstimator().Estimate(
                model.id, mistralMessages, shouldSendTools ? mistralTools : undefined,
                contextBudget.effectiveTokens, input.tokenCounter,
            );
        const contextHeadroom = reservation && model.maxContextWindowTokens !== undefined
            ? model.maxContextWindowTokens - reservation.tokens : undefined;
        if ( contextHeadroom !== undefined && contextHeadroom <= 0 ) {
            throw new RangeError( `[Mistral] The prompt reservation leaves no output space in the model context window.` );
        }
        let budget = this._budgetResolver.Resolve( {
            requestMaxTokens: ReadCompletionTokenOverride( requestOptions ),
            modelMaxTokens: ReadCompletionTokenOverride( perModelConfig ),
            globalMaxTokens: globalSetting.value,
            defaultCompletionTokens: model.defaultCompletionTokens,
            defaultSource: model.defaultCompletionTokens === model.maxOutputTokens ? `automatic maximum` : `model default`,
            maxOutputTokens: model.outputLimitSource === `context window` ? undefined : model.maxOutputTokens,
            contextOutputTokens: contextHeadroom,
        } );
        const contextDescription = ` Input context allowance: ${ contextBudget.effectiveTokens } tokens.` +
            ` Global output setting origin: ${ globalSetting.origin }.`;
        const reservationDescription = reservation
            ? ` Prompt reservation: ${ reservation.tokens } tokens (${ reservation.source }); context window: ${ model.maxContextWindowTokens } tokens.`
            : ``;
        let budgetDescription = this.__DescribeBudget( budget, model.outputLimitSource ) + contextDescription + reservationDescription;
        log.debug( `[Mistral] Completion budget: ${ budgetDescription }` );
        const request = {
            model: model.id,
            messages: mistralMessages,
            maxTokens: budget.effectiveTokens,
            temperature: getNumberOption( modelOptions, `temperature` ) ?? model.temperature ?? 0.7,
            topP: getNumberOption( modelOptions, `topP` ) ?? model.top_p,
            safePrompt: getBooleanOption( modelOptions, `safePrompt` ),
            promptCacheKey: computePromptCacheKey( model.id, mistralMessages ),
            tools: shouldSendTools ? mistralTools : undefined,
            toolChoice: shouldSendTools
                ? options.toolMode === LanguageModelChatToolMode.Required ? `any` : `auto`
                : undefined,
            parallelToolCalls: shouldSendTools ? model.supportsParallelToolCalls ?? false : undefined,
        };
        assertChatStreamRequest( request );

        const abortController = new AbortController();
        const cancellationDisposable = typeof token.onCancellationRequested === `function`
            ? token.onCancellationRequested( () => {
                abortController.abort();
                log.info( `[Mistral] Request cancelled by user` );
            } )
            : undefined;
        try {
            if ( token.isCancellationRequested ) {
                return context;
            }
            const opened = await new CompletionStreamOpener().Open( client, request, budget, abortController.signal, log );
            budget = opened.budget;
            budgetDescription = this.__DescribeBudget( budget, model.outputLimitSource ) + contextDescription + reservationDescription;
            log.debug( `[Mistral] Accepted completion budget: ${ budgetDescription }` );
            const stream = opened.stream;
            for await ( const event of stream ) {
                if ( token.isCancellationRequested ) {
                    break;
                }
                processStreamEvent( event, context, progress, log );
            }
            if ( !token.isCancellationRequested ) {
                if ( context.failureReason ) {
                    throw new Error( `Mistral generation failed (finish reason: ${ context.failureReason }).` );
                }
                if ( !context.finishReason ) {
                    throw new Error( `Mistral stream ended without a terminal finish reason; the response may be incomplete.` );
                }
            }
            return context;
        } finally {
            try {
                if ( !token.isCancellationRequested && !abortController.signal.aborted ) {
                    flushContentDeltaState( context.contentState, progress, log );
                    if ( context.truncated ) {
                        const warning = `Response truncated (finish reason: length). ${ budgetDescription } ` +
                            `Generation is also constrained by the model context window and server limits.`;
                        log.warn( `[Mistral] ${ warning }` );
                        progress.report( new LanguageModelTextPart( `\n\n${ warning }` ) );
                    }
                }
            } finally {
                cancellationDisposable?.dispose();
            }
        }
    }

    private __DescribeBudget ( budget: CompletionBudget, outputLimitSource?: string ): string {
        const effective = `Effective request budget: ${ budget.effectiveTokens } tokens.`;
        const requested = ` Requested budget: ${ budget.requestedTokens } tokens (${ budget.source }).`;
        if ( budget.limitSource === `server output limit` ) {
            return effective + requested + ` Server-reported output limit: ${ budget.maxOutputTokens } tokens; clamp applied.`;
        }
        if ( budget.limitSource === `retry budget` ) {
            return effective + requested + ` Reduced after server token-limit rejection; separate output ceiling remains unknown.`;
        }
        if ( budget.limitSource === `context headroom` ) {
            const clampStatus = budget.effectiveTokens < budget.requestedTokens ? `clamp applied` : `no clamp applied`;
            const knownOutput = outputLimitSource === `context window`
                ? ` Separate server output limit is not published.` : ``;
            return effective + requested + ` Remaining context bound: ${ budget.maxOutputTokens } tokens; ${ clampStatus }.` + knownOutput;
        }
        const clamp = budget.effectiveTokens < budget.requestedTokens
            ? ` Clamped to model output limit: ${ budget.maxOutputTokens } tokens.`
            : ` Model output limit: ${ budget.maxOutputTokens } tokens; no clamp applied.`;
        return effective + requested + clamp;
    }
}
