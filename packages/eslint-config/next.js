/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [require.resolve('./base'), 'next/core-web-vitals'],
  rules: {
    '@next/next/no-html-link-for-pages': 'error',
  },
};
