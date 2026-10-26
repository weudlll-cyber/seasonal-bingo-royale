/**
 * @file   apps/web/src/game/VerifyMatch.tsx
 * @module web/game
 * @brief  "Verify this match": the commitment, the revealed seed and whether the match follows from it.
 *
 * Responsibility: ask GET /api/v1/matches/:code/verify and show what the server found (the
 *                 client computes nothing, 01 §9): one verdict line, the commitment published
 *                 when the match opened and the seed revealed after it ended, whether
 *                 sha256(seed) is that commitment, and per round whether the draw order, the
 *                 draws made and the cards dealt follow from the seed. The data can be
 *                 downloaded as JSON to check elsewhere. Before the end the page says the seed
 *                 is revealed once the match is over.
 * Depends on:     react, @sbr/contracts (types), ../shell/http, ../shell/router, ./game.css
 * Used by:        ../shell/AppShell
 * Spec:           docs/spec/01-game-design.md §9; docs/spec/05-api-design.md §2.3a
 */
import type { MatchVerificationView, RoundVerification } from '@sbr/contracts';
import { useEffect, useState, type ReactElement } from 'react';

import { api, ApiError } from '../shell/http.js';
import { hrefOf } from '../shell/router.js';
import './game.css';

type Loaded =
  | { readonly kind: 'loading' }
  | { readonly kind: 'notOver' }
  | { readonly kind: 'failed'; readonly code: string }
  | { readonly kind: 'ready'; readonly v: MatchVerificationView };

export function VerifyMatch({ code }: { readonly code: string }): ReactElement {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    api<MatchVerificationView>(`/matches/${encodeURIComponent(code)}/verify`).then(
      (v) => {
        if (live) setLoaded({ kind: 'ready', v });
      },
      (error: unknown) => {
        if (!live) return;
        const failed = error instanceof ApiError ? error.code : 'ERROR';
        setLoaded(
          failed === 'MATCH_NOT_OVER' ? { kind: 'notOver' } : { kind: 'failed', code: failed },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [code]);
  return (
    <section className="sbr-panel sbr-stack verify-page" data-testid="verify-page">
      <h1>Verify this match</h1>
      <VerifyBody loaded={loaded} />
      <a className="sbr-btn" href={hrefOf({ name: 'lobby' })}>
        Back to the lobby
      </a>
    </section>
  );
}

function VerifyBody({ loaded }: { readonly loaded: Loaded }): ReactElement {
  switch (loaded.kind) {
    case 'loading':
      return <p className="sbr-muted">Checking the match…</p>;
    case 'notOver':
      return (
        <p data-testid="verify-not-over">
          The seed is revealed once the match is over. Come back after the end.
        </p>
      );
    case 'failed':
      return (
        <p data-testid="verify-failed">
          {loaded.code === 'NOT_FOUND'
            ? 'There is no match with this code.'
            : 'The check could not be loaded.'}
        </p>
      );
    case 'ready':
      return <VerifyResult v={loaded.v} />;
  }
}

function VerifyResult({ v }: { readonly v: MatchVerificationView }): ReactElement {
  const download = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(v, null, 2))}`;
  return (
    <>
      <p className="sbr-muted">
        {v.title} · code {v.code} · {v.status === 'aborted' ? 'cancelled' : 'finished'}
      </p>
      <p
        className={
          v.verified ? 'verify-verdict verify-verdict--ok' : 'verify-verdict verify-verdict--bad'
        }
        data-testid="verify-verdict"
        data-verified={String(v.verified)}
      >
        {v.verified
          ? 'Everything matches: the seed fits the commitment published when the match opened, and every card and every draw follows from it.'
          : 'Does not match: the match does not follow from the revealed seed (details below).'}
      </p>
      <dl className="verify-facts">
        <dt>Commitment, published when the match opened</dt>
        <dd>
          <code data-testid="verify-commitment">{v.commitment}</code>
        </dd>
        <dt>Seed, revealed after the end</dt>
        <dd>
          <code data-testid="verify-seed">{v.seed}</code>
        </dd>
        <dt>sha256(seed) is the commitment</dt>
        <dd data-testid="verify-commitment-matches">{yesNo(v.commitmentMatches)}</dd>
      </dl>
      {v.rounds.length === 0 ? (
        <p className="sbr-muted">No round was played, so there are no cards or draws to check.</p>
      ) : (
        <RoundTable rounds={v.rounds} />
      )}
      <a href={download} download={`verify-${v.code}.json`} data-testid="verify-download">
        Download the verification data (JSON)
      </a>
    </>
  );
}

function RoundTable({ rounds }: { readonly rounds: readonly RoundVerification[] }): ReactElement {
  return (
    <table className="verify-rounds" data-testid="verify-rounds">
      <thead>
        <tr>
          <th scope="col">Round</th>
          <th scope="col">Draw order</th>
          <th scope="col">Draws</th>
          <th scope="col">Cards</th>
        </tr>
      </thead>
      <tbody>
        {rounds.map((r) => (
          <tr key={r.roundIndex} data-testid="verify-round">
            <th scope="row">{r.roundIndex + 1}</th>
            <td>{matches(r.drawOrderMatches)}</td>
            <td>
              {r.draws.length} · {matches(r.drawsMatch)}
            </td>
            <td>
              {r.cardsChecked} · {matches(r.cardsMatch)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const yesNo = (ok: boolean): string => (ok ? 'Yes' : 'No');
const matches = (ok: boolean): string => (ok ? 'matches' : 'differs');
