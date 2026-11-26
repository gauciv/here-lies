import { useEffect, useMemo, useRef, useState } from 'react';
import { COLS, ROWS, START, idx, type Board, type Cell } from '../../shared/board';
import { directionBetween, type Direction } from '../../shared/epitaphs';
import type { MeDto } from '../../shared/api';
import type { GraveView, Phase, SceneState } from '../engine/scene';
import { sound } from '../engine/sound';
import { CarveCard } from '../game/Cards';
import { Stage } from '../game/Stage';

/**
 * The practice room, the same for everyone. Pits at (1,5), (4,5) and (4,3); a
 * slab on (3,4) whose arrow points truthfully at (4,3); the door straight ahead.
 */
const PITS: readonly (readonly [number, number])[] = [[1, 5], [4, 5], [4, 3]];
const PRACTICE: Board = (() => {
  const pits = new Array<boolean>(COLS * ROWS).fill(false);
  for (const [c, r] of PITS) pits[idx(c, r)] = true;
  return { day: 0, cols: COLS, rows: ROWS, pits, walls: pits.map(() => false), name: 'Practice', tip: '', start: START, door: { c: 3, r: 0 } };
})();

const SLAB: Cell = { c: 3, r: 4 };
const NUMBER: Cell = { c: 2, r: 6 };
const LEDGE: Cell = { c: 3, r: 5 }; // the stone you fall from
const PIT: Cell = { c: 4, r: 5 };
const TO_DOOR: readonly Cell[] = [{ c: 2, r: 7 }, { c: 2, r: 6 }, { c: 3, r: 5 }, { c: 3, r: 4 }, { c: 3, r: 3 }, { c: 3, r: 2 }, { c: 3, r: 1 }, { c: 3, r: 0 }];

type Step = {
  text: string;
  /** wait for a tap on this stone */
  tap?: Cell;
  /** point at this stone while the line is read */
  show?: Cell;
  /** what happens on 'Next' (or after the tap) */
  kind?: 'fall' | 'carve' | 'respawn' | 'walk' | 'done';
  button?: string;
};

/** One idea per line, in the order you'll meet them in the dungeon. */
const STEPS: readonly Step[] = [
  { text: 'Tap the glowing stone to step.', tap: { c: 2, r: 7 } },
  { text: 'No number here: none of the stones around it is a pit.' },
  { text: 'Step again.', tap: NUMBER },
  { text: 'And once more.', tap: LEDGE },
  { text: 'See the 1 behind you? One of the stones around it is a pit.', show: NUMBER },
  { text: 'Numbers never lie. Use them to find the safe stones.', show: NUMBER },
  { text: 'A slab! Someone fell from this stone. Its arrow points at the pit that took them…', show: SLAB },
  { text: '…or it lies. Anyone can carve a lie.', show: SLAB },
  { text: 'Every fall burns one of your 3 candles. Step here and see.', tap: PIT, kind: 'fall' },
  { text: 'You fell. Carve an arrow for the next walker.', kind: 'carve' },
  { text: 'Whatever you chose, it stays here for the next walker. Carving is always up to you.', kind: 'respawn', button: 'Respawn' },
  { text: 'Back at the entrance. Now find the door in the far wall.', kind: 'walk' },
  { text: 'Three candles a day, one door. Good luck in the dark.', kind: 'done', button: 'Enter the dungeon' },
];

/** a stand-in for the player while practising, so the game's own carve card can be shown */
const PRACTICE_ME: MeDto = {
  username: 'you', candles: 2, crossed: false, rank: null, steps: null, revealed: [], uncarved: idx(3, 5),
  uncarvedSkippable: true, uncarvedQueued: false, fellInto: [idx(4, 5)], runs: [], streak: 0, bestStreak: 0,
  shared: false, startedAt: null, endedAt: null, time: null, standing: null, myArrow: null,
};

/**
 * The tutorial: a practice room that shows everything you need, one line at a
 * time, for people who won't read a page of rules. Skippable and replayable.
 */
