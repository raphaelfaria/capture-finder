// ESLint flat config: TypeScript sources, tools and tests. The frozen legacy app, the old
// tests (tests/legacy) and generated files are not linted.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'legacy/**',
      'tests/legacy/**',
      'artboards/**',
      'dist/**',
      'dist-legacy/**',
      'dist-bridge/**',
      'public/**',
      'data/**',
      'docs/**',
      '.claude/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // tests use loosely typed fixtures
  { files: ['tests/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
