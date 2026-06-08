import * as vscode from 'vscode';
import { createHash } from 'crypto';
import type { Mistral } from '@mistralai/mistralai';
import {
    createEmbeddings,
    rankBySimilarity,
    type EmbeddingModel,
    type EmbeddingsLogger,
} from './mistralEmbeddings.js';

export interface CodeChunk {
    /** Workspace-relative file path. */
    file: string;
    /** 1-based inclusive line range. */
    startLine: number;
    endLine: number;
    text: string;
}

export interface IndexEntry extends CodeChunk {
    vector: number[];
}

/** Per-file cache: content hash + its embedded chunks. */
interface FileIndex {
    hash: string;
    chunks: IndexEntry[];
}

interface PersistedIndex {
    model: string;
    files: Record<string, FileIndex>;
}

export interface ChunkOptions {
    maxLines?: number;
    maxChars?: number;
}

const DEFAULT_CHUNK: Required<ChunkOptions> = { maxLines: 40, maxChars: 1500 };

/**
 * Splits document text into line-aligned chunks. A chunk closes when it reaches
 * `maxLines` lines or `maxChars` characters. Whitespace-only chunks are dropped.
 *
 * @returns Chunks with 1-based inclusive line ranges.
 */
export function chunkDocument ( text: string, opts: ChunkOptions = {} ): CodeChunk[] {
    const maxLines = opts.maxLines ?? DEFAULT_CHUNK.maxLines;
    const maxChars = opts.maxChars ?? DEFAULT_CHUNK.maxChars;
    const lines = text.split( /\r?\n/ );
    const chunks: CodeChunk[] = [];

    let startLine = 1;
    let buf: string[] = [];
    let chars = 0;

    const flush = ( endLine: number ): void => {
        const body = buf.join( '\n' );
        if ( body.trim().length > 0 ) {
            chunks.push( { file: '', startLine, endLine, text: body } );
        }
        buf = [];
        chars = 0;
    };

    for ( let i = 0; i < lines.length; i++ ) {
        const line = lines[ i ];
        if ( buf.length > 0 && ( buf.length >= maxLines || chars + line.length > maxChars ) ) {
            flush( i );
            startLine = i + 1;
        }
        buf.push( line );
        chars += line.length + 1;
    }
    if ( buf.length > 0 ) { flush( lines.length ); }

    return chunks;
}

export function hashContent ( text: string ): string {
    return createHash( 'sha1' ).update( text ).digest( 'hex' );
}

export interface ReindexPlan {
    /** Files whose cached vectors can be reused unchanged. */
    reuse: string[];
    /** New or modified files that must be (re)embedded. */
    embed: string[];
    /** Cached files no longer present, to be dropped. */
    remove: string[];
}

/**
 * Decides which files to re-embed. Pure for testability.
 *
 * @param current Files found now, with their content hashes.
 * @param cached  Hashes from the persisted index.
 */
export function planReindex (
    current: ReadonlyArray<{ file: string; hash: string; }>,
    cached: Readonly<Record<string, { hash: string; }>>,
): ReindexPlan {
    const reuse: string[] = [];
    const embed: string[] = [];
    const seen = new Set<string>();
    for ( const { file, hash } of current ) {
        seen.add( file );
        if ( cached[ file ] && cached[ file ].hash === hash ) { reuse.push( file ); }
        else { embed.push( file ); }
    }
    const remove = Object.keys( cached ).filter( f => !seen.has( f ) );
    return { reuse, embed, remove };
}

export interface BuildResult {
    total: number;
    embedded: number;
    reused: number;
}

/** Files matched/excluded when indexing a workspace. */
const INCLUDE_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,kt,c,h,cpp,hpp,cs,rb,php,swift,scala,sh,md,json,yaml,yml,toml,sql,vue,svelte}';
const EXCLUDE_GLOB = '**/{node_modules,.git,dist,out,build,.vscode-test,coverage,vendor,target,.next,.turbo}/**';
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 200_000;

export type IndexState = 'empty' | 'ready' | 'indexing';

/**
 * Builds and queries a per-workspace embedding index over source files.
 *
 * The index is file-keyed and content-hashed: rebuilds re-embed only changed
 * files, so unchanged code never spends tokens again. It is persisted to the
 * extension's workspace storage so results survive reloads.
 */
