import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist/**', 'stremio-server/**', 'node_modules/**', 'release/**', 'build/**']),
  {
    files: ['electron.js', 'preload.cjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // These rules are overly strict for this codebase's intentional patterns
      // (synchronous effect state sync for derived UI, ref objects passed as JSX refs)
      // — disabling avoids 20+ false positives while real bugs are fixed directly.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-refresh/only-export-components': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
])
