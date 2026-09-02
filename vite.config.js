import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import javascriptObfuscator from 'vite-plugin-javascript-obfuscator'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // Obfuscate only production bundles (not dev) — keeps dev fast and traceable
    javascriptObfuscator({
      apply: 'build',
      // `options` are passed to `javascript-obfuscator`
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.25,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.15,
        debugProtection: false,
        disableConsoleOutput: false,
        identifierNamesGenerator: 'hexadecimal',
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: false,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 5,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.65,
        transformObjectKeys: false,
        unicodeEscapeSequence: false,
      },
      // Only emit obfuscated chunks — exclude already-minified hls.js vendor to avoid double work/bloat
      // (hls chunk stays minified by esbuild; obfuscator still runs but threshold above keeps it bounded)
    }),
  ],
  build: {
    sourcemap: false, // disabled per hardening — no .map files emitted to dist
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('hls.js')) return 'hls'
        },
      },
    },
  },
})