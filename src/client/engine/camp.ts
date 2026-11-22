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
import { getSprites } from './sprites';

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
/** the soul's homecoming after a game over */
const REVIVE_MS = 7200;
/** back from a crossing: he just walks in from the door to the fire */
const RETURN_MS = 3000;
/** after a crossing: where the dwarf celebrates in the dark, and how long the walk to the fire takes */
const VICTORY_SPOT = { x: 48, y: 32 };
/**
 * Continue: two seconds of walking on (the floor rolls by and slows to a stop),
 * then the camp's walls and fire come into view around him, then he walks to his place.
 */
const WALK_MS = 2000;
const REVEAL_MS = 2900;
const HOME_MS = 4000;
/** how far the floor rolls in the walk: whole rows, ending exactly on the camp's own floor */
const ROLL_PX = 5 * T;
/** where the soul hovers beside the fire, waiting for its body */
const SOUL_REST = { x: 67, y: 40 };
/** the dwarf sprite's hand, facing right */
const HAND = { x: 14, y: 17 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export type CampCue = 'ignite' | 'door' | 'revive';

type Light = { x: number; y: number; r: number; k: number; tint: readonly [number, number, number] };
const COLD: readonly [number, number, number] = [0.55, 0.78, 1.05];
const TORCH_TINT: readonly [number, number, number] = [1, 0.72, 0.45];

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
  private reviveT0 = -1;
  private reviveKind: 'soul' | 'return' = 'soul';
  private victory = false;
  private homeT0 = -1;
  private onHome: (() => void) | null = null;
  private onRevived: (() => void) | null = null;
  private pale = new Map<FrameName, HTMLCanvasElement>();
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

  /**
   * After a game over: the soul drifts out of the door to the fire, its pale,
   * hollow-eyed body follows, and the two become one again. Nothing else on
   * screen until it's done.
   */
  revive(onDone: () => void, onCue?: (cue: CampCue) => void, kind: 'soul' | 'return' = 'soul'): void {
    if (this.reduced) { onDone(); return; }
    this.reviveKind = kind;
    this.reviveT0 = performance.now();
    this.onRevived = onDone;
    this.onCue = onCue ?? null;
    this.cued.clear();
  }

  /** After a crossing: the room is dark, no fire, just the dwarf cheering in his own torchlight. */
  celebrate(): void {
    this.victory = true;
    this.homeT0 = -1;
  }

  /** He walks on for a while, the floor rolling by, until the fire comes into view ahead. */
  homeward(onDone: () => void): void {
    if (!this.victory) { onDone(); return; }
    if (this.reduced) { onDone(); return; }
    this.homeT0 = performance.now();
    this.onHome = onDone;
  }

  /** Back to the ordinary camp (done under a fade, so the cut can't be seen). */
  settle(): void {
    this.victory = false;
    this.homeT0 = -1;
    this.onHome = null;
  }

  /** The dwarf without his soul: a dim, grey-green husk with black hollows for eyes. */
  private paleFrame(name: FrameName): HTMLCanvasElement | null {
    const cached = this.pale.get(name);
    if (cached) return cached;
    if (!this.atlas) return null;
    const [sx, sy, w, h] = FRAMES[name];
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    if (!x) return null;
    x.drawImage(this.atlas, sx, sy, w, h, 0, 0, w, h);
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    const at = (px: number, py: number) => (py * w + px) * 4;
    const isInk = (o: number) => d[o + 3]! > 0 && d[o]! < 60 && d[o + 1]! < 60 && d[o + 2]! < 60;
    const isSkin = (o: number) => d[o + 3]! > 0 && d[o]! > 180 && d[o + 1]! > 130 && d[o + 2]! > 100 && d[o + 1]! < 200;
    // the eyes: dark pixels sitting in the face, with skin beside them
    const eyes: number[] = [];
    for (let py = 0; py < h; py++)
      for (let px = 1; px < w - 1; px++) {
        const o = at(px, py);
        if (isInk(o) && (isSkin(at(px - 1, py)) || isSkin(at(px + 1, py))) && py > 12 && py < 22) eyes.push(px, py);
      }
    for (let o = 0; o < d.length; o += 4) {
      if (d[o + 3] === 0 || isInk(o)) continue;
      // a corpse, not a spirit: dim grey-green, nothing like the soul's bright blue
      const lum = 0.3 * d[o]! + 0.59 * d[o + 1]! + 0.11 * d[o + 2]!;
      const v = 0.38 * lum + 62;
      d[o] = v - 4; d[o + 1] = v + 8; d[o + 2] = v - 10;
    }
    for (let k = 0; k < eyes.length; k += 2) {
      const ex = eyes[k]!, ey = eyes[k + 1]!;
      for (const [ox, oy] of [[0, 0], [0, -1], [0, 1]] as const) {
        const o = at(ex + ox, ey + oy);
        d[o] = 6; d[o + 1] = 7; d[o + 2] = 11; d[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    this.pale.set(name, cv);
    return cv;
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
    const homecoming = this.reviveKind === 'soul';
    const q = this.reviveT0 >= 0 ? Math.min(1, (now - this.reviveT0) / (homecoming ? REVIVE_MS : RETURN_MS)) : -1;
    if (q >= 1 && this.onRevived) { const done = this.onRevived; this.onRevived = null; this.reviveT0 = -1; done(); }
    const reviving = q >= 0 && q < 1;
    if (reviving) {
      this.cue('door');
      if (homecoming && q >= 0.82) this.cue('revive');
    }
    // the soul: out of the door, down to the fireside, then into the body
    const soulIn = ease(span(q, 0.04, 0.34));
    const merge = ease(span(q, 0.74, 0.86));
    const soul = {
      x: lerp(lerp(HERO_DOOR.x, SOUL_REST.x, soulIn), HERO_REST.x, merge),
      y: lerp(lerp(HERO_DOOR.y, SOUL_REST.y, soulIn), HERO_REST.y + 2, merge),
    };
    const soulAlpha = reviving && homecoming ? Math.min(1, span(q, 0.03, 0.12) * 1.2) * (1 - span(q, 0.8, 0.87)) : 0;
    // the body: out of the dark doorway, across to where the soul waits (or just home to the fire)
    const bodyWalk = homecoming ? ease(span(q, 0.46, 0.74)) : ease(span(q, 0.1, 0.78));
    const bodyShown = !reviving || q >= (homecoming ? 0.46 : 0.1);
    const colour = reviving && homecoming ? ease(span(q, 0.84, 0.97)) : 1;
    const doorOpenRevive = reviving && q >= 0.02 && q < (homecoming ? 0.9 : 0.86);
    // after a crossing: cheering in the dark, then the walk home to the fire
    const homeMs = this.victory && this.homeT0 >= 0 ? Math.min(HOME_MS, now - this.homeT0) : -1;
    if (homeMs >= HOME_MS && this.onHome) { const done = this.onHome; this.onHome = null; done(); } // holds this frame until settle()
    const celebrating = this.victory && homeMs < 0;
    const walkK = homeMs < 0 ? 0 : Math.min(1, homeMs / WALK_MS);
    const walking = this.victory && homeMs >= 0 && walkK < 1;
    // the camp's walls and fire fade in around him, then he walks to his place by the fire
    const reveal = this.victory && homeMs >= 0 ? ease((homeMs - WALK_MS) / (REVEAL_MS - WALK_MS)) : 0;
    const settleK = this.victory && homeMs >= 0 ? ease((homeMs - REVEAL_MS) / (HOME_MS - REVEAL_MS)) : 0;
    const fireShown = this.victory ? reveal : 1;
    const fire = FIRE;
    const fireLight = FIRE_LIGHT;
    // the floor rolls by under his feet, slowing to a stop exactly on the camp's own floor
    const rolled = this.victory ? ROLL_PX * (1 - (1 - walkK) * (1 - walkK)) : 0;
    const shift = Math.floor(rolled / T);
    const roll = rolled - shift * T;
    // home from a crossing (or celebrating one), still holding the torch that got him through
    const carrying = (reviving && !homecoming && q < 0.84) || this.victory;

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
    let facingDoor = p >= 0.44;
    let running = walk > 0 && walk < 1 || through > 0;
    if (reviving) {
      hx = lerp(HERO_DOOR.x, HERO_REST.x, bodyWalk);
      // a soulless, staggering walk
      hy = lerp(HERO_DOOR.y, HERO_REST.y, bodyWalk) + (bodyWalk > 0 && bodyWalk < 1 ? Math.round(Math.abs(Math.sin(t * 5)) * 1.5) : 0);
      running = bodyWalk > 0 && bodyWalk < 1;
      facingDoor = false;
    }
    if (this.victory) {
      // in the middle of the screen: hopping for joy, walking on the spot as the floor rolls by,
      // then over to his place by the fire, turning to face it as he arrives
      hx = lerp(VICTORY_SPOT.x, HERO_REST.x, settleK);
      hy = lerp(VICTORY_SPOT.y, HERO_REST.y, settleK);
      if (celebrating && !this.reduced) hy -= Math.round(Math.abs(Math.sin(t * 5.5)) * 4);
      running = walking || (settleK > 0 && settleK < 1);
      facingDoor = settleK < 1;
    }

    // where the torch is: upright in the hand, dipped into the flames while lighting
    const handX = Math.round(hx) + (facingDoor ? HAND.x : T - 1 - HAND.x);
    const handY = Math.round(hy) + HAND.y;
    // held upright in the hand (raised high while he celebrates)
    const upright = { x: handX + (facingDoor ? 1 : -1), y: handY - (celebrating ? 10 : 7) };
    const inFire = { x: FIRE.x + 5, y: FIRE.y - 17 };
    const tip = { x: Math.round(lerp(upright.x, inFire.x, reach)), y: Math.round(lerp(upright.y, inFire.y, reach)) };

    // ── the room, drawn at full brightness; the light pass decides what is seen ──
    c.fillStyle = C.void0;
    c.fillRect(0, 0, CAMP_W, CAMP_H);
    const floorTile = (col: number, r: number) =>
      hash2(col, r) < 0.65 ? 'floor_1' : (['floor_2', 'floor_3', 'floor_5', 'floor_6'] as const)[Math.floor(hash2(r, col) * 4)]!;
    if (this.victory) {
      // somewhere in the dark between the dungeon and the camp: only floor, rolling by as he walks.
      // The rows cycle through the camp's own five, so when it stops it IS the camp floor.
      const pattern = (r: number) => 2 + ((((r - 2 - shift) % 5) + 5) % 5);
      for (let r = -1; r < 8; r++) for (let col = 0; col < 7; col++) this.tile(floorTile(col, pattern(r)), col * T, r * T + Math.round(roll));
      if (reveal > 0) {
        // the camp's back wall and door come into view around him
        c.save();
        c.globalAlpha = reveal;
        this.px('void0', 0, 0, CAMP_W, 2 * T); // as in the camp, the wall tops sit on black
        for (let col = 0; col < 7; col++) {
          this.tile('wall_top_mid', col * T, 0);
          this.tile('wall_mid', col * T, T);
        }
        const dx = DOOR_C * T - 8;
        this.tile('doors_leaf_closed', dx, 0);
        this.tile('doors_frame_left', dx - 16, 0);
        this.tile('doors_frame_right', dx + 32, 0);
        c.restore();
      }
    } else {
      for (let col = 0; col < 7; col++) {
        this.tile('wall_top_mid', col * T, 0);
        this.tile('wall_mid', col * T, T);
      }
      const dx = DOOR_C * T - 8;
      // the open leaf's doorway is see-through: black it out, or the wall shows through
      const doorOpen = p >= 0.72 || doorOpenRevive;
      if (doorOpen) this.px('void0', dx + 3, 3, 26, 27);
      this.tile(doorOpen ? 'doors_leaf_open' : 'doors_leaf_closed', dx, 0);
      this.tile('doors_frame_left', dx - 16, 0);
      this.tile('doors_frame_right', dx + 32, 0);
      for (let r = 2; r < 7; r++) for (let col = 0; col < 7; col++) this.tile(floorTile(col, r), col * T, r * T);
    }

    const flick = this.reduced ? 1 : 1 + 0.07 * Math.sin(t * 8.3) + 0.05 * Math.sin(t * 13.9 + 2) + 0.03 * Math.sin(t * 31);

    // the dwarf's shadow, thrown away from the fire and swaying with it
    if (through === 0 && bodyShown && !this.victory) {
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
    if (fireShown > 0) {
      c.save();
      c.globalAlpha = fireShown;
      c.drawImage(this.fire, ff * FIRE_W, 0, FIRE_W, FIRE_H, fire.x - FIRE_W / 2, fire.y - FIRE_H + 6, FIRE_W, FIRE_H);
      c.restore();
    }

    // the dwarf: resting, facing the fire; then off to the door with his torch
    const frames = running ? HERO_RUN : HERO_IDLE;
    const fn = frames[this.reduced ? 0 : Math.floor(now / (running ? (reviving ? 150 : 90) : 220)) % 4] ?? 'floor_1';
    c.save();
    if (through > 0 || (reviving && bodyWalk < 0.3)) { c.beginPath(); c.rect(0, 12, CAMP_W, CAMP_H); c.clip(); }
    if (through < 0.95 && bodyShown) {
      if (entering && facingDoor) this.drawTorch({ x: handX, y: handY }, tip); // carried in front when walking away
      if (colour < 1) {
        // soulless: drawn pale, and colour floods back once the soul is home
        const pale = this.paleFrame(fn);
        const bx = Math.round(hx), by = Math.round(hy);
        if (pale) {
          c.save();
          c.translate(bx + T, by);
          c.scale(-1, 1);
          c.drawImage(pale, 0, 0);
          c.restore();
        }
        c.save();
        c.globalAlpha = colour;
        this.tile(fn, bx, by, true);
        c.restore();
      } else {
        this.tile(fn, Math.round(hx), Math.round(hy), !facingDoor);
      }
      if (entering && !facingDoor) this.drawTorch({ x: handX, y: handY }, tip);
      if (carrying) this.drawTorch({ x: handX, y: handY }, upright);
    }
    c.restore();

    // ── light: the fire, and the torch once it burns. Everything else is dark ──
    const torchOn = entering && lit && through < 0.9;
    const torchFade = 1 - span(p, 0.86, 0.98);
    const R = Math.max(1, 46 * flick * fireShown);
    const lights: Light[] = [];
    if (torchOn) lights.push({ x: tip.x, y: tip.y, r: 30 * flick * torchFade, k: 1.1, tint: TORCH_TINT });
    if (carrying && this.victory) {
      // after a crossing his torch is the whole world: a wide circle centred on him
      const out = 1 - Math.max(0, Math.min(1, (homeMs - (HOME_MS - 450)) / 450));
      lights.push({ x: hx + 8, y: hy + 15, r: 50 * flick * out, k: 1.15, tint: TORCH_TINT });
    } else if (carrying) lights.push({ x: upright.x, y: upright.y, r: 30 * flick * (1 - span(q, 0.72, 0.84)), k: 1.1, tint: TORCH_TINT });
    if (soulAlpha > 0) lights.push({ x: soul.x + 8, y: soul.y + 12, r: 24, k: 1.0 * soulAlpha, tint: COLD });
    // just enough to make out the husk in the dark: dull, colourless, unlike the soul's glow
    if (reviving && bodyShown && colour < 1) lights.push({ x: hx + 8, y: hy + 16, r: 15, k: 0.6 * (1 - colour), tint: [0.62, 0.66, 0.6] });
    const flash = reviving && homecoming ? Math.max(0, 1 - Math.abs(q - 0.84) / 0.04) : 0;
    if (flash > 0) lights.push({ x: HERO_REST.x + 8, y: HERO_REST.y + 14, r: 34, k: 1.6 * flash, tint: [1, 0.95, 0.9] });
    const breathe = this.reduced ? 0 : 1;
    const img = c.getImageData(0, 0, CAMP_W, CAMP_H);
    const d = img.data;
    for (let y = 0; y < CAMP_H; y++) {
      for (let x = 0; x < CAMP_W; x++) {
        const ddx = x - fireLight.x, ddy = (y - fireLight.y) * 1.2;
        // the edge of the dark breathes: its radius wanders with the angle and the time
        const ang = Math.atan2(ddy, ddx);
        const wobble = 1 + breathe * (0.07 * Math.sin(3 * ang + t * 0.8) + 0.05 * Math.sin(5 * ang - t * 1.3) + 0.03 * Math.sin(9 * ang + t * 2.3));
        const rr = R * wobble;
        const dd = (ddx * ddx + ddy * ddy) / (rr * rr);
        let l = 0; // past the firelight: nothing at all
        if (dd < 1) l += (1 - dd) * (1 - dd) * 1.25;
        let lr = l, lg = 0.68 * l, lb = 0.4 * l;
        for (const li of lights) {
          const tx = x - li.x, ty = (y - li.y) * 1.15;
          const td = (tx * tx + ty * ty) / (li.r * li.r);
          if (td >= 1) continue;
          const v = (1 - td) * (1 - td) * li.k;
          lr += v * li.tint[0]; lg += v * li.tint[1]; lb += v * li.tint[2];
        }
        const th = BAYER[(x & 3) | ((y & 3) << 2)]!;
        const o = (y * CAMP_W + x) * 4;
        d[o] = Math.min(255, d[o]! * Math.min(1.05, Math.floor(lr * 6 + th) / 6));
        d[o + 1] = Math.min(255, d[o + 1]! * Math.min(1.05, Math.floor(lg * 6 + th) / 6));
        d[o + 2] = Math.min(255, d[o + 2]! * Math.min(1.05, Math.floor(lb * 6 + th) / 6));
      }
    }
    c.putImageData(img, 0, 0);

    // ── emissive: the soul, torch flame, sparks of the lighting, embers rising ──
    if (soulAlpha > 0) {
      const frames2 = getSprites().ghost;
      const sprite = frames2[Math.floor(t * 2.5) % 2]!;
      const bob = Math.round(Math.sin(t * 2.2) * 1.5 * (1 - merge));
      const shrink = 1 - 0.5 * merge;
      const w = Math.round(sprite.w * shrink), h = Math.round(sprite.h * shrink);
      c.save();
      c.globalAlpha = 0.85 * soulAlpha;
      c.translate(Math.round(soul.x + (T - w) / 2) + w, Math.round(soul.y + bob + (28 - h) - 4));
      c.scale(-1, 1); // facing the fire, like the dwarf
      c.drawImage(sprite.canvas, 0, 0, w, h);
      c.restore();
    }
    if (flash > 0.6 && this.sparks.length < 18) {
      for (let k = 0; k < 3; k++) {
        this.sparks.push({ x: HERO_REST.x + 8, y: HERO_REST.y + 14, vx: (hash2(k, Math.floor(now)) - 0.5) * 60, vy: -30 - hash2(Math.floor(now), k) * 30, life: 0.6 });
      }
    }
    if (torchOn && through < 0.6) this.drawFlame(tip.x, tip.y, t);
    if (carrying && q < 0.8 && (!this.victory || homeMs < HOME_MS - 200)) this.drawFlame(upright.x, upright.y, t);
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
    // a crossing: golden sparks burst up and drift around the celebrating dwarf
    if (celebrating && !this.reduced) {
      for (let k = 0; k < 12; k++) {
        const sq = (t * 0.8 + hash2(k, 21)) % 1;
        if (sq > 0.85) continue;
        const ang = hash2(k, 5) * Math.PI * 2;
        const r = 4 + sq * 13;
        this.px(sq < 0.3 ? 'warm6' : sq < 0.6 ? 'warm5' : 'warm4',
          Math.round(hx + 8 + Math.cos(ang) * r), Math.round(hy + 12 + Math.sin(ang) * r * 0.6 - sq * 10));
      }
    }
    if (!this.reduced && fireShown > 0.5) {
      for (let k = 0; k < 7; k++) {
        const q = (t * 0.4 + hash2(k, 3)) % 1;
        const ex = Math.round(fire.x + (hash2(k, 9) - 0.5) * 10 + Math.sin(t * 2 + k) * 3);
        const ey = Math.round(fire.y - 14 - q * 34);
        if (q < 0.8) this.px(q < 0.4 ? 'warm5' : 'warm3', ex, ey);
      }
    }
  }
}
