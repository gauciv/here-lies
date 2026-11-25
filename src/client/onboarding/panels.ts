// The comic's panels: tiny pixel scenes drawn live from the game's own art
// (0x72's CC0 tiles, the hand-pixelled slab, arrow, ghost and digits).
import atlasUrl from '../assets/dungeon.png';
import { FRAMES, HERO_IDLE, HERO_RUN, type FrameName } from '../engine/atlas';
import { C, type ColorKey } from '../engine/palette';
import { getSprites } from '../engine/sprites';

export const PANEL_W = 112;
export const PANEL_H = 56;
const T = 16;

let atlas: HTMLImageElement | null = null;
export const loadAtlas = (): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (atlas?.complete) { resolve(atlas); return; }
    const img = new Image();
    img.onload = () => { atlas = img; resolve(img); };
    img.onerror = () => reject(new Error('atlas failed to load'));
    img.src = atlasUrl;
  });

type Draw = (x: CanvasRenderingContext2D, img: HTMLImageElement, t: number) => void;

const tile = (x: CanvasRenderingContext2D, img: HTMLImageElement, name: FrameName, dx: number, dy: number, flip = false) => {
  const [sx, sy, w, h] = FRAMES[name];
  if (!flip) { x.drawImage(img, sx, sy, w, h, dx, dy, w, h); return; }
  x.save();
  x.translate(dx + w, dy);
  x.scale(-1, 1);
  x.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  x.restore();
};

const px = (x: CanvasRenderingContext2D, c: ColorKey, dx: number, dy: number, w = 1, h = 1) => {
  x.fillStyle = C[c];
  x.fillRect(Math.round(dx), Math.round(dy), w, h);
};

const floor = (x: CanvasRenderingContext2D, img: HTMLImageElement, fromRow = 0) => {
  for (let r = fromRow; r < 4; r++) for (let c = 0; c < 7; c++) tile(x, img, (c + r) % 3 ? 'floor_1' : 'floor_2', c * T, r * T - 8);
};

/** a pool of light: everything outside it falls away to black */
const light = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, tint = 'rgba(255, 170, 80, 0.10)') => {
  const g = x.createRadialGradient(cx, cy, r * 0.35, cx, cy, r * 1.25);
  g.addColorStop(0, tint);
  g.addColorStop(1, 'rgba(4, 4, 8, 0.85)');
  x.fillStyle = g;
  x.fillRect(0, 0, PANEL_W, PANEL_H);
};

const flame = (x: CanvasRenderingContext2D, fx: number, fy: number, t: number) => {
  const lean = Math.floor(t * 9) % 2 ? 1 : -1;
  px(x, 'warm4', fx - 1, fy - 2, 3, 3);
  px(x, 'warm5', fx, fy - 3, 1, 4);
  px(x, 'warm6', fx, fy - 1, 1, 2);
  px(x, 'warm4', fx + lean, fy - 4);
};

/** 1. Every day, the dungeon grows a new room. */
const room: Draw = (x, img, t) => {
  for (let c = 0; c < 7; c++) { tile(x, img, 'wall_top_mid', c * T, -10); tile(x, img, 'wall_mid', c * T, 6); }
  tile(x, img, 'doors_leaf_closed', 40, -10);
  tile(x, img, 'doors_frame_left', 24, -10);
  tile(x, img, 'doors_frame_right', 72, -10);
  for (let r = 1; r < 4; r++) for (let c = 0; c < 7; c++) tile(x, img, (c * 3 + r) % 4 ? 'floor_1' : 'floor_3', c * T, r * T + 6);
  light(x, 56, 16, 46 + Math.sin(t * 2) * 3, 'rgba(200, 60, 40, 0.12)');
};

/** 2. Its floor hides pits. */
const fall: Draw = (x, img, t) => {
  floor(x, img);
  tile(x, img, 'hole', 48, 32);
  // the dwarf drops into the hole, again and again
  const k = (t % 2.2) / 2.2;
  const sink = Math.min(1, k * 1.6);
  x.save();
  x.beginPath();
  x.rect(0, 0, PANEL_W, 44);
  x.clip();
  tile(x, img, HERO_RUN[Math.floor(t * 10) % 4] ?? 'floor_1', 48, 16 + sink * 26);
  x.restore();
  if (k > 0.5) for (let n = 0; n < 6; n++) px(x, 'pst3', 50 + n * 2 + Math.sin(n + t * 8) * 2, 40 - (k - 0.5) * 12 * ((n % 3) + 1));
  light(x, 56, 36, 44);
};

/** 3. The fallen carve arrows, to warn you or to fool you. */
const carve: Draw = (x, img, t) => {
  floor(x, img);
  const sp = getSprites();
  x.drawImage(sp.slab.canvas, 34, 30);
  // the arrow flickers between a warning and a lie
  const lie = Math.floor(t / 1.1) % 2 === 1;
  x.drawImage(sp.arrow(lie ? 6 : 2, lie ? 'red2' : 'warm4').canvas, 36, 32);
  const ghost = sp.ghost[Math.floor(t * 2.5) % 2]!;
  x.save();
  x.globalAlpha = 0.85;
  x.drawImage(ghost.canvas, 58, 14 + Math.round(Math.sin(t * 2.2) * 2));
  x.restore();
  light(x, 52, 32, 42, 'rgba(120, 170, 255, 0.12)');
};

/** 4. Cross the dark. Trust the numbers. Doubt the dead. */
const cross: Draw = (x, img, t) => {
  floor(x, img);
  const sp = getSprites();
  for (const [n, cx, cy] of [[1, 30, 30], [2, 76, 14], [1, 78, 38]] as const) {
    x.drawImage(sp.digit(n, 'ink').canvas, cx + 1, cy + 1);
    x.drawImage(sp.digit(n, n === 2 ? 'warm4' : 'bone3').canvas, cx, cy);
  }
  tile(x, img, HERO_IDLE[Math.floor(t * 7) % 4] ?? 'floor_1', 46, 12);
  // torch held out, flame dancing
  px(x, 'ink', 61, 20, 3, 10);
  px(x, 'warm2', 62, 21, 1, 8);
  flame(x, 62, 19, t);
  light(x, 60, 24, 40 + Math.sin(t * 9) * 1.5);
};

export const PANELS: readonly { draw: Draw; caption: string; sfx?: { text: string; tone: 'red' | 'gold' | 'blue' } }[] = [
  { draw: room, caption: 'Every day, the dungeon grows a new room.', sfx: { text: 'RMMBL…', tone: 'red' } },
  { draw: fall, caption: 'Its floor hides pits.', sfx: { text: 'AAAH!', tone: 'red' } },
  { draw: carve, caption: 'The fallen carve arrows, to warn you… or to fool you.', sfx: { text: 'SKRITCH', tone: 'blue' } },
  { draw: cross, caption: 'Cross the dark. Trust the numbers. Doubt the dead.', sfx: { text: 'FWOOSH', tone: 'gold' } },
];
