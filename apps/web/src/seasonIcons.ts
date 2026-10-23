/**
 * @file   apps/web/src/seasonIcons.ts
 * @module web
 * @brief  URLs of the original Seasonal Tokens season icons (01 §13).
 *
 * Responsibility: import the delivered SVGs from assets/seasons so Vite copies them
 *                 into the web bundle (hashed file names in a build, served from the
 *                 repository in dev). The icons are used as delivered, never redrawn.
 * Depends on:     assets/seasons/*.svg (repository root), ./types
 * Used by:        ./components/SeasonIcon
 * Spec:           docs/spec/01-game-design.md §13, assets/README.md
 */
import autumn from '../../../assets/seasons/autumn.svg';
import spring from '../../../assets/seasons/spring.svg';
import summer from '../../../assets/seasons/summer.svg';
import winter from '../../../assets/seasons/winter.svg';
import type { Season } from './types.js';

export const SEASON_ICON_URLS: Readonly<Record<Season, string>> = Object.freeze({
  spring,
  summer,
  autumn,
  winter,
});
