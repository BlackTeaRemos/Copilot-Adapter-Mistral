import { randomUUID } from 'crypto';
import type { ToolCallIdMap } from '../types.js';

export function createToolCallIdMap (): ToolCallIdMap {
    return {
        vsCodeToMistral: new Map(),
        mistralToVsCode: new Map(),
    };
}

export function generateToolCallId (): string {
    return randomUUID().replace( /-/g, `` ).substring( 0, 9 );
}

export function getOrCreateVsCodeToolCallId ( map: ToolCallIdMap, mistralId: string ): string {
    if ( map.mistralToVsCode.has( mistralId ) ) {
        return map.mistralToVsCode.get( mistralId )!;
    }
    const vsCodeId = generateToolCallId();
    map.vsCodeToMistral.set( vsCodeId, mistralId );
    map.mistralToVsCode.set( mistralId, vsCodeId );
    return vsCodeId;
}

export function getOrCreateMistralToolCallId ( map: ToolCallIdMap, vsCodeId: string ): string {
    if ( map.vsCodeToMistral.has( vsCodeId ) ) {
        return map.vsCodeToMistral.get( vsCodeId )!;
    }
    const mistralId = generateToolCallId();
    map.vsCodeToMistral.set( vsCodeId, mistralId );
    map.mistralToVsCode.set( mistralId, vsCodeId );
    return mistralId;
}

export function getMistralToolCallId ( map: ToolCallIdMap, vsCodeId: string ): string | undefined {
    return map.vsCodeToMistral.get( vsCodeId );
}
