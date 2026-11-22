// The standby room: a dwarf resting by a campfire in the dark. The fire is the
// only light; past its reach there is nothing but shadow, and the edge of the
// dark breathes as the flames move. On "enter" he takes up an unlit torch,
// lights it in the fire and carries it to the door.
// Art is sourced (CC0): room and dwarf from 0x72's DungeonTileset II, the
// campfire from Idylwild's Chromatic Campfires. The torch is hand-pixelled.
import campfireUrl from '../assets/campfire.png';
import atlasUrl from '../assets/dungeon.png';
import { FRAMES, HERO_IDLE, HERO_RUN, type FrameName } from './atlas';
import { C, type ColorKey } from './palette';

export const CAMP_W = 112;
export const CAMP_H = 112;
const T = 16;
const DOOR_C = 5;
const FIRE = { x: 50, y: 88 };
/** where the fire's light comes from: the heart of the flames */
const FIRE_LIGHT = { x: 50, y: 76 };
const HERO_REST = { x: 67, y: 60 };
/** the hero at the door, about to step through */
const HERO_DOOR = { x: 80, y: 6 };
const FIRE_W = 26;
const FIRE_H = 37;
const ENTER_MS = 3600;
/** the dwarf sprite's hand, facing right */
const HAND = { x: 14, y: 17 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export type CampCue = 'ignite' | 'door';

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

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** progress through [a, b] of the whole sequence, clamped to 0..1 */
const span = (p: number, a: number, b: number): number => Math.max(0, Math.min(1, (p - a) / (b - a)));

type Spark = { x: number; y: number; vx: number; vy: number; life: number };

export class CampScene {
  private readonly ctx: CanvasRenderingContext2D;
  private atlas: HTMLImageElement | null = null;
  private fire: HTMLImageElement | null = null;
  private raf = 0;
  private enterT0 = -1;
  private onEntered: (() => void) | null = null;
  private onCue: ((cue: CampCue) => void) | null = null;
  private cued = new Set<CampCue>();
  private sparks: Spark[] = [];
  private lastT = 0;
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

  /** He takes up a torch, lights it in the fire and walks out through the door. */
  enter(onDone: () => void, onCue?: (cue: CampCue) => void): void {
    if (this.enterT0 >= 0) return;
    if (this.reduced) { onCue?.('door'); onDone(); return; }
    this.enterT0 = performance.now();
    this.onEntered = onDone;
    this.onCue = onCue ?? null;
    this.cued.clear();
  }

  private cue(c: CampCue): void {
    if (this.cued.has(c)) return;
    this.cued.add(c);
    this.onCue?.(c);
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
    this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  /** A stick from the hand to the tip, outlined so it reads against the floor. */
  private drawTorch(hand: { x: number; y: number }, tip: { x: number; y: number }): void {
    const n = Math.max(1, Math.round(Math.hypot(tip.x - hand.x, tip.y - hand.y)));
    for (let k = 0; k <= n; k++) {
      const x = lerp(hand.x, tip.x, k / n), y = lerp(hand.y, tip.y, k / n);
      this.px('ink', x - 1, y - 1, 3, 3);
    }
    for (let k = 0; k <= n; k++) {
      const x = lerp(hand.x, tip.x, k / n), y = lerp(hand.y, tip.y, k / n);
      this.px(k > n - 2 ? 'warm1' : 'warm2', x, y);
    }
  }

  /** The torch's flame (emissive: drawn after the lighting pass). */
  private drawFlame(x: number, y: number, t: number): void {
    const blink = (seed: number, rate: number) => hash2(Math.floor(t * rate), seed);
    const lean = blink(2, 9) > 0.5 ? 1 : -1;
    this.px('warm4', x - 1, y - 2, 3, 3);
    this.px('warm5', x, y - 3, 1, 4);
    this.px('warm5', x - 1, y - 1, 3, 1);
    this.px(blink(1, 14) > 0.3 ? 'warm6' : 'warm5', x, y - 1, 1, 2);
    this.px('warm4', x + lean, y - 3);
    if (blink(3, 8) > 0.25) this.px('warm5', x + (lean > 0 ? 0 : 1) * lean, y - 4);
    if (blink(5, 7) > 0.55) this.px('warm3', x + lean, y - 5);
  }

  private frame(now: number): void {
    if (!this.atlas || !this.fire) return;
    const c = this.ctx;
    const t = now / 1000;
    const dt = Math.min(0.05, this.lastT ? t - this.lastT : 0);
    this.lastT = t;
    const p = this.enterT0 >= 0 ? Math.min(1, (now - this.enterT0) / ENTER_MS) : -1;
    if (p >= 1 && this.onEntered) { const done = this.onEntered; this.onEntered = null; done(); }

    // ── the sequence: reach into the fire, light the torch, walk to the door ──
    const entering = p >= 0;
    const reach = ease(span(p, 0.08, 0.26)) * (1 - ease(span(p, 0.34, 0.44)));
    const lit = p >= 0.3;
    if (entering && lit) this.cue('ignite');
    const walk = ease(span(p, 0.46, 0.84));
    const through = span(p, 0.84, 1);
    if (p >= 0.7) this.cue('door');
    const step = ease(span(p, 0.04, 0.2)) * (1 - walk); // a step toward the fire
    let hx = HERO_REST.x - 4 * step, hy = HERO_REST.y;
    if (walk > 0) {
      hx = lerp(HERO_REST.x - 4 * step, HERO_DOOR.x, walk);
      hy = lerp(HERO_REST.y, HERO_DOOR.y, walk);
    }
    if (through > 0) hy = HERO_DOOR.y - 14 * through;
    const facingDoor = p >= 0.44;
    const running = walk > 0 && walk < 1 || through > 0;

    // where the torch is: upright in the hand, dipped into the flames while lighting
    const handX = Math.round(hx) + (facingDoor ? HAND.x : T - 1 - HAND.x);
    const handY = Math.round(hy) + HAND.y;
    const upright = { x: handX + (facingDoor ? 1 : -1), y: handY - 7 };
    const inFire = { x: FIRE.x + 5, y: FIRE.y - 17 };
    const tip = { x: Math.round(lerp(upright.x, inFire.x, reach)), y: Math.round(lerp(upright.y, inFire.y, reach)) };

    // ── the room, drawn at full brightness; the light pass decides what is seen ──
    c.fillStyle = C.void0;
    c.fillRect(0, 0, CAMP_W, CAMP_H);
    for (let col = 0; col < 7; col++) {
      this.tile('wall_top_mid', col * T, 0);
      this.tile('wall_mid', col * T, T);
    }
    const dx = DOOR_C * T - 8;
    this.tile(p >= 0.72 ? 'doors_leaf_open' : 'doors_leaf_closed', dx, 0);
    this.tile('doors_frame_left', dx - 16, 0);
    this.tile('doors_frame_right', dx + 32, 0);
    for (let r = 2; r < 7; r++) for (let col = 0; col < 7; col++) {
      const v = hash2(col, r) < 0.65 ? 'floor_1' : (['floor_2', 'floor_3', 'floor_5', 'floor_6'] as const)[Math.floor(hash2(r, col) * 4)]!;
      this.tile(v, col * T, r * T);
    }

    const flick = this.reduced ? 1 : 1 + 0.07 * Math.sin(t * 8.3) + 0.05 * Math.sin(t * 13.9 + 2) + 0.03 * Math.sin(t * 31);

    // the dwarf's shadow, thrown away from the fire and swaying with it
    if (through === 0) {
      const fx = hx + 8, fy = hy + 27;
      const ax = fx - FIRE_LIGHT.x, ay = fy - FIRE_LIGHT.y;
      const len = Math.hypot(ax, ay) || 1;
      const ux = ax / len, uy = ay / len;
      const reachLen = (10 + 6 * (flick - 0.9) * 3) * (lit && walk > 0 ? 0.5 : 1);
      const sway = this.reduced ? 0 : Math.sin(t * 2.1) * 0.12 + Math.sin(t * 5.3) * 0.05;
      c.save();
      c.globalAlpha = 0.5;
      c.fillStyle = C.void0;
      for (let k = 0; k < reachLen; k++) {
        const w = Math.max(1, 6 - k * 0.35);
        const x = fx + (ux - uy * sway) * k, y = fy + (uy + ux * sway) * k * 0.6;
        c.fillRect(Math.round(x - w / 2), Math.round(y - 1), Math.round(w), 2);
      }
      c.restore();
    }

    // campfire (Idylwild, 4 frames)
    const ff = this.reduced ? 0 : Math.floor(t * 7) % 4;
    c.drawImage(this.fire, ff * FIRE_W, 0, FIRE_W, FIRE_H, FIRE.x - FIRE_W / 2, FIRE.y - FIRE_H + 6, FIRE_W, FIRE_H);

    // the dwarf: resting, facing the fire; then off to the door with his torch
    const frames = running ? HERO_RUN : HERO_IDLE;
    const fn = frames[this.reduced ? 0 : Math.floor(now / (running ? 90 : 220)) % 4] ?? 'floor_1';
    c.save();
    if (through > 0) { c.beginPath(); c.rect(0, 12, CAMP_W, CAMP_H); c.clip(); }
    if (through < 0.95) {
      if (entering && facingDoor) this.drawTorch({ x: handX, y: handY }, tip); // carried in front when walking away
      this.tile(fn, Math.round(hx), Math.round(hy), !facingDoor);
      if (entering && !facingDoor) this.drawTorch({ x: handX, y: handY }, tip);
    }
    c.restore();

    // ── light: the fire, and the torch once it burns. Everything else is dark ──
    const torchOn = entering && lit && through < 0.9;
    const torchFade = 1 - span(p, 0.86, 0.98);
    const R = 46 * flick;
    const TR = 30 * flick * torchFade;
    const breathe = this.reduced ? 0 : 1;
    const img = c.getImageData(0, 0, CAMP_W, CAMP_H);
    const d = img.data;
    for (let y = 0; y < CAMP_H; y++) {
      for (let x = 0; x < CAMP_W; x++) {
        const ddx = x - FIRE_LIGHT.x, ddy = (y - FIRE_LIGHT.y) * 1.2;
        // the edge of the dark breathes: its radius wanders with the angle and the time
        const ang = Math.atan2(ddy, ddx);
        const wobble = 1 + breathe * (0.07 * Math.sin(3 * ang + t * 0.8) + 0.05 * Math.sin(5 * ang - t * 1.3) + 0.03 * Math.sin(9 * ang + t * 2.3));
        const rr = R * wobble;
        const dd = (ddx * ddx + ddy * ddy) / (rr * rr);
        let l = 0; // past the firelight: nothing at all
        if (dd < 1) l += (1 - dd) * (1 - dd) * 1.25;
        let tl = 0;
        if (torchOn) {
          const tx = x - tip.x, ty = (y - tip.y) * 1.15;
          const td = (tx * tx + ty * ty) / (TR * TR);
          if (td < 1) tl = (1 - td) * (1 - td) * 1.1;
        }
        const th = BAYER[(x & 3) | ((y & 3) << 2)]!;
        const lr = l + tl, lg = 0.68 * l + 0.72 * tl, lb = 0.4 * l + 0.45 * tl;
        const o = (y * CAMP_W + x) * 4;
        d[o] = Math.min(255, d[o]! * Math.min(1.05, Math.floor(lr * 6 + th) / 6));
        d[o + 1] = Math.min(255, d[o + 1]! * Math.min(1.05, Math.floor(lg * 6 + th) / 6));
        d[o + 2] = Math.min(255, d[o + 2]! * Math.min(1.05, Math.floor(lb * 6 + th) / 6));
      }
    }
    c.putImageData(img, 0, 0);

    // ── emissive: torch flame, sparks of the lighting, embers rising ──
    if (torchOn && through < 0.6) this.drawFlame(tip.x, tip.y, t);
    if (entering && p >= 0.3 && p < 0.33 && this.sparks.length < 14) {
      for (let k = 0; k < 4; k++) {
        this.sparks.push({ x: tip.x, y: tip.y, vx: (hash2(k, Math.floor(now)) - 0.5) * 50, vy: -20 - hash2(Math.floor(now), k) * 40, life: 0.5 });
      }
    }
    this.sparks = this.sparks.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt;
      this.px(s.life > 0.25 ? 'warm6' : 'warm4', s.x, s.y);
    }
    if (!this.reduced) {
      for (let k = 0; k < 7; k++) {
        const q = (t * 0.4 + hash2(k, 3)) % 1;
        const ex = Math.round(FIRE.x + (hash2(k, 9) - 0.5) * 10 + Math.sin(t * 2 + k) * 3);
        const ey = Math.round(FIRE.y - 14 - q * 34);
        if (q < 0.8) this.px(q < 0.4 ? 'warm5' : 'warm3', ex, ey);
      }
    }
  }
}
