import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import { sveltekit } from '@sveltejs/kit/vite';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    include: ['@solana/web3.js', 'buffer'],
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis'
      },
      plugins: [NodeGlobalsPolyfillPlugin({ buffer: true, process: true })]
    }
  },
  resolve: {
    alias: {
      stream: 'rollup-plugin-node-polyfills/polyfills/stream',
      zlib: 'rollup-plugin-node-polyfills/polyfills/zlib',
      process: 'rollup-plugin-node-polyfills/polyfills/process'
    }
  },
  define: {
    'process.env.BROWSER': true,
    'process.env.NODE_DEBUG': JSON.stringify('')
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true
    },
    rollupOptions: {
      plugins: [
        inject({ Buffer: ['buffer', 'Buffer'] }) as unknown as Plugin,
        nodePolyfills() as unknown as Plugin
      ]
    }
  }
});
