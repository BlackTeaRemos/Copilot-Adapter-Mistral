export type ModelOptions = Record<string, unknown>;

export function toModelOptions ( val: unknown ): ModelOptions {
    return ( val !== null && typeof val === `object` ) ? ( val as ModelOptions ) : {};
}

export function getNumberOption ( opts: ModelOptions, key: string ): number | undefined {
    const v = opts[ key ];
    return typeof v === `number` ? v : undefined;
}

export function getBooleanOption ( opts: ModelOptions, key: string ): boolean | undefined {
    const v = opts[ key ];
    return typeof v === `boolean` ? v : undefined;
}
