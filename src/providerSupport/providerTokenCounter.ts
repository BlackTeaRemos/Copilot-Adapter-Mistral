import { getEncoding, type Tiktoken } from 'js-tiktoken';
import type { ExtensionContext, LanguageModelChatRequestMessage } from 'vscode';
import { TokenizerCalibration } from '../cacheCalibration.js';
import { getMistralTokenizer } from '../tokenizer/mistralTokenizer.js';
import { ExtractText } from './extractText.js';

export class ProviderTokenCounter {
    private _tokenizer: Tiktoken | null = null;

    public constructor (
        private readonly _context: ExtensionContext,
        private readonly _calibration: TokenizerCalibration,
    ) {
    }

    public Count ( modelId: string, text: string | LanguageModelChatRequestMessage ): number {
        const { encoder, native } = this.__GetEncoder();
        const content = typeof text === `string`
            ? text
            : text.content.map( part => {
                return ExtractText( part );
            } ).join( `` );
        const rawCount = encoder.encode( content ).length;
        const scale = native ? undefined : this._calibration.scale( modelId );
        return scale === undefined ? rawCount : Math.round( rawCount * scale );
    }

    public RecordCalibration ( modelId: string, promptTokens: number, messages: readonly LanguageModelChatRequestMessage[] ): void {
        const { encoder, native } = this.__GetEncoder();
        if ( native ) {
            return;
        }
        const estimatedTokens = messages.flatMap( message => {
            return message.content;
        } ).reduce<number>( ( totalTokens, part ) => {
            return totalTokens + encoder.encode( ExtractText( part ) ).length;
        }, 0 );
        this._calibration.record( modelId, promptTokens, estimatedTokens );
    }

    public Dispose (): void {
        this._tokenizer = null;
    }

    private __GetEncoder (): { encoder: Tiktoken; native: boolean } {
        const nativeEncoder = getMistralTokenizer( this._context.extensionUri?.fsPath ?? `` );
        if ( nativeEncoder ) {
            return { encoder: nativeEncoder, native: true };
        }
        this._tokenizer ??= getEncoding( `cl100k_base` );
        return { encoder: this._tokenizer, native: false };
    }
}
