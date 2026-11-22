import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CarveCard, CrossedCard, FellAgainCard, GraveCard, IntroCard, SpentCard } from './game/Cards';
import { Hud, MuteButton } from './game/Hud';
import { Standby, type StandbyHandle } from './game/Standby';
import { sound } from './engine/sound';
import { Stage } from './game/Stage';
import { cellOf } from '../shared/board';
import { arrowIsTrue, directionBetween } from '../shared/epitaphs';
import { useGame } from './game/useGame';
import type { GraveView, SceneState } from './engine/scene';

const AUTO_ENTER_KEY = 'herelies:enter';

/** The feed post's "Enter the dungeon" leaves a short-lived note so the game walks straight in. */
const consumeAutoEnter = (): boolean => {
  try {
    const at = Number(window.localStorage.getItem(AUTO_ENTER_KEY) ?? 0);
    window.localStorage.removeItem(AUTO_ENTER_KEY);
    return Date.now() - at < 30_000;
  } catch {
    return false;
  }
};

export const App = () => {
  const [view, setView] = useState<'camp' | 'board'>('camp');
  const [fade, setFade] = useState(false);
  const [entering, setEntering] = useState(false);
  const standby = useRef<StandbyHandle>(null);
  const autoEnter = useRef(consumeAutoEnter());
  const { s, tap, onFallDone, onCrossDone, carve, selectArrow, skip, share, join, flair, walkAgain, openResult, startPlaying, openHelp, closeCard, hint } = useGame();

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
        wear: g.top?.visits ?? 0,
      });
    });
    const knownPits = new Set(s.me?.fellInto ?? []);
    const carving = s.card.kind === 'carve' ? s.card.i : null;
    return {
      board: s.board, revealed: s.revealed, player: s.player, graves, knownPits, phase: s.phase, revealAll,
      ghost: carving !== null,
      carvePreview: carving !== null ? { stone: carving, dir: s.carveDir } : null,
      fading: s.fading,
    };
  }, [s.board, s.revealed, s.player, s.graves, s.phase, s.me, s.card, s.carveDir, s.fading]);

  /** Fade to black, swap what's on screen, fade back in. */
  const crossFade = useCallback((to: 'camp' | 'board') => {
    setFade(true);
    window.setTimeout(() => {
      setView(to);
      sound.setMode(to === 'board' ? 'dungeon' : 'camp');
      window.setTimeout(() => { setFade(false); setEntering(false); }, 120);
    }, 420);
  }, []);

  const enter = useCallback(() => {
    if (entering) return;
    setEntering(true);
    sound.play('door');
    if (standby.current) standby.current.enter(() => crossFade('board'));
    else crossFade('board');
  }, [entering, crossFade]);

  useEffect(() => {
    if (s.status === 'ready' && autoEnter.current) {
      autoEnter.current = false;
      const finished = s.me && (s.me.crossed || s.me.candles <= 0) && s.me.uncarved === null;
      if (!finished) window.setTimeout(enter, 500);
    }
  }, [s.status, s.me, enter]);

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

  if (view === 'camp') {
    return (
      <main className="app" onPointerDown={() => sound.setMode('camp')}>
        <div className="camp-corner"><MuteButton /></div>
        <Standby ref={standby} day={s.day} me={s.me} busy={entering || s.status !== 'ready'} onEnter={enter} onReview={() => crossFade('board')} />
        <div className={`screen-fade${fade ? ' on' : ''}`} />
      </main>
    );
  }

  return (
    <main className="app">
      {s.me ? <Hud me={s.me} onHelp={openHelp} /> : <header className="hud"><h1 className="logo">Here Lies</h1></header>}
      <Stage scene={scene} onTap={tap} onFallDone={onFallDone} onCrossDone={onCrossDone}>
        {s.me && s.day && !s.fading && (
          <div className={`card-layer ${s.player.r >= 4 && s.phase !== 'crossed' ? 'card-layer-top' : ''}`}>
            {card.kind === 'grave' && grave && s.board && (
              <GraveCard grave={grave} me={s.me} board={s.board} judged={s.phase === 'crossed' || s.phase === 'idle'} onClose={closeCard} />
            )}
            {card.kind === 'intro' && <IntroCard onStart={startPlaying} />}
            {card.kind === 'fellAgain' && <FellAgainCard me={s.me} reason={card.reason} onWalk={walkAgain} />}
            {card.kind === 'carve' && (
              <CarveCard
                me={s.me} step={carveStep} stone={cellOf(card.i)} selected={s.carveDir}
                fellToward={s.me.fellInto.length ? directionBetween(cellOf(card.i), cellOf(s.me.fellInto[s.me.fellInto.length - 1]!)) : null}
                onSelect={selectArrow} onCarve={carve} onSkip={skip}
              />
            )}
            {card.kind === 'crossed' && <CrossedCard me={s.me} day={s.day} onClose={closeCard} onShare={share} onJoin={join} onFlair={flair} />}
            {card.kind === 'spent' && <SpentCard me={s.me} day={s.day} onClose={closeCard} onShare={share} onJoin={join} />}
          </div>
        )}
        {s.toast && <div className="toast" role="status">{s.toast}</div>}
      </Stage>
      <footer className="hint" aria-live="polite">
        <span>{s.status === 'loading' ? 'Lighting the torch…' : hint}</span>
        {(s.phase === 'crossed' || s.phase === 'idle') && s.card.kind === 'none' && s.me && (
          <div className="vote-row">
            <button className="btn btn-share btn-result" onClick={openResult}>Your result</button>
            <button className="btn btn-result" onClick={() => crossFade('camp')}>Back to camp</button>
          </div>
        )}
      </footer>
      <div className={`screen-fade${fade ? ' on' : ''}`} />
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