export class CodebaseEmbeddingIndex {
    private files: Record<string, FileIndex> = {};
    private indexedModel: EmbeddingModel | undefined;
    private loaded = false;
    private state: IndexState = 'empty';
    private readonly onDidChange = new vscode.EventEmitter<void>();

    /** Fires whenever the index state or contents change (for status UI). */
    readonly onChange = this.onDidChange.event;

    constructor (
        private readonly context: vscode.ExtensionContext,
        private readonly getClient: () => Promise<Mistral | null>,
        private readonly log: EmbeddingsLogger,
        private readonly getModel: () => EmbeddingModel,
    ) { }

    getState (): IndexState { return this.state; }

    get chunkCount (): number {
        let n = 0;
        for ( const f of Object.values( this.files ) ) { n += f.chunks.length; }
        return n;
    }

    get fileCount (): number { return Object.keys( this.files ).length; }

    private setState ( state: IndexState ): void {
        this.state = state;
        this.onDidChange.fire();
    }

    private get storageUri (): vscode.Uri | undefined {
        const base = this.context.storageUri;
        return base ? vscode.Uri.joinPath( base, 'embeddingIndex.json' ) : undefined;
    }

    /** Loads a persisted index from workspace storage, if present. */
    async load (): Promise<void> {
        if ( this.loaded ) { return; }
        this.loaded = true;
        const uri = this.storageUri;
        if ( !uri ) { return; }
        try {
            const bytes = await vscode.workspace.fs.readFile( uri );
            const data = JSON.parse( new TextDecoder().decode( bytes ) ) as PersistedIndex;
            if ( data && data.files && typeof data.files === 'object' ) {
                this.files = data.files;
                this.indexedModel = data.model as EmbeddingModel;
                this.log.info( `[Mistral] Loaded embedding index: ${ this.fileCount } files / ${ this.chunkCount } chunks (model ${ this.indexedModel }).` );
            }
        } catch {
            // No persisted index yet — first build will create one.
        }
        this.setState( this.chunkCount > 0 ? 'ready' : 'empty' );
    }

    private async persist ( model: EmbeddingModel ): Promise<void> {
        const uri = this.storageUri;
        if ( !uri || !this.context.storageUri ) { return; }
        try {
            await vscode.workspace.fs.createDirectory( this.context.storageUri );
            const payload: PersistedIndex = { model, files: this.files };
            await vscode.workspace.fs.writeFile( uri, new TextEncoder().encode( JSON.stringify( payload ) ) );
        } catch ( err ) {
            this.log.warn( `[Mistral] Failed to persist embedding index: ${ String( err ) }` );
        }
    }

