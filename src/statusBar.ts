import { StatusBarItem } from 'vscode';
import type { UsageStats } from './types.js';
import type { TokenizerCalibration } from './cacheCalibration.js';

export function updateStatusBar(
    statusBarItem: StatusBarItem,
    usage: UsageStats,
    modelName: string,
    modelId: string,
    calibration: TokenizerCalibration,
): void {
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

    statusBarItem.text = `$(hubot)${ modelTag } ${ fmt( input ) }↑ ${ fmt( output ) }↓${ cacheTag }${ scaleTag }`;

    const cachedLine = cached > 0 ? `  cached:          ${ cached.toLocaleString() }\n` : ``;
    const tokLine = samples > 0
        ? `tokenizer scale:  ${ scale !== undefined ? scale.toFixed( 3 ) : `calibrating` } (${ ( conf * 100 ).toFixed( 0 ) }% conf, ${ samples } samples)\n`
        : ``;
    statusBarItem.tooltip =
        `Mistral - last turn (${ modelName })\n` +
        `prompt (in):      ${ input.toLocaleString() }\n` +
        cachedLine +
        `completion (out): ${ output.toLocaleString() }\n` +
        `total:            ${ ( input + output ).toLocaleString() }\n` +
        tokLine;
    statusBarItem.show();
}
