const { FlatCompat } = require('@eslint/eslintrc');
const globals = require('globals');

const compat = new FlatCompat({ baseDirectory: __dirname });

module.exports = [
  {
    ignores: ['dist/', 'src/'],
  },
  ...compat.extends('airbnb-base'),
  {
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      'prefer-destructuring': [
        'error',
        {
          VariableDeclarator: { array: false, object: false },
          AssignmentExpression: { array: false, object: false },
        },
        { enforceForRenamedProperties: false },
      ],
      'max-len': [
        'error',
        {
          code: 140,
          ignoreComments: true,
          ignoreTrailingComments: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
    },
  },
];
