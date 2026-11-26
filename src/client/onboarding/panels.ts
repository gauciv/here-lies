// The comic's panels: the story of Brom and his lost brother Kett, told in tiny
// pixel scenes drawn live from the game's own art (0x72's CC0 tiles and dwarf,
// Idylwild's CC0 campfire, the hand-pixelled slab, arrow and ghost).
import atlasUrl from '../assets/dungeon.png';
import campfireUrl from '../assets/campfire.png';
import { FRAMES, HERO_IDLE, HERO_RUN, type FrameName } from '../engine/atlas';
import { C, type ColorKey } from '../engine/palette';
import { getSprites } from '../engine/sprites';

export const PANEL_W = 112;
export const PANEL_H = 56;
const T = 16;

const load = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });

let atlas: HTMLImageElement | null = null;
let fire: HTMLImageElement | null = null;
/** the tiles (returned) and the campfire (kept for the panels that need it) */
export const loadAtlas = async (): Promise<HTMLImageElement> => {
  if (!atlas || !fire) [atlas, fire] = await Promise.all([load(atlasUrl), load(campfireUrl)]);
  return atlas;
};
const FIRE_W = 26;
const FIRE_H = 37;

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

/** the floor on a whole-tile grid, so everything placed on it lines up with its stones */
const floor = (x: CanvasRenderingContext2D, img: HTMLImageElement, fromRow = 0) => {
  for (let r = fromRow; r < 4; r++) for (let c = 0; c < 7; c++) tile(x, img, (c + r) % 3 ? 'floor_1' : 'floor_2', c * T, r * T);
};
/** where things sit on a stone, exactly as the game places them */
const at = (c: number, r: number) => ({ x: c * T, y: r * T });
/** the dwarf standing on a stone: his 16x28 sprite's feet on its lower edge */
const standing = (c: number, r: number) => ({ x: c * T, y: r * T + 14 - 27 });

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

/** Kett: the same dwarf, his hair and cloak a cold blue-grey so the brothers can be told apart. */
const kett = (x: CanvasRenderingContext2D, img: HTMLImageElement, name: FrameName, dx: number, dy: number, flip = false) => {
  x.save();
  x.filter = 'hue-rotate(185deg) saturate(0.55) brightness(1.05)';
  tile(x, img, name, dx, dy, flip);
  x.restore();
};

const campfire = (x: CanvasRenderingContext2D, cx: number, base: number, t: number) => {
  if (!fire) return;
  const f = Math.floor(t * 7) % 4;
  x.drawImage(fire, f * FIRE_W, 0, FIRE_W, FIRE_H, cx - FIRE_W / 2, base - FIRE_H + 6, FIRE_W, FIRE_H);
};

const embers = (x: CanvasRenderingContext2D, cx: number, base: number, t: number) => {
  for (let k = 0; k < 5; k++) {
    const q = (t * 0.5 + k * 0.21) % 1;
    px(x, q < 0.5 ? 'warm5' : 'warm3', cx + Math.sin(t * 2 + k * 1.7) * 4, base - 12 - q * 26);
  }
};

/** 1. Brom and his brother Kett kept the last fire before the Deep. */
const fireside: Draw = (x, img, t) => {
  floor(x, img);
  campfire(x, 56, 46, t);
  const brom = standing(1, 2), k = standing(4, 2);
  tile(x, img, HERO_IDLE[Math.floor(t * 4) % 4] ?? 'floor_1', brom.x + 10, brom.y);
  kett(x, img, HERO_IDLE[(Math.floor(t * 4) + 2) % 4] ?? 'floor_1', k.x + 6, k.y, true);
  embers(x, 56, 46, t);
  light(x, 56, 34, 46 + Math.sin(t * 8) * 1.5);
};

/** 2. One night, Kett took a torch and went through the door. */
const door: Draw = (x, img, t) => {
  for (let c = 0; c < 7; c++) { tile(x, img, 'wall_top_mid', c * T, -10); tile(x, img, 'wall_mid', c * T, 6); }
  // the open door, nothing but black beyond it
  px(x, 'void0', 43, -7, 26, 27);
  tile(x, img, 'doors_leaf_open', 40, -10);
  tile(x, img, 'doors_frame_left', 24, -10);
  tile(x, img, 'doors_frame_right', 72, -10);
  for (let r = 1; r < 4; r++) for (let c = 0; c < 7; c++) tile(x, img, (c * 3 + r) % 4 ? 'floor_1' : 'floor_3', c * T, r * T + 6);
  // Kett walks up into the dark, and the doorway swallows him
  const k = (t % 3) / 3;
  const ky = 34 - k * 26;
  x.save();
  x.beginPath();
  x.rect(0, 12, PANEL_W, PANEL_H);
  x.clip();
  kett(x, img, HERO_RUN[Math.floor(t * 8) % 4] ?? 'floor_1', 48, ky);
  x.restore();
  if (ky > 6) {
    px(x, 'ink', 62, ky + 7, 3, 10);
    px(x, 'warm2', 63, ky + 8, 1, 8);
    flame(x, 63, ky + 6, t);
  }
  light(x, 62, ky + 10, 34);
};

