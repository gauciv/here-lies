import { useEffect, useRef } from 'react';
import { COLS, ROWS, generateBoard, idx, isOpen } from '../../shared/board';

const CELL = 30;
const PAD = 12;
/** the map's size at zoom 1, in CSS pixels */
export const MAP_W = COLS * CELL + PAD * 2;
export const MAP_H = ROWS * CELL + PAD * 2 + 14;
const W = MAP_W;
const H = MAP_H;
const INK = 'rgba(58, 32, 16, 0.88)';
const RED = '#a3271a';

const hash = (a: number, b: number): number => {
  let h = Math.imul(a + 0x9e37, 374761393) ^ Math.imul(b + 0x85eb, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** About one grave in seven makes it onto the map (at least one), the same ones every opening. */
const mappedGraves = (day: number, graves: readonly number[]): number[] => {
  if (!graves.length) return [];
  const keep = Math.max(1, Math.ceil(graves.length / 7));
  return [...graves].sort((a, b) => hash(day, a) - hash(day, b)).slice(0, keep);
};

/**
 * A rough ink sketch of today's room, as a dwarf might scrawl it: the walls and
 * the rock, a red X where the door is, a few skulls where others died, and
 * "you" at the stairs. No grid, no numbers, no arrows, no paths.
 */
export const RoomMap = ({ day, graves, zoom = 1 }: { day: number; graves: readonly number[]; zoom?: number }) => {
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
      ctx.font = '700 15px Caveat, cursive';
      ctx.textBaseline = 'middle';
      ctx.fillText('you', sx + CELL + 3, Y(ROWS - 1) + CELL / 2 + 1);
      // skulls where some have died
      for (const g of mappedGraves(day, graves)) {
        const cx = X(g % COLS) + CELL / 2, cy = Y(Math.floor(g / COLS)) + CELL / 2;
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
  }, [day, graves, zoom]);

  return (
    <canvas
      ref={ref}
      className="room-map"
      style={{ width: Math.round(W * zoom), height: Math.round(H * zoom) }}
      role="img"
      aria-label="A rough map of today's room: the walls, a red X where the door is, a few skulls where others died, and you at the stairs."
    />
  );
};
