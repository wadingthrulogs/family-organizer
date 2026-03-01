module.exports = {
  env: {
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:import/typescript',
    'plugin:import/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'import', 'simple-import-sort'],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
  rules: {
    'import/order': 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'import/newline-after-import': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
  },
};
