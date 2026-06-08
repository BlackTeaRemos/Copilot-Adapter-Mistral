/* eslint-disable vitest/require-mock-type-parameters */
import { vi } from 'vitest';

export interface LanguageModelChatInformation {
    id: string;
    name: string;
    family?: string;
    version?: string;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    detail?: string;
    tooltip?: string;
    encoding?: string;
    extensions?: string[];
    capabilities?: {
        toolCalling?: boolean;
        imageInput?: boolean;
        defaultTools?: boolean;
        supportsStreamingOptions?: boolean;
    };
}

export interface LanguageModelChatProvider { }

export type Event<T> = ( listener: ( e: T ) => void, thisArgs?: any, disposables?: any ) => any;

export class EventEmitter<T> {
    private listeners: Array<( e: T ) => void> = [];

    public readonly event: Event<T> = ( listener: ( e: T ) => void ) => {
        this.listeners.push( listener );
        return {
            dispose: () => {
                const index = this.listeners.indexOf( listener );
                if ( index !== -1 ) {
                    this.listeners.splice( index, 1 );
                }
            },
        };
    };

    public fire ( data: T ): void {
        this.listeners.forEach( listener => {
            try {
                listener( data );
            } catch ( error ) {
                console.error( 'Error in event listener:', error );
            }
        } );
    }

    public dispose (): void {
        this.listeners.length = 0;
    }
}

export enum LanguageModelChatMessageRole {
    User = 1,
    Assistant = 2,
}

export enum LanguageModelChatToolMode {
    Auto = 0,
    Required = 1,
}

export enum InputBoxValidationSeverity {
    Info = 1,
    Warning = 2,
    Error = 3,
}

export class LanguageModelTextPart {
    constructor ( public readonly value: string ) { }
}

export class LanguageModelToolCallPart {
    constructor (
        public readonly callId: string,
        public readonly name: string,
        public readonly input: Record<string, unknown>,
    ) { }
}

export class LanguageModelToolResultPart {
    constructor (
        public readonly callId: string,
        public readonly content: LanguageModelTextPart[],
    ) { }
}

export class LanguageModelDataPart {
    constructor (
        public readonly data: Uint8Array,
        public readonly mimeType: string,
    ) { }
}

export class LanguageModelToolResult {
    constructor ( public readonly content: unknown[] ) { }
}

export const window = {
    showInputBox: vi.fn(),
    showErrorMessage: vi.fn(),
    createOutputChannel: vi.fn().mockReturnValue( {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        trace: vi.fn(),
        appendLine: vi.fn(),
        dispose: vi.fn(),
    } ),
    createStatusBarItem: vi.fn().mockReturnValue( {
        name: '',
        text: '',
        tooltip: '',
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
    } ),
};

export const lm = {
    registerLanguageModelChatProvider: vi.fn().mockReturnValue( { dispose: vi.fn() } ),
    registerTool: vi.fn().mockReturnValue( { dispose: vi.fn() } ),
};

export const commands = {
    registerCommand: vi.fn().mockReturnValue( { dispose: vi.fn() } ),
};

export const workspace = {
    getConfiguration: vi.fn().mockReturnValue( {
        get: vi.fn().mockReturnValue( undefined ),
        update: vi.fn(),
    } ),
    onDidChangeConfiguration: vi.fn().mockReturnValue( { dispose: vi.fn() } ),
};

export const languages = {
    registerInlineCompletionItemProvider: vi.fn().mockReturnValue( { dispose: vi.fn() } ),
};

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export class Position {
    constructor ( public readonly line: number, public readonly character: number ) { }
}

export class Range {
    constructor ( public readonly start: Position, public readonly end: Position ) { }
}

export class InlineCompletionItem {
    constructor ( public readonly insertText: string, public readonly range?: Range ) { }
}

export class ThemeColor {
    constructor ( public readonly id: string ) { }
}

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class MarkdownString {
    constructor ( public readonly value: string ) { }
}

export class LanguageModelChatMessage {
    static User ( content: string | Part[], name?: string ): LanguageModelChatMessage {
        return new LanguageModelChatMessage( LanguageModelChatMessageRole.User, content, name );
    }
    static Assistant ( content: string | Part[], name?: string ): LanguageModelChatMessage {
        return new LanguageModelChatMessage( LanguageModelChatMessageRole.Assistant, content, name );
    }
    constructor (
        public readonly role: LanguageModelChatMessageRole,
        public readonly content: string | Part[],
        public readonly name?: string,
    ) { }
}

export type Part =
    | LanguageModelTextPart
    | LanguageModelToolCallPart
    | LanguageModelToolResultPart
    | LanguageModelDataPart;

export class ChatRequestTurn {
    constructor ( public readonly prompt: string ) { }
}

export class ChatResponseTurn {
    constructor ( public readonly response: ChatResponseMarkdownPart[] ) { }
}

export class ChatResponseTurn2 {
    constructor ( public readonly response: ChatResponseMarkdownPart[] ) { }
}

export class ChatResponseMarkdownPart {
    constructor ( public readonly value: MarkdownString ) { }
}

export const Uri = {
    file: vi.fn().mockReturnValue( undefined ),
    joinPath: vi.fn().mockReturnValue( undefined ),
};

export const chat = {
    createChatParticipant: vi.fn().mockReturnValue( { iconPath: undefined, dispose: vi.fn() } ),
};
