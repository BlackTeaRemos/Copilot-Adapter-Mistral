import type { CompletionEvent } from '@mistralai/mistralai/models/components';
import { vi } from 'vitest';
import { LanguageModelToolCallPart, LanguageModelTextPart } from 'vscode';
import { createContentDeltaState, createToolCallState, processStreamEvent, type StreamContext } from '../index.js';
import { createToolCallIdMap } from '../../conversion/index.js';

export class StreamFixture {
    public readonly context: StreamContext = {
        contentState: createContentDeltaState(),
        toolCallState: createToolCallState(),
        map: createToolCallIdMap(),
        usage: { input: 0, output: 0, cached: 0, lastPrompt: 0 },
    };
    public readonly progress = { report: vi.fn() };
    public readonly log = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() };

    public Process ( data: unknown ): void {
        processStreamEvent( { data } as CompletionEvent, this.context, this.progress, this.log );
    }

    public ToolCalls (): LanguageModelToolCallPart[] {
        return this.progress.report.mock.calls.map( ( [ part ] ) => {
            return part;
        } ).filter( ( part ): part is LanguageModelToolCallPart => {
            return part instanceof LanguageModelToolCallPart;
        } );
    }

    public Text (): string {
        return this.progress.report.mock.calls.map( ( [ part ] ) => {
            return part instanceof LanguageModelTextPart ? part.value : ``;
        } ).join( `` );
    }
}
