import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// eslint-plugin-react's published peer-range does not yet cover ESLint 10, so
// we enforce the one rule we actually care about (`react/no-danger`) via
// `no-restricted-syntax` — any JSX attribute named `dangerouslySetInnerHTML`
// fails the lint, with or without a value.
const NO_DANGER_SELECTOR =
  "JSXAttribute[name.name='dangerouslySetInnerHTML']"

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
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
      'no-restricted-syntax': [
        'error',
        {
          selector: NO_DANGER_SELECTOR,
          message:
            'dangerouslySetInnerHTML is banned. Render user-supplied text as React children (React escapes by default) instead of injecting raw HTML.',
        },
      ],
    },
  },
])
