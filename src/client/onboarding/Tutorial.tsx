import { useEffect, useMemo, useRef, useState } from 'react';
import { COLS, ROWS, START, idx, type Board, type Cell } from '../../shared/board';
import type { GraveView, Phase, SceneState } from '../engine/scene';
import { sound } from '../engine/sound';
import { Stage } from '../game/Stage';

/**
 * A practice room, the same for everyone: a pit up and to the right of the
 * second stone, a slab on that stone pointing at it, and the door straight ahead.
 */
const PRACTICE: Board = (() => {
  const pits = new Array<boolean>(COLS * ROWS).fill(false);
  for (const [c, r] of [[4, 5], [2, 3], [5, 2], [1, 1]] as const) pits[idx(c, r)] = true;
  return {
    day: 0, cols: COLS, rows: ROWS, pits, walls: pits.map(() => false),
    name: 'Practice', tip: '', start: START, door: { c: 3, r: 0 },
  };
})();

const SLAB_AT = { c: 3, r: 6 };
const TO_DOOR: readonly Cell[] = [{ c: 3, r: 5 }, { c: 3, r: 4 }, { c: 3, r: 3 }, { c: 3, r: 2 }, { c: 3, r: 1 }, { c: 3, r: 0 }];

/** One line at a time. A step either waits for a tap on its stone, or for 'Next'. */
const STEPS: readonly { text: string; tap?: Cell; walk?: boolean; done?: boolean }[] = [
  // up and to the left first: straight ahead, his head and torch would hide the pointer
  { text: 'Tap the glowing stone to step.', tap: { c: 2, r: 7 } },
  { text: 'No number: no pits around it. Step again.', tap: SLAB_AT },
  { text: 'A 1 means one pit touches this stone.' },
  { text: 'A slab! Someone fell from here. Its arrow points at their pit…' },
  { text: '…or lies. Trust the numbers first.' },
  { text: 'Now find the door in the far wall.', walk: true },
  { text: 'Three candles a day. Good luck in the dark.', done: true },
];

/**
 * The tutorial: a minute on a practice room, explaining one thing at a time
 * for people who won't read a page of rules. Skippable and replayable.
 */
export const Tutorial = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(0);
  const [player, setPlayer] = useState<Cell>(START);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set([idx(START.c, START.r)]));
  const [phase, setPhase] = useState<Phase>('walking');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const current = STEPS[step]!;

  const moveTo = (cell: Cell) => {
    setPlayer(cell);
    setRevealed((prev) => new Set([...prev, idx(cell.c, cell.r)]));
    sound.play('step');
  };

  const advance = () => {
    const next = step + 1;
    const s = STEPS[next];
    if (!s) { onDone(); return; }
    setStep(next);
    if (s.walk) {
      // he walks the rest of the way himself, so the lesson stays short
      TO_DOOR.forEach((cell, k) => {
        timers.current.push(window.setTimeout(() => {
          moveTo(cell);
          if (k === TO_DOOR.length - 1) { setPhase('crossing'); sound.play('door'); setStep(next + 1); }
        }, 700 + k * 330));
      });
    }
  };

  const scene = useMemo<SceneState>(() => {
    const graves = new Map<number, GraveView>([[idx(SLAB_AT.c, SLAB_AT.r), { arrow: 1, falls: 1, mine: false, truth: null, wear: 0 }]]);
    return {
      board: PRACTICE, revealed, player, graves, phase,
      revealAll: false, lifted: false, ownPits: new Set(), ghost: false, carvePreview: null,
      fading: false, soulLeaving: false, exiting: false,
      hint: current.tap ?? null,
    };
  }, [revealed, player, phase, current.tap]);

  const tap = (cell: Cell) => {
    const want = current.tap;
    if (!want) return;
    if (cell.c === want.c && cell.r === want.r) { moveTo(cell); advance(); }
    else sound.play('deny');
  };

  return (
    <div className="tutorial" role="dialog" aria-modal="true" aria-label="How to play">
      <header className="tutorial-bar">
        <span className="tutorial-title">Practice</span>
        <span className="tutorial-count">{Math.min(step + 1, STEPS.length)} / {STEPS.length}</span>
        <button className="tutorial-skip" onClick={onDone}>Skip</button>
      </header>
      <Stage scene={scene} onTap={tap} onFallDone={() => undefined} onCrossDone={() => undefined} />
      <footer className="tutorial-coach" aria-live="polite">
        <p className="tutorial-text">{current.text}</p>
        {!current.tap && !current.walk && (
          <button className="btn btn-share" onClick={current.done ? onDone : advance}>{current.done ? 'Enter the dungeon' : 'Next'}</button>
        )}
      </footer>
    </div>
  );
};
