const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const stylistic = require('@stylistic/eslint-plugin');
const pluginReact = require('eslint-plugin-react');
const pluginImport = require('eslint-plugin-import');
const pluginReactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

module.exports = [
  // Global ignores
  {
    ignores: [
      'lib/',
      'coverage/',
      'node_modules/',
      'test/.tmp/',
      'src/frontend/asset/devtools/',
    ],
  },

  // Code style (replaces deprecated ESLint formatting rules)
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    jsx: true,
    braceStyle: '1tbs',
  }),

  // @typescript-eslint/recommended (flat config)
  ...tsPlugin.configs['flat/recommended'],

  // Main config
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      react: pluginReact,
      import: pluginImport,
      'react-hooks': pluginReactHooks,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // General
      'max-len': [ 'error', { code: 120 } ],
      eqeqeq: [ 'error', 'always' ],
      'no-console': 'off',
      'no-constant-condition': 'off',
      'no-debugger': 'warn',
      'prefer-const': [ 'error', { ignoreReadBeforeAssign: true } ],
      'no-irregular-whitespace': [ 'error', { skipComments: true } ],

      // Stylistic overrides — match existing project style (egg convention)
      '@stylistic/array-bracket-spacing': [ 'error', 'always' ],
      '@stylistic/arrow-parens': 'off',
      '@stylistic/indent': [ 'error', 2, { SwitchCase: 1 } ],
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/no-mixed-operators': 'off',
      '@stylistic/padded-blocks': 'off',
      '@stylistic/operator-linebreak': 'off',
      '@stylistic/quote-props': 'off',
      '@stylistic/jsx-quotes': [ 'error', 'prefer-double' ],
      '@stylistic/jsx-closing-bracket-location': 'off',
      '@stylistic/jsx-closing-tag-location': 'off',
      '@stylistic/jsx-wrap-multilines': 'off',
      '@stylistic/jsx-one-expression-per-line': 'off',
      '@stylistic/jsx-first-prop-new-line': 'off',
      '@stylistic/jsx-curly-spacing': 'off',
      '@stylistic/jsx-curly-newline': 'off',
      '@stylistic/jsx-curly-brace-presence': 'off',
      '@stylistic/jsx-function-call-newline': 'off',
      '@stylistic/jsx-indent-props': 'off',
      '@stylistic/jsx-tag-spacing': 'off',
      '@stylistic/no-multiple-empty-lines': [ 'error', { max: 2, maxBOF: 0, maxEOF: 1 } ],

      // TypeScript
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [ 'warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      } ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',

      // Sort & Import
      'sort-imports': [ 'error', {
        ignoreCase: true,
        ignoreDeclarationSort: true,
      } ],
      'import/order': [ 'error', {
        groups: [ 'builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object' ],
      } ],

      // React
      'react/jsx-max-props-per-line': [ 'error', { maximum: { single: 3, multi: 1 } } ],
      'react/jsx-closing-bracket-location': [ 'error', 'line-aligned' ],
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
