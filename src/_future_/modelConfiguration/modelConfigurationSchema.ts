import type { ModelConfigurationProperty } from './modelConfigurationProperty.js';

export interface ModelConfigurationSchema {
    readonly type: `object`;
    readonly properties: Readonly<Record<string, ModelConfigurationProperty>>;
}
