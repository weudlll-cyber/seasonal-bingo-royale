/**
 * @file   prettier.config.js
 * @brief  Prettier formatting options for the whole repository.
 *
 * Responsibility: the one source of formatting; ESLint stays out of formatting
 *                 (eslint-config-prettier) and lefthook formats staged files.
 * Spec:           docs/spec/10-repository-structure.md §1
 */

/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  printWidth: 100,
};

export default config;
