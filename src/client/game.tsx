import './index.css';

import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CarveCard, CrossedCard, FellAgainCard, GraveCard, SpentCard } from './game/Cards';
import { Hud } from './game/Hud';
import { Stage } from './game/Stage';
import { cellOf } from '../shared/board';
import { arrowIsTrue, directionBetween } from '../shared/epitaphs';
import { useGame } from './game/useGame';
import type { GraveView, SceneState } from './engine/scene';

export const App = () => {
  const { s, tap, onFallDone, onCrossDone, carve, share, join, flair, walkAgain, closeCard, hint } = useGame();

  const scene = useMemo<SceneState | null>(() => {
    if (!s.board) return null;
    const revealAll = s.phase === 'crossed' || s.phase === 'idle';
    const board = s.board;
    const graves = new Map<number, GraveView>();
    s.graves.forEach((g) => {
      const arrow = g.top?.arrow ?? null;
      graves.set(g.i, {
        arrow,
        falls: g.falls,
        mine: g.mine,
        // the truth is only shown once your run is over
        truth: revealAll && arrow !== null ? arrowIsTrue(board, g.i, arrow) : null,
      });
    });
    const knownPits = new Set(s.me?.fellInto ?? []);
    return { board: s.board, revealed: s.revealed, player: s.player, graves, knownPits, phase: s.phase, revealAll };
  }, [s.board, s.revealed, s.player, s.graves, s.phase, s.me]);

  if (s.status === 'error') {
    return (
      <main className="app app-center">
        <p className="logo">Here Lies</p>
        <p className="hint">{s.error}</p>
      </main>
    );
  }

  const card = s.card;
  const grave = card.kind === 'grave' ? s.graves.get(card.i) : undefined;
  const carveStep = card.kind === 'carve' && s.walkedThisRun > 0 ? s.walkedThisRun : null;

  return (
    <main className="app">
      {s.day && s.me ? <Hud day={s.day} me={s.me} /> : <header className="hud"><h1 className="logo">Here Lies</h1></header>}
      <Stage scene={scene} onTap={tap} onFallDone={onFallDone} onCrossDone={onCrossDone}>
        {s.me && s.day && (
          <div className={`card-layer ${s.player.r >= 4 && s.phase !== 'crossed' ? 'card-layer-top' : ''}`}>
            {card.kind === 'grave' && grave && s.board && (
              <GraveCard grave={grave} me={s.me} board={s.board} judged={s.phase === 'crossed' || s.phase === 'idle'} onClose={closeCard} />
            )}
            {card.kind === 'fellAgain' && <FellAgainCard me={s.me} reason={card.reason} onWalk={walkAgain} />}
            {card.kind === 'carve' && (
              <CarveCard me={s.me} step={carveStep} stone={cellOf(card.i)} fellToward={directionBetween(cellOf(card.i), s.player)} onCarve={carve} />
            )}
            {card.kind === 'crossed' && <CrossedCard me={s.me} day={s.day} onClose={closeCard} onShare={share} onJoin={join} onFlair={flair} />}
            {card.kind === 'spent' && <SpentCard me={s.me} day={s.day} onClose={closeCard} onShare={share} onJoin={join} />}
          </div>
        )}
        {s.toast && <div className="toast" role="status">{s.toast}</div>}
      </Stage>
      <footer className="hint" aria-live="polite">{s.status === 'loading' ? 'Lighting the torch…' : hint}</footer>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
