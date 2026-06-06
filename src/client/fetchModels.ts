import { Mistral } from '@mistralai/mistralai';
import type { BaseModelCard, FTModelCard } from '@mistralai/mistralai/models/components';
import type { MistralModel, RawModel } from '../types.js';
import { DEFAULT_COMPLETION_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS, MODEL_OUTPUT_LIMITS } from '../types.js';
import { formatModelName } from '../conversion/index.js';
import type { MistralClientLogger } from './clientLogger.js';

type KnownModelCard = BaseModelCard | FTModelCard;

export async function fetchModels (
    client: Mistral,
    log: MistralClientLogger,
): Promise<MistralModel[]> {
    try {
        const response = await client.models.list();

        const byId = new Map<string, KnownModelCard>();
        for ( const m of response.data ?? [] ) {
            if ( m.type !== 'base' && m.type !== 'fine-tuned' ) { continue; }
            if ( !m.capabilities.completionChat ) { continue; }
            if ( !byId.has( m.id ) ) { byId.set( m.id, m ); }
        }

        // Union-find: group all IDs that share aliases into one cluster.
        // Each entry's `aliases` field lists all other IDs that route to the same model.
        const parent = new Map<string, string>();
        const find = ( id: string ): string => {
            if ( parent.get( id ) !== id ) { parent.set( id, find( parent.get( id ) ?? id ) ); }
            return parent.get( id ) ?? id;
        };
        const union = ( a: string, b: string ) => { parent.set( find( a ), find( b ) ); };

        for ( const id of byId.keys() ) { parent.set( id, id ); }
        for ( const [ id, m ] of byId ) {
            for ( const alias of m.aliases ?? [] ) {
                if ( byId.has( alias ) ) { union( id, alias ); }
            }
        }

        // Collect clusters; pick canonical ID: prefer *-latest, then highest YYMM version, then first.
        const clusters = new Map<string, string[]>();
        for ( const id of byId.keys() ) {
            const root = find( id );
            const arr = clusters.get( root ) ?? [];
            arr.push( id );
            clusters.set( root, arr );
        }

        const pickCanonical = ( ids: string[] ): string => {
            const latest = ids.find( id => /latest/i.test( id ) );
            if ( latest ) { return latest; }
            return ids.reduce( ( best, id ) => {
                const ver = ( id.match( /(\d{4})$/ ) ?? [] )[ 1 ] ?? '0';
                const bestVer = ( best.match( /(\d{4})$/ ) ?? [] )[ 1 ] ?? '0';
                return ver > bestVer ? id : best;
            } );
        };

        const afterAliasDedup = new Set( Array.from( clusters.values() ).map( pickCanonical ) );

        // Second pass: among alias-deduped models, if multiple share the same family prefix
        // (id minus trailing -YYMM date stamp), keep only the one with the highest version.
        // This catches older versioned models that have no -latest alias connecting them.
        const familyPrefix = ( id: string ) => id.replace( /-(?:latest|\d{4})$/i, '' );
        const familyGroups = new Map<string, string[]>();
        for ( const id of afterAliasDedup ) {
            const prefix = familyPrefix( id );
            const arr = familyGroups.get( prefix ) ?? [];
            arr.push( id );
            familyGroups.set( prefix, arr );
        }
        const canonicalIds = new Set<string>();
        for ( const arr of familyGroups.values() ) {
            canonicalIds.add( pickCanonical( arr ) );
        }
        log.debug( `[Mistral] dedup: ${ byId.size } IDs → ${ afterAliasDedup.size } after alias dedup → ${ canonicalIds.size } after family dedup` );

        const modelsToUse: RawModel[] = Array.from( byId.entries() )
            .filter( ( [ id ] ) => canonicalIds.has( id ) )
            .map( ( [ , m ] ) => ( {
                id: m.id,
                originalName: m.name ? formatModelName( m.name ) : formatModelName( m.id ),
                detail: m.description ?? undefined,
                maxInputTokens: m.maxContextLength ?? 32768,
                maxOutputTokens:
                    MODEL_OUTPUT_LIMITS[ m.id.toLowerCase() ] ??
                    DEFAULT_MAX_OUTPUT_TOKENS,
                defaultCompletionTokens: DEFAULT_COMPLETION_TOKENS,
                toolCalling: m.capabilities?.functionCalling ?? false,
                supportsParallelToolCalls: m.capabilities?.functionCalling ?? false,
                supportsVision: m.capabilities?.vision ?? false,
                supportsCompletionFim: m.capabilities?.completionFim ?? false,
                temperature: m.defaultModelTemperature ?? undefined,
            } ) );

        const nameCounts = new Map<string, number>();
        for ( const rawModel of modelsToUse ) {
            nameCounts.set( rawModel.originalName, ( nameCounts.get( rawModel.originalName ) ?? 0 ) + 1 );
        }

        return modelsToUse.map( rawModel => ( {
            id: rawModel.id,
            name: nameCounts.get( rawModel.originalName )! > 1 ? `${ rawModel.originalName } (${ rawModel.id })` : rawModel.originalName,
            detail: rawModel.detail,
            maxInputTokens: rawModel.maxInputTokens,
            maxOutputTokens: rawModel.maxOutputTokens,
            defaultCompletionTokens: rawModel.defaultCompletionTokens,
            toolCalling: rawModel.toolCalling,
            supportsParallelToolCalls: rawModel.supportsParallelToolCalls,
            supportsVision: rawModel.supportsVision,
            supportsCompletionFim: rawModel.supportsCompletionFim,
            temperature: rawModel.temperature,
        } ) );
    } catch ( error ) {
        log.error( '[Mistral] Failed to fetch models: ' + String( error ) );
        return [];
    }
}
