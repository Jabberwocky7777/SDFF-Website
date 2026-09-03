import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/** Leading underscore marks a binding that exists for its position, not its value. */
const unusedVars = [
  'error',
  { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
]

export default defineConfig([
  globalIgnores(['dist', 'dist-server']),

  // Frontend: browser globals, React rules.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': unusedVars,
    },
  },

  // A provider and the hook that reads it belong in one file; splitting them
  // would only buy finer-grained Fast Refresh. Name the hooks explicitly rather
  // than switching the rule off, so a genuinely stray export still gets caught.
  {
    files: [
      'src/context/*.tsx',
      'src/components/hub/HubLayout.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['useAuth', 'useLeagues', 'useLeagueSlug', 'useHub'] },
      ],
    },
  },

  // Server: node globals, no React rules — it was previously linted as browser
  // code, so `process` and `Buffer` were undefined and `window` was assumed.
  {
    files: ['server/**/*.ts', '*.js', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': unusedVars,
    },
  },
])
