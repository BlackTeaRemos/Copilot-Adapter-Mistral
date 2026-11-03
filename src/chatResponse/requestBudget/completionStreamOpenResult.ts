import type { CompletionEvent } from '@mistralai/mistralai/models/components';
import type { CompletionBudget } from '../../completionBudget/completionBudget.js';

export interface CompletionStreamOpenResult {
    readonly stream: AsyncIterable<CompletionEvent>;
    readonly budget: CompletionBudget;
}
