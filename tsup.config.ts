import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/react/index.tsx'],
  format: ['cjs', 'esm'],
  dts: false,
  clean: true,
  external: ['react', 'react-dom'],
  injectStyle: true,
});
