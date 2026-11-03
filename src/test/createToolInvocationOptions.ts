import type { LanguageModelToolInvocationOptions } from 'vscode';

export function CreateToolInvocationOptions<T> ( input: T ): LanguageModelToolInvocationOptions<T> {
    return { input, toolInvocationToken: undefined };
}
