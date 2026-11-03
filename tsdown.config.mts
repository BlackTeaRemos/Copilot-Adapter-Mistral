import { defineConfig } from 'tsdown';
import mistralPackage from '@mistralai/mistralai/package.json' with { type: 'json' };

// SDK features outside this adapter declare their integrations as optional peers.
const OPTIONAL_SDK_PEERS = Object.entries( mistralPackage.peerDependenciesMeta ).filter( ( [ , metadata ] ) => {
  return metadata.optional;
} ).map( ( [ packageName ] ) => {
  return packageName;
} );

const production = process.env.NODE_ENV === 'production';

export default defineConfig( {
  entry: [ 'src/extension.ts' ],
  outDir: 'dist',
  format: 'cjs',
  platform: 'node',
  deps: {
    neverBundle: [ 'vscode', ...OPTIONAL_SDK_PEERS ],
    alwaysBundle: [ '@mistralai/mistralai', 'js-tiktoken' ],
  },
  inputOptions: ( options ) => {
    options.resolve = { ...options.resolve, mainFields: [ 'main', 'module' ] };
  },
  sourcemap: !production,
  minify: production,
  clean: true,
} );
