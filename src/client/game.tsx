import './index.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CarveCard, FellAgainCard, GameOverCard, GraveCard, IntroCard, SpentCard, VictoryCard } from './game/Cards';
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
  // back from a game over: the soul's homecoming plays before the camp shows anything
  const [reviving, setReviving] = useState<'soul' | 'return' | null>(null);
  // reaching the door: the dwarf walks out through it, celebrates in the dark camp, then walks home
  const [victoryView, setVictoryView] = useState(false);
  const [continuing, setContinuing] = useState(false);
  // game over → 'Back to camp': the soul first floats off the board to the stairs
  const [soulLeaving, setSoulLeaving] = useState(false);
  const standby = useRef<StandbyHandle>(null);
  const autoEnter = useRef(consumeAutoEnter());
  const { s, tap, onFallDone, onCrossDone, carve, selectArrow, skip, share, startRun, join, flair, walkAgain, leaveRun, openResult, startPlaying, openHelp, closeCard, hint } = useGame();

  // through the door the moment the run is won (or when 'Your result' is reopened later)
  const exiting = view === 'board' && s.phase === 'crossed' && s.card.kind === 'crossed';

  const scene = useMemo<SceneState | null>(() => {
    if (!s.board) return null;
    // the dark lifts once the run is over, but not while your ghost is still mourning itself
    // the dark lifts once the run is over, but not while your ghost mourns or your dwarf heads out
    const leavingThroughDoor = s.phase === 'crossed' && s.card.kind === 'crossed';
    const revealAll = (s.phase === 'crossed' || s.phase === 'idle') && s.card.kind !== 'gameOver' && !leavingThroughDoor;
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
    const carving = s.card.kind === 'carve' ? s.card.i : null;
    return {
      board: s.board, revealed: s.revealed, player: s.player, graves, phase: s.phase, revealAll,
      // your ghost lingers in its pit while you carve, or until you respawn
      ghost: carving !== null || s.card.kind === 'fellAgain' || s.card.kind === 'gameOver',
      carvePreview: carving !== null ? { stone: carving, dir: s.carveDir } : null,
      fading: s.fading,
      soulLeaving,
      exiting,
    };
  }, [s.board, s.revealed, s.player, s.graves, s.phase, s.card, s.carveDir, s.fading, soulLeaving, exiting]);

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
    void startRun();
    if (standby.current) standby.current.enter(() => crossFade('board'), (cue) => sound.play(cue));
    else { sound.play('door'); crossFade('board'); }
  }, [entering, crossFade, startRun]);

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

  if (view === 'camp') {
    return (
      <main className="app" onPointerDown={() => sound.setMode('camp')}>
        {reviving === null && !victoryView && <div className="camp-corner"><MuteButton /></div>}
        <Standby
          ref={standby} day={s.day} me={s.me} busy={entering || s.status !== 'ready'} onEnter={enter} onReview={() => crossFade('board')}
          revival={reviving ? { kind: reviving, onDone: () => setReviving(null), onCue: (cue) => sound.play(cue) } : undefined}
          victory={victoryView}
        />
        {victoryView && !continuing && s.me && s.card.kind === 'crossed' && (
          <div className="victory-layer">
            <VictoryCard
              me={s.me} onShare={share} onJoin={join} onFlair={flair}
              onContinue={() => {
                setContinuing(true);
                // walk on until the fire is in sight, then fade into the ordinary camp
                standby.current?.homeward(() => {
                  setFade(true);
                  window.setTimeout(() => {
                    standby.current?.settle();
                    setVictoryView(false);
                    setContinuing(false);
                    closeCard();
                    window.setTimeout(() => setFade(false), 150);
                  }, 450);
                });
              }}
            />
          </div>
        )}
        <div className={`screen-fade${fade ? ' on' : ''}`} />
      </main>
    );
  }

  return (
    <main className="app">
      {s.me ? <Hud me={s.me} day={s.day?.day ?? null} onHelp={openHelp} hidden={soulLeaving || exiting} /> : <header className="hud" />}
      <Stage
        scene={scene} onTap={tap} onFallDone={onFallDone} onCrossDone={onCrossDone}
        onExitDone={() => {
          setVictoryView(true);
          crossFade('camp');
        }}
        onSoulGone={() => {
          setReviving('soul');
          crossFade('camp');
          // only once the screen is dark: otherwise the lifted room flashes before the camp
          window.setTimeout(() => { leaveRun(); setSoulLeaving(false); }, 600);
        }}
        focusRow={card.kind === 'carve' || card.kind === 'fellAgain' || card.kind === 'gameOver' ? s.player.r : null}
      >
        {s.me && s.day && !s.fading && (
          <div className={`card-layer ${s.player.r >= 4 && s.phase !== 'crossed' && card.kind !== 'fellAgain' && card.kind !== 'gameOver' ? 'card-layer-top' : ''}`}>
            {card.kind === 'grave' && grave && s.board && (
              <GraveCard grave={grave} me={s.me} board={s.board} judged={s.phase === 'crossed' || s.phase === 'idle'} onClose={closeCard} />
            )}
            {card.kind === 'intro' && <IntroCard onStart={startPlaying} />}
            {card.kind === 'fellAgain' && <FellAgainCard me={s.me} onWalk={walkAgain} />}
            {card.kind === 'gameOver' && !soulLeaving && <GameOverCard onCamp={() => setSoulLeaving(true)} />}
            {card.kind === 'carve' && s.board && (
              <CarveCard
                me={s.me} board={s.board} stone={cellOf(card.i)} selected={s.carveDir}
                fellToward={s.me.fellInto.length ? directionBetween(cellOf(card.i), cellOf(s.me.fellInto[s.me.fellInto.length - 1]!)) : null}
                onSelect={selectArrow} onCarve={carve} onSkip={skip}
              />
            )}
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
