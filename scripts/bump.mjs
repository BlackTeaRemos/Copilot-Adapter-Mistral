#!/usr/bin/env node
// Bumps package.json version locally before pushing a release tag.
// VS Code convention: even minor = stable, odd minor = pre-release.
//
// Usage (stable channel, even minor):
//   node scripts/bump.mjs patch   -> 0.2.4 -> 0.2.5   (stable patch)
//   node scripts/bump.mjs minor   -> 0.2.4 -> 0.3.0   (enter pre-release channel)
//   node scripts/bump.mjs major   -> 0.2.4 -> 1.0.0   (major)
//   node scripts/bump.mjs pre     -> 0.2.4 -> 0.3.0   (enter pre-release channel)
//
// Usage (pre-release channel, odd minor):
//   node scripts/bump.mjs pre     -> 0.3.1 -> 0.3.2   (iterate pre-release)
//   node scripts/bump.mjs patch   -> 0.3.1 -> 0.4.0   (graduate to stable)
//   node scripts/bump.mjs minor   -> 0.3.1 -> 0.4.0   (graduate to stable)
//   node scripts/bump.mjs major   -> 0.3.1 -> 1.0.0   (graduate to stable major)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const level = process.argv[ 2 ];
const valid = [ 'major', 'minor', 'patch', 'pre' ];
if ( !valid.includes( level ) ) {
    console.error( `Usage: node scripts/bump.mjs <${ valid.join( '|' ) }>` );
    process.exit( 1 );
}

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const pkgPath = join( root, 'package.json' );
const pkg = JSON.parse( readFileSync( pkgPath, 'utf8' ) );

// Strip any pre-release suffix for parsing (e.g. 0.3.1-beta.1 -> 0.3.1)
const base = pkg.version.replace( /-.*$/, '' );
const [ major, minor, patch ] = base.split( '.' ).map( Number );

const isPreChannel = minor % 2 !== 0;

if ( isPreChannel ) {
    switch ( level ) {
        case 'pre':   pkg.version = `${ major }.${ minor }.${ patch + 1 }`; break;
        case 'patch': pkg.version = `${ major }.${ minor + 1 }.0`; break;
        case 'minor': pkg.version = `${ major }.${ minor + 1 }.0`; break;
        case 'major': pkg.version = `${ major + 1 }.0.0`; break;
    }
} else {
    switch ( level ) {
        case 'pre':   pkg.version = `${ major }.${ minor + 1 }.0`; break;
        case 'patch': pkg.version = `${ major }.${ minor }.${ patch + 1 }`; break;
        case 'minor': pkg.version = `${ major }.${ minor + 1 }.0`; break;
        case 'major': pkg.version = `${ major + 1 }.0.0`; break;
    }
}

writeFileSync( pkgPath, JSON.stringify( pkg, null, 2 ) + '\n' );
console.log( `Version bumped to ${ pkg.version }` );

const isPreRelease = ( Number( pkg.version.split( '.' )[ 1 ] ) % 2 ) !== 0;
const tagSuffix = isPreRelease ? '-beta.1' : '';
const tagVersion = pkg.version + tagSuffix;
console.log( `Next: git add package.json && git commit -m "chore(release): ${ tagVersion }" && git tag v${ tagVersion } && git push origin main v${ tagVersion }` );
