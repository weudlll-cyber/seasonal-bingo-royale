/**
 * @file   apps/web/src/shell/sharedCall.tsx
 * @module web/shell
 * @brief  The way back to the one call the website shares with its games (kit K77).
 *
 * Responsibility: the id of the live shared call, as the dock's slot reports it (./DockedChat,
 *                 website mode only), for the screens that show a result; `ResultCallLink` is the
 *                 kit's link to `/calls/<id>`, shown only while a call is live (owner decision of
 *                 2026-11-27). Without a dock (standalone) there is no id and nothing shows.
 * Depends on:     react, @seasonal/kit/react (BackToCall)
 * Used by:        ./DockedChat, ../game/ArenaNotice, ../host/HostConsole
 * Spec:           docs/spec/07-integration-architecture.md §6; website GAME-INTEGRATION.md §9
 */
import { BackToCall } from '@seasonal/kit/react';
import { createContext, useContext, type ReactElement } from 'react';

export const SharedCallContext = createContext<number | null>(null);

export function ResultCallLink(): ReactElement {
  return <BackToCall callId={useContext(SharedCallContext)} />;
}