    /**
     * (Re)builds the index over the current workspace, re-embedding only files
     * whose contents changed since the last build.
     */
    async build (
        progress?: vscode.Progress<{ message?: string; }>,
        token?: vscode.CancellationToken,
    ): Promise<BuildResult> {
        await this.load();
        const model = this.getModel();
        const client = await this.getClient();
        if ( !client ) {
            throw new Error( 'Mistral API key not set. Run "Mistral: Manage API Key" first.' );
        }

        // A model switch invalidates every cached vector (different vector space).
        if ( this.indexedModel && this.indexedModel !== model ) {
            this.log.info( `[Mistral] Embedding model changed ${ this.indexedModel } → ${ model }; reindexing all files.` );
            this.files = {};
        }

        this.setState( 'indexing' );
        try {
            progress?.report( { message: 'Scanning workspace files…' } );
            const found = await vscode.workspace.findFiles( INCLUDE_GLOB, EXCLUDE_GLOB, MAX_FILES );

            // Read + hash candidate files.
            const current: Array<{ file: string; hash: string; text: string; }> = [];
            for ( const uri of found ) {
                if ( token?.isCancellationRequested ) { this.setState( this.chunkCount > 0 ? 'ready' : 'empty' ); return this.result( 0, 0 ); }
                try {
                    const stat = await vscode.workspace.fs.stat( uri );
                    if ( stat.size > MAX_FILE_BYTES ) { continue; }
                    const text = new TextDecoder().decode( await vscode.workspace.fs.readFile( uri ) );
                    current.push( { file: vscode.workspace.asRelativePath( uri, false ), hash: hashContent( text ), text } );
                } catch {
                    // Unreadable file — skip.
                }
            }

            const plan = planReindex( current, this.files );
            for ( const file of plan.remove ) { delete this.files[ file ]; }

            const reusedChunks = plan.reuse.reduce( ( n, f ) => n + ( this.files[ f ]?.chunks.length ?? 0 ), 0 );
            this.log.info( `[Mistral] Reindex plan: embed ${ plan.embed.length } file(s), reuse ${ plan.reuse.length }, remove ${ plan.remove.length }.` );

            // Chunk the files that need embedding.
            const byFile = new Map( current.map( c => [ c.file, c ] ) );
            const pending: CodeChunk[] = [];
            for ( const file of plan.embed ) {
                const entry = byFile.get( file );
                if ( !entry ) { continue; }
                for ( const c of chunkDocument( entry.text ) ) { pending.push( { ...c, file } ); }
            }

            let embeddedChunks = 0;
            if ( pending.length > 0 ) {
                progress?.report( { message: `Embedding ${ pending.length } changed chunks…` } );
                const vectors = await createEmbeddings( client, model, pending.map( c => c.text ), {
                    shouldCancel: () => token?.isCancellationRequested ?? false,
                    onProgress: ( done, total ) => progress?.report( { message: `Embedding ${ done }/${ total } changed chunks…` } ),
                    log: this.log,
                } );

                // Group embedded chunks back by file.
                const grouped = new Map<string, IndexEntry[]>();
                for ( let i = 0; i < pending.length; i++ ) {
                    const vector = vectors[ i ];
                    if ( !vector || vector.length === 0 ) { continue; }
                    const chunk = pending[ i ];
                    ( grouped.get( chunk.file ) ?? grouped.set( chunk.file, [] ).get( chunk.file )! ).push( { ...chunk, vector } );
                }
                for ( const file of plan.embed ) {
                    const hash = byFile.get( file )!.hash;
                    this.files[ file ] = { hash, chunks: grouped.get( file ) ?? [] };
                }
                embeddedChunks = pending.length;
            }

            this.indexedModel = model;
            await this.persist( model );
            this.setState( this.chunkCount > 0 ? 'ready' : 'empty' );
            this.log.info( `[Mistral] Index built: ${ this.chunkCount } chunks (${ embeddedChunks } embedded, ${ reusedChunks } reused).` );
            return this.result( embeddedChunks, reusedChunks );
        } catch ( err ) {
            this.setState( this.chunkCount > 0 ? 'ready' : 'empty' );
            throw err;
        }
    }

    private result ( embedded: number, reused: number ): BuildResult {
        return { total: this.chunkCount, embedded, reused };
    }

    private allEntries (): IndexEntry[] {
        const out: IndexEntry[] = [];
        for ( const f of Object.values( this.files ) ) { out.push( ...f.chunks ); }
        return out;
    }

    /** Embeds `query` and returns the top matching chunks. */
    async search (
        query: string,
        topK = 10,
        token?: vscode.CancellationToken,
    ): Promise<Array<{ entry: IndexEntry; score: number; }>> {
        await this.load();
        const entries = this.allEntries();
        if ( entries.length === 0 ) { return []; }
        const client = await this.getClient();
        if ( !client ) {
            throw new Error( 'Mistral API key not set. Run "Mistral: Manage API Key" first.' );
        }
        const model = this.indexedModel ?? this.getModel();
        const [ queryVec ] = await createEmbeddings( client, model, [ query ], {
            shouldCancel: () => token?.isCancellationRequested ?? false,
        } );
        if ( !queryVec || queryVec.length === 0 ) { return []; }
        return rankBySimilarity(
            queryVec,
            entries.map( entry => ( { item: entry, vector: entry.vector } ) ),
            topK,
        ).map( r => ( { entry: r.item, score: r.score } ) );
    }

    /** Clears the in-memory and persisted index. */
    async clear (): Promise<void> {
        this.files = {};
        this.indexedModel = undefined;
        const uri = this.storageUri;
        if ( uri ) {
            try { await vscode.workspace.fs.delete( uri ); } catch { /* nothing to delete */ }
        }
        this.setState( 'empty' );
    }

    dispose (): void { this.onDidChange.dispose(); }
}
