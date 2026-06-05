import { defineConfig } from 'tsdown';

const production = process.env.NODE_ENV === 'production';

export default defineConfig( {
  entry: [ 'src/extension.ts' ],
  outDir: 'dist',
  format: 'cjs',
  platform: 'node',
  external: [ 'vscode', 'tiktoken' ],
  noExternal: [ '@mistralai/mistralai' ],
  sourcemap: !production,
  minify: production,
  clean: true,
} );
