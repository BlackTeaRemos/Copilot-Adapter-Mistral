import { readFileSync } from 'fs';
import { join } from 'path';
import { Tiktoken } from 'js-tiktoken';

/**
 * Native Mistral *tekken* tokenizer.
 *
 * Mistral's tekken vocabulary is a tiktoken-style byte-level BPE, so the
 * already-bundled `js-tiktoken` engine can encode it exactly once given the
 * vocabulary. The vocab ships as two assets (generated from Mistral's
 * `tekken.json`, Apache-2.0):
 *
 *   - `tekken.bpe`       - newline-joined `! <rank> <base64-bytes>` lines,
 *                          the format `Tiktoken`'s `bpe_ranks` expects.
 *   - `tekken.meta.json` - `{ pat_str, version }`, the pre-tokenization regex.
 *
 * Token *counts* need only the merge ranks and the split pattern, so special
 * tokens are intentionally omitted (chat-template control tokens never reach
 * `provideTokenCount`).
 */

let cached: Tiktoken | null | undefined;

type TekkenMeta = { pat_str: string; version?: string; };

/**
 * Loads the native tekken tokenizer from the extension's `assets` directory.
 * Returns `null` (cached) if the assets are missing or malformed, so callers
 * can fall back to an approximate encoder.
 *
 * @param extensionPath Absolute path to the installed extension root.
 */
export function getMistralTokenizer ( extensionPath: string ): Tiktoken | null {
    if ( cached !== undefined ) {
        return cached;
    }
    try {
        const dir = join( extensionPath, `assets` );
        const bpe_ranks = readFileSync( join( dir, `tekken.bpe` ), `utf8` );
        const meta = JSON.parse( readFileSync( join( dir, `tekken.meta.json` ), `utf8` ) ) as TekkenMeta;
        cached = new Tiktoken( { pat_str: meta.pat_str, special_tokens: {}, bpe_ranks } );
    } catch {
        cached = null;
    }
    return cached;
}

/** Test-only: drop the cached instance so a later load re-reads the assets. */
export function resetMistralTokenizer (): void {
    cached = undefined;
}
