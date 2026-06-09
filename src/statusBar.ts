import { MarkdownString, StatusBarItem, ThemeColor } from 'vscode';
import type { UsageStats } from './types.js';
import type { TokenizerCalibration } from './cacheCalibration.js';

export function updateStatusBar(
    statusBarItem: StatusBarItem,
    usage: UsageStats,
    modelName: string,
    modelId: string,
    calibration: TokenizerCalibration,
    authenticated: boolean = true,
): void {
    if ( !authenticated ) {
        const md = new MarkdownString(
            `**Mistral** — not signed in\n\n` +
            `[$(sign-in) Sign in with browser](command:mistral-adapter.signIn) &nbsp;·&nbsp; ` +
            `[$(key) Enter API key](command:mistral-adapter.manageApiKey)`,
        );
        md.isTrusted = true;
        md.supportThemeIcons = true;
        statusBarItem.text = `$(hubot) Mistral: sign in`;
        statusBarItem.tooltip = md;
        statusBarItem.command = `mistral-adapter.signIn`;
        statusBarItem.backgroundColor = new ThemeColor( `statusBarItem.warningBackground` );
        statusBarItem.show();
        return;
    }

    const { input, output, cached } = usage;
    if ( input === 0 && output === 0 ) {
        statusBarItem.hide();
        return;
    }

    const fmt = ( n: number ) => {
        return n >= 1000 ? `${ ( n / 1000 ).toFixed( 1 ) }k` : String( n );
    };
    const modelTag = modelName ? ` ${ modelName }` : ``;
    const conf = calibration.confidenceLevel( modelId );
    const samples = calibration.sampleCount( modelId );
    const scale = calibration.scale( modelId );
    const scaleStr = samples > 0 ? ( scale !== undefined ? scale.toFixed( 3 ) : `cal…` ) : ``;
    const cacheTag = cached > 0 ? ` ${ fmt( cached ) } cached` : ``;
    const scaleTag = scaleStr ? ` [${ scaleStr }]` : ``;

    statusBarItem.command = undefined;
    statusBarItem.backgroundColor = undefined;
    statusBarItem.text = `$(hubot)${ modelTag } ${ fmt( input ) }↑ ${ fmt( output ) }↓${ cacheTag }${ scaleTag }`;

    const cachedLine = cached > 0 ? `- cached: ${cached.toLocaleString()}\n` : ``;
    const tokLine = samples > 0
        ? `- tokenizer scale: ${ scale !== undefined ? scale.toFixed( 3 ) : `calibrating` } (${ ( conf * 100 ).toFixed( 0 ) }% conf, ${ samples } samples)\n`
        : ``;
    const tip = new MarkdownString(
        `**Mistral** — last turn (${ modelName })\n\n` +
        `- prompt: ${ input.toLocaleString() }\n` +
        cachedLine +
        `- completion: ${ output.toLocaleString() }\n` +
        `- total: ${ ( input + output ).toLocaleString() }\n` +
        tokLine,
    );
    tip.isTrusted = true;
    tip.supportThemeIcons = true;
    statusBarItem.tooltip = tip;
    statusBarItem.show();
}
