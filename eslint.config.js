import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Module boundaries (docs/frontend.md): a feature uses app/, shared/ and api/ but never another
  // feature; shared/ and api/ depend on nothing above them. Cross-module imports go through @/.
  {
    files: ['src/shared/**/*.{ts,tsx}', 'src/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/features/*', '@/app/*'], message: 'shared/ and api/ must not depend on features or the app shell.' },
      ] }],
    },
  },
  {
    files: ['src/features/practice/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/features/*', '!@/features/practice', '!@/features/practice/**'], message: 'A feature must not import another feature; move shared code to src/shared/.' },
        { group: ['../../*'], message: 'Import from outside this feature with @/.' },
      ] }],
    },
  },
  {
    files: ['src/features/dashboard/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/features/*', '!@/features/dashboard', '!@/features/dashboard/**'], message: 'A feature must not import another feature; move shared code to src/shared/.' },
        { group: ['../../*'], message: 'Import from outside this feature with @/.' },
      ] }],
    },
  },
  {
    files: ['src/features/journey/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/features/*', '!@/features/journey', '!@/features/journey/**'], message: 'A feature must not import another feature; move shared code to src/shared/.' },
        { group: ['../../*'], message: 'Import from outside this feature with @/.' },
      ] }],
    },
  },
  {
    files: ['src/features/admin/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/features/*', '!@/features/admin', '!@/features/admin/**'], message: 'A feature must not import another feature; move shared code to src/shared/.' },
        { group: ['../../*'], message: 'Import from outside this feature with @/.' },
      ] }],
    },
  },
  {
    files: ['src/features/tune/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@/features/*', '!@/features/tune', '!@/features/tune/**'], message: 'A feature must not import another feature; move shared code to src/shared/.' },
        { group: ['../../*'], message: 'Import from outside this feature with @/.' },
      ] }],
    },
  },
])
