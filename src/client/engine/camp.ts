// The standby room: a quiet corner of the dungeon where the adventurer rests by a
// fire between crossings. All art is sourced (CC0): room, props and dwarf from
// 0x72's DungeonTileset II, the campfire from Idylwild's Chromatic Campfires.
import campfireUrl from '../assets/campfire.png';
import atlasUrl from '../assets/dungeon.png';
import { FRAMES, HERO_IDLE, HERO_RUN, type FrameName } from './atlas';
import { C, type ColorKey } from './palette';

export const CAMP_W = 112;
export const CAMP_H = 96;
const T = 16;
const DOOR_C = 5;
const FIRE = { x: 40, y: 82 };
const HERO_REST = { x: 57, y: 54 };
const FIRE_W = 26;
const FIRE_H = 37;
const ENTER_MS = 1300;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const load = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });

const hash2 = (a: number, b: number): number => {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class CampScene {
  private readonly ctx: CanvasRenderingContext2D;
  private atlas: HTMLImageElement | null = null;
  private fire: HTMLImageElement | null = null;
  private raf = 0;
  private enterT0 = -1;
  private onEntered: (() => void) | null = null;
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CAMP_W;
    canvas.height = CAMP_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    void Promise.all([load(atlasUrl), load(campfireUrl)])
      .then(([a, f]) => { this.atlas = a; this.fire = f; })
      .catch((e: unknown) => console.error(e));
  }

  start(): void {
    const loop = (t: number) => { this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** The adventurer gets up, the door opens, and he walks through it. */
  enter(onDone: () => void): void {
    if (this.reduced) { onDone(); return; }
    this.enterT0 = performance.now();
    this.onEntered = onDone;
  }

  private tile(name: FrameName, x: number, y: number, flip = false): void {
    if (!this.atlas) return;
    const [sx, sy, w, h] = FRAMES[name];
    const c = this.ctx;
    if (!flip) { c.drawImage(this.atlas, sx, sy, w, h, x, y, w, h); return; }
    c.save();
    c.translate(x + w, y);
    c.scale(-1, 1);
    c.drawImage(this.atlas, sx, sy, w, h, 0, 0, w, h);
    c.restore();
  }

  private px(color: ColorKey, x: number, y: number, w = 1, h = 1): void {
    this.ctx.fillStyle = C[color];
    this.ctx.fillRect(x, y, w, h);
  }

  private frame(now: number): void {
    if (!this.atlas || !this.fire) return;
    const c = this.ctx;
    const t = now / 1000;
    const enterP = this.enterT0 >= 0 ? Math.min(1, (now - this.enterT0) / ENTER_MS) : 0;
    if (enterP >= 1 && this.onEntered) { const done = this.onEntered; this.onEntered = null; done(); }

    // room
    c.fillStyle = C.void0;
    c.fillRect(0, 0, CAMP_W, CAMP_H);
    for (let col = 0; col < 7; col++) {
      this.tile('wall_top_mid', col * T, 0);
      this.tile('wall_mid', col * T, T);
    }
    this.tile('wall_banner_green', 1 * T, T);
    const dx = DOOR_C * T - 8;
    this.tile(enterP > 0.05 ? 'doors_leaf_open' : 'doors_leaf_closed', dx, 0);
    this.tile('doors_frame_left', dx - 16, 0);
    this.tile('doors_frame_right', dx + 32, 0);
    for (let r = 2; r < 6; r++) for (let col = 0; col < 7; col++) {
      const v = hash2(col, r) < 0.65 ? 'floor_1' : (['floor_2', 'floor_3', 'floor_5', 'floor_6'] as const)[Math.floor(hash2(r, col) * 4)]!;
      this.tile(v, col * T, r * T);
    }
    // props, all from the tileset
    this.tile('crate', 0, 2 * T);
    this.tile('chest_full_open_anim_f0', 6 * T, 4 * T);
    this.tile('flask_big_red', 1 * T, 5 * T - 2);
    this.tile('flask_big_blue', 0, 5 * T);
    this.tile('flask_green', 6 * T - 4, 5 * T + 2);
    this.tile('skull', 4 * T, 5 * T);

    // campfire (Idylwild, 4 frames)
    const ff = this.reduced ? 0 : Math.floor(t * 7) % 4;
    c.drawImage(this.fire, ff * FIRE_W, 0, FIRE_W, FIRE_H, FIRE.x - FIRE_W / 2, FIRE.y - FIRE_H + 6, FIRE_W, FIRE_H);

    // the resting adventurer, facing the fire; on enter he walks to the door
    let hx = HERO_REST.x, hy = HERO_REST.y;
    let running = false, flip = true;
    if (enterP > 0) {
      const k = Math.min(1, enterP / 0.75);
      hx = HERO_REST.x + (DOOR_C * T - HERO_REST.x) * k;
      hy = HERO_REST.y + (4 - HERO_REST.y) * k;
      running = true;
      flip = false;
    }
    const frames = running ? HERO_RUN : HERO_IDLE;
    const fn = frames[this.reduced ? 0 : Math.floor(now / (running ? 90 : 160)) % 4] ?? 'floor_1';
    c.save();
    if (enterP > 0) { c.beginPath(); c.rect(0, 12, CAMP_W, CAMP_H); c.clip(); }
    if (enterP < 0.9) this.tile(fn, Math.round(hx), Math.round(hy), flip);
    c.restore();

    // firelight: warm, flickering, banded like the dungeon
    const flick = this.reduced ? 1 : 1 + 0.07 * Math.sin(t * 8.3) + 0.05 * Math.sin(t * 13.9 + 2) + 0.03 * Math.sin(t * 31);
    const R = 62 * flick, R2 = R * R;
    const img = c.getImageData(0, 0, CAMP_W, CAMP_H);
    const d = img.data;
    for (let y = 0; y < CAMP_H; y++) {
      for (let x = 0; x < CAMP_W; x++) {
        const ddx = x - FIRE.x, ddy = (y - FIRE.y) * 1.15;
        const dd = (ddx * ddx + ddy * ddy) / R2;
        let lr = 0.14, lg = 0.13, lb = 0.18;
        if (dd < 1) { const f = (1 - dd) * (1 - dd) * 1.2; lr += f; lg += 0.7 * f; lb += 0.42 * f; }
        const th = BAYER[(x & 3) | ((y & 3) << 2)]!;
        const o = (y * CAMP_W + x) * 4;
        d[o] = Math.min(255, d[o]! * Math.min(1.05, Math.floor(lr * 6 + th) / 6));
        d[o + 1] = Math.min(255, d[o + 1]! * Math.min(1.05, Math.floor(lg * 6 + th) / 6));
        d[o + 2] = Math.min(255, d[o + 2]! * Math.min(1.05, Math.floor(lb * 6 + th) / 6));
      }
    }
    c.putImageData(img, 0, 0);

    // embers drifting up from the fire
    if (!this.reduced) {
      for (let k = 0; k < 7; k++) {
        const p = (t * 0.45 + hash2(k, 3)) % 1;
        const ex = Math.round(FIRE.x + (hash2(k, 9) - 0.5) * 10 + Math.sin(t * 2 + k) * 3);
        const ey = Math.round(FIRE.y - 14 - p * 36);
        if (p < 0.8) this.px(p < 0.4 ? 'warm5' : 'warm3', ex, ey);
      }
    }
  }
}
