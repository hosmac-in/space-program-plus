// What the bundler cannot see.
//
// `npm run build` type-checks nothing and resolves nothing beyond imports: an
// undefined identifier, a component used but never imported, and a const read
// before its declaration all bundle cleanly and blank the page at runtime.
// All three have shipped here. This config exists for exactly those, so the
// static sweep that used to be done by eye is a command.
//
//   npm run lint
//
// Rules are deliberately few. This is a correctness net, not a style guide —
// formatting opinions would bury the three errors that matter in noise.

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      // The three that have actually broken this app.
      //
      // no-undef alone does NOT cover <Foo /> — a JSX name is not an ordinary
      // identifier reference — so jsx-no-undef is what catches a component used
      // but never imported. jsx-uses-vars is its other half: without it, an
      // import only used inside JSX reads as unused.
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off', // new JSX transform; React need not be in scope
      'no-undef': 'error',

      // Dead code after an edit: a prop threaded to nowhere, a helper left
      // behind. Args are ignored — an unused callback parameter is normal.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],

      // Hook dependency mistakes. A warning, not an error: several callbacks
      // here are deliberately `[]` with a ref re-pointed each render, which is
      // the documented pattern in this codebase and which this rule flags.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