export const Tutorial = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(0);
  const [player, setPlayer] = useState<Cell>(START);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set([idx(START.c, START.r)]));
  const [phase, setPhase] = useState<Phase>('walking');
  const [ghost, setGhost] = useState(false);
  const [fading, setFading] = useState(false);
  const [aim, setAim] = useState<Direction | null>(null);
  const [carved, setCarved] = useState<Direction | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const current = STEPS[step]!;
  const fellToward = directionBetween(LEDGE, PIT);

  const moveTo = (cell: Cell) => {
    setPlayer(cell);
    if (!PRACTICE.pits[idx(cell.c, cell.r)]) setRevealed((prev) => new Set([...prev, idx(cell.c, cell.r)]));
    sound.play('step');
  };

  const go = (n: number) => {
    const s = STEPS[n];
    if (!s) { onDone(); return; }
    setStep(n);
    if (s.kind === 'walk') {
      // he walks the rest of the way himself, so the lesson stays short
      TO_DOOR.forEach((cell, k) => later(600 + k * 300, () => {
        moveTo(cell);
        if (k === TO_DOOR.length - 1) { setPhase('crossing'); sound.play('door'); later(700, () => go(n + 1)); }
      }));
    }
  };

  const tap = (cell: Cell) => {
    const want = current.tap;
    if (!want) return;
    if (cell.c !== want.c || cell.r !== want.r) { sound.play('deny'); return; }
    if (current.kind === 'fall') {
      setPlayer(cell);
      setPhase('falling');
      sound.play('fall');
      return; // the fall animation finishes in onFallDone
    }
    moveTo(cell);
    go(step + 1);
  };

  const onFallDone = () => {
    if (current.kind !== 'fall') return;
    setPhase('fallen');
    setGhost(true);
    go(step + 1);
  };

  const carve = (d: Direction) => {
    sound.play('carve');
    setCarved(d);
    go(step + 1); // the ghost stays, lighting its new slab, until you respawn
  };

  const respawn = () => {
    setFading(true);
    later(480, () => {
      setGhost(false);
      setPlayer(START);
      setPhase('walking');
      setFading(false);
      sound.play('revive');
      go(step + 1);
    });
  };

  const scene = useMemo<SceneState>(() => {
    const graves = new Map<number, GraveView>([[idx(SLAB.c, SLAB.r), { arrow: 1, falls: 1, mine: false, truth: null, wear: 0 }]]);
    if (carved !== null) graves.set(idx(LEDGE.c, LEDGE.r), { arrow: carved, falls: 1, mine: true, truth: null, wear: 0 });
    const carving = current.kind === 'carve';
    return {
      board: PRACTICE, revealed, player, graves, phase,
      revealAll: false, lifted: false, ownPits: new Set(), ghost: ghost || carving,
      carvePreview: carving ? { stone: idx(LEDGE.c, LEDGE.r), dir: aim } : null,
      fading, soulLeaving: false, exiting: false,
      hint: current.tap ?? current.show ?? null,
      hintTap: !!current.tap,
    };
  }, [revealed, player, phase, ghost, fading, aim, carved, current]);

  const nextAction = current.kind === 'respawn' ? respawn : current.kind === 'done' ? onDone : () => go(step + 1);
  const showButton = !current.tap && current.kind !== 'walk' && current.kind !== 'carve';

  return (
    <div className="tutorial" role="dialog" aria-modal="true" aria-label="How to play">
      <header className="tutorial-bar">
        <span className="tutorial-title">Practice</span>
        <span className="tutorial-count">{step + 1} / {STEPS.length}</span>
        <button className="tutorial-skip" onClick={onDone}>Skip</button>
      </header>
      <Stage scene={scene} onTap={tap} onFallDone={onFallDone} onCrossDone={() => undefined} focusRow={current.kind === 'carve' ? PIT.r : null}>
        {current.kind === 'carve' && (
          // the game's own carve card, docked over the board exactly as after a real fall
          <div className="card-layer card-layer-top">
            <CarveCard
              me={PRACTICE_ME} board={PRACTICE} stone={LEDGE} fellToward={fellToward} selected={aim}
              onSelect={(d) => { sound.play('ui'); setAim(d); }} onCarve={carve} onSkip={() => go(step + 1)}
            />
          </div>
        )}
      </Stage>
      <footer className="tutorial-coach" aria-live="polite">
        <p className="tutorial-text">{current.text}</p>
        {showButton && <button className="btn btn-share" onClick={nextAction}>{current.button ?? 'Next'}</button>}
      </footer>
    </div>
  );
};