/** 3. He never came back. Only a slab, with an arrow carved in it. */
const slab: Draw = (x, img, t) => {
  floor(x, img);
  const sp = getSprites();
  const stone = at(3, 1);
  x.drawImage(sp.slab.canvas, stone.x + 2, stone.y + 2);
  x.drawImage(sp.arrow(1, 'pst1').canvas, stone.x + 4, stone.y + 4);
  // a faint, cold light on it, as if something still watched over it
  light(x, stone.x + 8, stone.y + 8, 22 + Math.sin(t * 1.3) * 1.5, 'rgba(120, 160, 230, 0.10)');
};

/** 4. Every day the Deep grows a new room. The fallen carve arrows: some true, some lies. */
const lies: Draw = (x, img, t) => {
  floor(x, img);
  const sp = getSprites();
  const slabs = [[1, 1, 2], [3, 2, 6], [5, 1, 4]] as const;
  slabs.forEach(([c, r, dir], n) => {
    const stone = at(c, r);
    x.drawImage(sp.slab.canvas, stone.x + 2, stone.y + 2);
    const lie = (Math.floor(t / 0.9) + n) % 2 === 1;
    x.drawImage(sp.arrow(dir, lie ? 'red2' : 'warm4').canvas, stone.x + 4, stone.y + 4);
  });
  const g = sp.ghost[Math.floor(t * 2.5) % 2]!;
  x.save();
  x.globalAlpha = 0.6;
  x.drawImage(g.canvas, 30 + Math.sin(t * 0.7) * 10, 6 + Math.sin(t * 2) * 2);
  x.drawImage(g.canvas, 78 + Math.sin(t * 0.9 + 2) * 8, 24 + Math.sin(t * 2.3) * 2);
  x.restore();
  light(x, 56, 28, 48, 'rgba(120, 170, 255, 0.10)');
};

/** 5. Brom lights his torch. One room a day, he'll find Kett. */
const vow: Draw = (x, img, t) => {
  for (let c = 0; c < 7; c++) { tile(x, img, 'wall_top_mid', c * T, -10); tile(x, img, 'wall_mid', c * T, 6); }
  tile(x, img, 'doors_leaf_closed', 40, -10);
  tile(x, img, 'doors_frame_left', 24, -10);
  tile(x, img, 'doors_frame_right', 72, -10);
  for (let r = 1; r < 4; r++) for (let c = 0; c < 7; c++) tile(x, img, (c * 3 + r) % 4 ? 'floor_1' : 'floor_3', c * T, r * T + 6);
  const brom = { x: 48, y: 26 };
  tile(x, img, HERO_IDLE[Math.floor(t * 6) % 4] ?? 'floor_1', brom.x, brom.y);
  // the torch held high: it caught only a moment ago
  px(x, 'ink', brom.x + 13, brom.y + 4, 3, 12);
  px(x, 'warm2', brom.x + 14, brom.y + 5, 1, 10);
  flame(x, brom.x + 14, brom.y + 3, t);
  light(x, brom.x + 12, brom.y + 8, 40 + Math.sin(t * 9) * 1.5);
};

export const PANELS: readonly { draw: Draw; caption: string; sfx?: { text: string; tone: 'red' | 'gold' | 'blue' } }[] = [
  { draw: fireside, caption: 'Brom and his brother Kett kept the last fire before the Deep.', sfx: { text: 'crackle', tone: 'gold' } },
  { draw: door, caption: 'One night, Kett took a torch and went through the door.', sfx: { text: 'CREAK', tone: 'red' } },
  { draw: slab, caption: 'He never came back. Only a slab, with an arrow carved in it.', sfx: { text: '…', tone: 'blue' } },
  { draw: lies, caption: 'Every day the Deep grows a new room. The fallen carve arrows: some true, some lies.', sfx: { text: 'SKRITCH', tone: 'blue' } },
  { draw: vow, caption: 'Brom lights his torch. One room a day, he will find Kett.', sfx: { text: 'FWOOSH', tone: 'gold' } },
];
