import { useEffect, useRef } from 'react';
import { COLS, ROWS, generateBoard, idx, isOpen } from '../../shared/board';
import { DIRECTIONS, arrowIsTrue } from '../../shared/epitaphs';
import type { GraveDto } from '../../shared/api';
import { RUN_DASHES } from './runStyles';

const CELL = 30;
const PAD = 12;
/** the map's size at zoom 1, in CSS pixels */
export const MAP_W = COLS * CELL + PAD * 2;
export const MAP_H = ROWS * CELL + PAD * 2 + 14;
const W = MAP_W;
const H = MAP_H;
const INK = 'rgba(58, 32, 16, 0.88)';
const RED = '#a3271a';
const GOLD = '#b0791a';

const hash = (a: number, b: number): number => {
  let h = Math.imul(a + 0x9e37, 374761393) ^ Math.imul(b + 0x85eb, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * A rough ink sketch of the room, as a dwarf might scrawl it: the walls and the
 * rock, a red X where the door is, "you" at the entrance, your own runs as inked
 * trails (one line style each) and a skull wherever you died. For a finished
 * day it can also show the full answer: every pit and every arrow's verdict.
 */
export const RoomMap = ({ day, runs = [], deaths = [], answer = null, zoom = 1 }: {
  day: number;
  /** the player's own runs, stone indices from the entrance */
  runs?: readonly (readonly number[])[];
  /** pits the player fell into */
  deaths?: readonly number[];
  /** a finished day's full answer: its slabs (every pit is drawn too) */
  answer?: readonly GraveDto[] | null;
  zoom?: number;
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // drawn at the size it's shown (zoomed or not), so the ink stays sharp
    const dpr = Math.min(3, window.devicePixelRatio || 1) * zoom;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const board = generateBoard(day);
    let seed = day * 31;
    const j = (amp: number) => (hash(seed++, day) - 0.5) * amp;
    const X = (c: number) => PAD + c * CELL;
    const Y = (r: number) => PAD + 8 + r * CELL;

    /** a shaky hand-drawn stroke, drawn twice for an inky edge */
    const stroke = (x1: number, y1: number, x2: number, y2: number, width = 1.6, color = INK) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.moveTo(x1 + j(1.6), y1 + j(1.6));
        const mx = (x1 + x2) / 2 + j(2.2), my = (y1 + y2) / 2 + j(2.2);
        ctx.quadraticCurveTo(mx, my, x2 + j(1.6), y2 + j(1.6));
        ctx.stroke();
        ctx.lineWidth = width * 0.5;
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // the room's outline: every edge between floor and rock (or the room's end)
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          if (!isOpen(board, c, r)) continue;
          if (!isOpen(board, c, r - 1)) stroke(X(c), Y(r), X(c + 1), Y(r), r === 0 ? 2.4 : 1.6);
          if (!isOpen(board, c, r + 1) && !(r === ROWS - 1 && c === board.start.c)) stroke(X(c), Y(r + 1), X(c + 1), Y(r + 1));
          if (!isOpen(board, c - 1, r)) stroke(X(c), Y(r), X(c), Y(r + 1));
          if (!isOpen(board, c + 1, r)) stroke(X(c + 1), Y(r), X(c + 1), Y(r + 1));
        }
      // solid rock, hatched
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          if (!board.walls[idx(c, r)]) continue;
          for (let k = 0; k < 3; k++) {
            const o = 4 + k * 5;
            stroke(X(c) + o, Y(r) + 3, X(c) + o - 4, Y(r) + CELL - 3, 1);
          }
        }
      // the stairs you come up, and you
      const sx = X(board.start.c), sy = Y(ROWS);
      for (let k = 0; k < 3; k++) stroke(sx + 3, sy + 2 + k * 3, sx + CELL - 3, sy + 2 + k * 3, 1);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(sx + CELL / 2, Y(ROWS - 1) + CELL / 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (zoom >= 0.6) {
        ctx.font = '700 15px Caveat, cursive';
        ctx.textBaseline = 'middle';
        ctx.fillText('you', sx + CELL + 3, Y(ROWS - 1) + CELL / 2 + 1);
      }
      const mid = (i: number) => ({ x: X(i % COLS) + CELL / 2, y: Y(Math.floor(i / COLS)) + CELL / 2 });
      // a finished day's answer: every pit inked as a hole
      if (answer) {
        board.pits.forEach((isPit, i) => {
          if (!isPit) return;
          const { x, y } = mid(i);
          ctx.fillStyle = 'rgba(58, 32, 16, 0.55)';
          ctx.beginPath();
          ctx.ellipse(x, y + 1, 7.5, 5.5, 0, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      // your runs, each in its own line, from the entrance to wherever it ended
      runs.forEach((run, k) => {
        ctx.save();
        ctx.setLineDash([...(RUN_DASHES[k % RUN_DASHES.length] ?? [])]);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.7;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        run.forEach((i, n) => {
          const { x, y } = mid(i);
          const wx = x + (hash(k * 97 + n, day) - 0.5) * 5, wy = y + (hash(n, k * 53 + day) - 0.5) * 5;
          if (n === 0) ctx.moveTo(x, Y(ROWS) + 2); // from the entrance steps
          ctx.lineTo(wx, wy);
        });
        ctx.stroke();
        ctx.restore();
      });
      // a skull wherever you died
      for (const g of new Set(deaths)) {
        const { x: cx, y: cy } = mid(g);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(cx + j(0.8), cy - 1, 4.6, 4.1, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.fillRect(cx - 2.6, cy - 2, 1.8, 1.8);
        ctx.fillRect(cx + 0.9, cy - 2, 1.8, 1.8);
        stroke(cx - 2, cy + 3.5, cx + 2, cy + 3.5, 1);
        stroke(cx - 0.8, cy + 2.6, cx - 0.8, cy + 4.6, 0.8);
        stroke(cx + 0.8, cy + 2.6, cx + 0.8, cy + 4.6, 0.8);
      }
      // a finished day's arrows, gold for the truth and red for a lie
      if (answer) {
        for (const g of answer) {
          if (!g.top) continue;
          const { x, y } = mid(g.i);
          const v = DIRECTIONS[g.top.arrow] ?? DIRECTIONS[0]!;
          const len = Math.hypot(v.dc, v.dr);
          const ux = v.dc / len, uy = v.dr / len;
          const col = arrowIsTrue(board, g.i, g.top.arrow) ? GOLD : RED;
          const tx = x + ux * 9, ty = y + uy * 9;
          stroke(x - ux * 7, y - uy * 7, tx, ty, 2, col);
          stroke(tx, ty, tx - ux * 5 - uy * 4, ty - uy * 5 + ux * 4, 2, col);
          stroke(tx, ty, tx - ux * 5 + uy * 4, ty - uy * 5 - ux * 4, 2, col);
        }
      }
      // X marks the door
      const dx = X(board.door.c) + CELL / 2, dy = Y(0);
      stroke(dx - 6, dy - 6, dx + 6, dy + 6, 2.6, RED);
      stroke(dx + 6, dy - 6, dx - 6, dy + 6, 2.6, RED);
    };

    let alive = true;
    // the label needs the handwriting font; draw now, and again once it's in
    draw();
    void document.fonts?.load('700 15px Caveat').then(() => { if (alive) { seed = day * 31; draw(); } });
    return () => { alive = false; };
  }, [day, runs, deaths, answer, zoom]);

  return (
    <canvas
      ref={ref}
      className="room-map"
      style={{ width: Math.round(W * zoom), height: Math.round(H * zoom) }}
      role="img"
      aria-label={answer
        ? 'The finished room revealed: every pit, and every arrow marked gold for the truth or red for a lie.'
        : 'A rough map of the room: the walls, a red X where the door is, your runs as inked trails and a skull where you died.'}
    />
  );
};
