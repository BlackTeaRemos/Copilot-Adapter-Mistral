import { Mistral } from '@mistralai/mistralai';
import type { MistralClientLogger } from './clientLogger.js';

export type FimUsage = { promptTokens: number; completionTokens: number; totalTokens: number; };

export type FimResult = {
    text: string;
    usage: FimUsage;
    servedModel: string;
};

export type FimParams = {
    model: string;
    prompt: string;
    suffix?: string;
    maxTokens?: number;
    temperature?: number;
    stop?: string[];
    promptCacheKey?: string;
};

export async function fimComplete (
    client: Mistral,
    params: FimParams,
    signal: AbortSignal,
    log: MistralClientLogger,
): Promise<FimResult | null> {
    const response = await client.fim.complete( {
        model: params.model,
        prompt: params.prompt,
        suffix: params.suffix,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        stop: params.stop,
        promptCacheKey: params.promptCacheKey,
    }, { fetchOptions: { signal } } );

    const choice = response.choices?.[ 0 ];
    const content = choice?.message?.content;
    const text = typeof content === 'string'
        ? content
        : Array.isArray( content )
            ? content.map( c => ( c.type === 'text' ? c.text : '' ) ).join( '' )
            : '';

    const usage: FimUsage = {
        promptTokens: response.usage?.promptTokens ?? 0,
        completionTokens: response.usage?.completionTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0,
    };

    log.debug(
        `[Mistral FIM] served=${ response.model } prompt=${ usage.promptTokens } completion=${ usage.completionTokens } total=${ usage.totalTokens } chars=${ text.length }`,
    );

    return { text, usage, servedModel: response.model };
}
