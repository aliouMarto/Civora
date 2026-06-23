/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [require.resolve('./base')],
  env: {
    node: true,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'error',
  },
};
