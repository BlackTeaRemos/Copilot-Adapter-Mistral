import * as vscode from 'vscode';
import type { UsageStats } from './types.js';

interface ChatStatusItemLike {
    title: string | { label: string; link: string; helpText?: string };
    description: string;
    detail: string | undefined;
    tooltip: string | undefined;
    show (): void;
    hide (): void;
    dispose (): void;
}

type CreateChatStatusItem = ( id: string ) => ChatStatusItemLike;

function fmt ( n: number ): string {
    return n >= 1000 ? `${ ( n / 1000 ).toFixed( 1 ) }k` : String( n );
}

export class MistralChatStatus {
    private item: ChatStatusItemLike | undefined;

    constructor ( private readonly log: vscode.LogOutputChannel ) {
        const create = ( vscode.window as unknown as { createChatStatusItem?: CreateChatStatusItem } ).createChatStatusItem;
        if ( typeof create !== `function` ) {
            this.log.info( `[Mistral] createChatStatusItem unavailable - chat status item disabled` );
            return;
        }
        // The function may exist but throw when the chatStatusItem proposal is
        // not enabled. Swallow it and fall back to no-op so activation survives.
        try {
            this.item = create( `mistral.chatStatus` );
            this.item.title = `Mistral`;
            this.log.info( `[Mistral][probe] chat status item created` );
        } catch ( error ) {
            this.item = undefined;
            this.log.info( `[Mistral] chat status item unavailable (proposal not enabled): ` + String( error ) );
        }
    }

    public update ( usage: UsageStats, modelName: string ): void {
        if ( !this.item ) {
            return;
        }
        const { input, output, cached } = usage;
        if ( input === 0 && output === 0 ) {
            this.item.hide();
            return;
        }
        const cachePct = input > 0 ? Math.round( ( cached / input ) * 100 ) : 0;
        const cacheTag = cached > 0 ? ` $(zap) ${ cachePct }% cached` : ``;
        this.item.description = modelName ? `$(sparkle) ${ modelName }` : `$(sparkle) Mistral`;
        this.item.detail = `$(arrow-up) ${ fmt( input ) } $(arrow-down) ${ fmt( output ) }${ cacheTag }`;
        this.item.tooltip =
            `Mistral - last turn${ modelName ? ` (${ modelName })` : `` }\n` +
            `prompt: ${ input.toLocaleString() }\n` +
            ( cached > 0 ? `cached: ${ cached.toLocaleString() } (${ cachePct }%)\n` : `` ) +
            `completion: ${ output.toLocaleString() }\n` +
            `total: ${ ( input + output ).toLocaleString() }`;
        this.item.show();
        this.log.trace( `[Mistral][probe] chat status updated input=${ input } output=${ output } cached=${ cached }` );
    }

    public dispose (): void {
        this.item?.dispose();
        this.item = undefined;
    }
}
