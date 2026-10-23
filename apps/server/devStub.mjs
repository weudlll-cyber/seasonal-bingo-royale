/**
 * @file   apps/server/devStub.mjs
 * @module server
 * @brief  Stands in for the development modules in the production server bundle.
 *
 * Responsibility: export every name the server imports from src/dev/*, the Quick Test route
 *                 and the dev sign-in route, each throwing when called. The app calls them
 *                 only with SBR_DEV=1, which a production install never sets; a name missing
 *                 here fails the build, not the server.
 * Used by:        ./build.mjs (dev-stub plugin)
 * Spec:           docs/spec/09-deployment-architecture.md §1
 */
const missing = () => {
  throw new Error('development code is not part of the production bundle; run without SBR_DEV');
};

export const registerQuickTest = missing;
export const registerDevSignIn = missing;
export const fastRuleset = missing;
