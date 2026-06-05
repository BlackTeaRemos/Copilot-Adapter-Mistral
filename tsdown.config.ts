import { defineConfig } from 'tsdown';

const production = process.env.NODE_ENV === 'production';

export default defineConfig( {
  entry: [ 'src/extension.ts' ],
  outDir: 'dist',
  format: 'cjs',
  platform: 'node',
  deps: {
    neverBundle: [ 'vscode' ],
    alwaysBundle: [ '@mistralai/mistralai', 'js-tiktoken' ],
  },
  inputOptions: ( options ) => {
    options.resolve = { ...options.resolve, mainFields: [ 'main', 'module' ] };
  },
  sourcemap: !production,
  minify: production,
  clean: true,
} );
