export interface ModelConfigurationProperty {
    readonly type: `number` | `integer` | `string` | `boolean`;
    readonly title?: string;
    readonly description?: string;
    readonly default?: unknown;
    readonly minimum?: number;
    readonly maximum?: number;
    readonly enum?: readonly ( string | number )[];
    readonly enumItemLabels?: readonly string[];
    readonly enumDescriptions?: readonly string[];
    readonly group?: string;
}
