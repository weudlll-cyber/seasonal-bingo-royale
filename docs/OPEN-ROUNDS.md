# Open sign-ups for the website

The Seasonal Entertainment website shows the bingo rounds whose sign-up is open, if their host marked them for the website (D50). This page is the contract between the game and the website.

## Where

| Install                 | Status URL                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Embedded in the website | `https://<site domain>/games/bingo/api/public/open-rounds`                                                     |
| Standalone              | `https://<bingo domain>/api/public/open-rounds` (always an empty list: the option exists only in website mode) |

The host finds the option as **"Show on the Seasonal Entertainment website"** in the create form (below "Counts for the leaderboard") and in the host console of the match's lobby, where it can be switched until the start countdown begins. It is off by default and shown only in website mode. Test matches (from the test page or with the fast test rules) and matches with bots never appear.

The website's proxy needs nothing for this path: only `/games/bingo/auth/website` asks the website who the visitor is; `/games/bingo/api/public/open-rounds` goes to the game like every other game path, without a login. The game limits it to 60 requests a minute per address.

## Contract

```
GET <status URL>  — public, no login, JSON, Cache-Control max-age=30
{
  "version": 1,
  "rounds": [
    {
      "id": "string, stable per round, max 64 chars",
      "title": "string, max 80 chars",
      "kind": "string, max 40 chars (e.g. 'Seasonal Bingo Royale')",
      "startsAt": "ISO 8601 UTC or null",
      "signupClosesAt": "ISO 8601 UTC or null",
      "players": integer >= 0,
      "maxPlayers": integer >= 1 or null,
      "joinUrl": "absolute https URL on the same origin as the status URL"
    }
  ]
}
At most 20 rounds; only rounds whose sign-up is open now and that the host marked for
the website; no personal data (no player names). Unknown fields are ignored by the
website; a higher "version" is ignored as a whole until supported.
```

## What the game sends

- `id`: the match's id (a UUID).
- `kind`: `Seasonal Bingo Royale`, `Seasonal Bingo Classic` or `Seasonal Bingo Seasons`.
- `startsAt`: the announced start time, or null when the host starts it.
- `signupClosesAt`: an asynchronous lobby's closing time, else the announced start time, else null.
- `joinUrl`: the match's lobby page, e.g. `https://example.org/games/bingo/#/match/ABC123`.

The schema lives in `packages/contracts/src/http/openRounds.ts` (`openRoundsAnswer`); the server's answer is tested against it (`apps/server/test/openRounds.integration.test.ts`).
