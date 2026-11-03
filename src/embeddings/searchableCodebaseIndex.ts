import type { CodebaseEmbeddingIndex } from './codebaseIndex.js';

export interface SearchableCodebaseIndex {
    readonly load: CodebaseEmbeddingIndex[ `load` ];
    readonly getState: CodebaseEmbeddingIndex[ `getState` ];
    readonly search: CodebaseEmbeddingIndex[ `search` ];
    build ( ...parameters: Parameters<CodebaseEmbeddingIndex[ `build` ]> ): Promise<unknown>;
}
