import './index.css';

import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { CarveCard, CrossedCard, GraveCard, SpentCard } from './game/Cards';
import { Hud } from './game/Hud';
import { Stage } from './game/Stage';
import { useGame } from './game/useGame';
import type { GraveView, SceneState } from './engine/scene';

export const App = () => {
  const { s, tap, onFallDone, onCrossDone, carve, vote, closeCard, hint } = useGame();

  const scene = useMemo<SceneState | null>(() => {
    if (!s.board) return null;
    const graves = new Map<number, GraveView>();
    s.graves.forEach((g) => {
      graves.set(g.i, {
        falls: g.falls,
        honest: g.top?.honest ?? 0,
        liar: g.top?.liar ?? 0,
        carved: g.carved > 0,
        mine: g.mine,
      });
    });
    return { board: s.board, revealed: s.revealed, player: s.player, graves, phase: s.phase };
  }, [s.board, s.revealed, s.player, s.graves, s.phase]);

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
            {card.kind === 'grave' && grave && (
              <GraveCard grave={grave} list={s.details.get(card.i)} me={s.me} onVote={vote} onClose={closeCard} />
            )}
            {card.kind === 'carve' && <CarveCard me={s.me} step={carveStep} onCarve={carve} />}
            {card.kind === 'crossed' && <CrossedCard me={s.me} day={s.day} onClose={closeCard} />}
            {card.kind === 'spent' && <SpentCard day={s.day} onClose={closeCard} />}
          </div>
        )}
        {s.toast && <div className="toast" role="status">{s.toast}</div>}
      </Stage>
      <footer className="hint" aria-live="polite">{s.status === 'loading' ? 'Lighting the lantern…' : hint}</footer>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
