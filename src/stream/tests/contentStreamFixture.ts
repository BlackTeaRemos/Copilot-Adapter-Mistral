import { vi } from 'vitest';
import { LanguageModelTextPart } from 'vscode';
import { createContentDeltaState, processContentDelta, flushContentDeltaState } from '../content/index.js';

export class ContentStreamFixture {
    public readonly answer: string[] = [];
    public readonly thinking: string[] = [];
    public readonly state = createContentDeltaState();
    public readonly log = { debug: vi.fn(), info: vi.fn() };
    public readonly progress = {
        report: vi.fn( ( part: unknown ) => {
            if ( part instanceof LanguageModelTextPart ) {
                this.answer.push( part.value );
            } else if ( part !== null && typeof part === `object` && part.constructor.name === `LanguageModelThinkingPart` ) {
                this.thinking.push( ( part as { value: string } ).value );
            }
        } ),
    };

    public Append ( ...chunks: string[] ): void {
        for ( const chunk of chunks ) {
            processContentDelta( chunk, this.state, this.progress, this.log );
        }
    }

    public Finish (): void {
        flushContentDeltaState( this.state, this.progress, this.log );
    }
}
