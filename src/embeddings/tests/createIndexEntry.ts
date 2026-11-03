import type { IndexEntry } from '../codebaseIndex.js';

export function CreateIndexEntry ( file: string, text: string ): IndexEntry {
    return { file, startLine: 1, endLine: 3, text, vector: [ 1 ] };
}
