// Low-resolution pixel scene (112×176) scaled up with nearest-neighbour.
// Each frame: draw the lit-agnostic scene → apply coloured, banded, dithered
// lighting per pixel → snap to palette → draw emissive bits (flames, motes, markers).
import { COLS, ROWS, clue, idx, mulberry32, neighbors, type Board, type Cell } from '../../shared/board';
import { C, snap, type ColorKey } from './palette';
import { getSprites } from './sprites';

export const TILE = 16;
export const TOP = 22;
export const BOTTOM = 10;
export const SCENE_W = COLS * TILE;
export const SCENE_H = TOP + ROWS * TILE + BOTTOM;

export type GraveView = {
  falls: number;
  honest: number;
  liar: number;
  carved: boolean;
  mine: boolean;
};

export type Phase = 'walking' | 'falling' | 'fallen' | 'crossing' | 'crossed' | 'idle';

export type SceneState = {
  board: Board;
  revealed: ReadonlySet<number>;
  player: Cell;
  graves: ReadonlyMap<number, GraveView>;
  phase: Phase;
};

type Mote = { x: number; y: number; vx: number; vy: number; life: number; seed: number };
type Light = { x: number; y: number; r: number; k: number; cr: number; cg: number; cb: number };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const FALL_MS = 900;
const CROSS_MS = 2400;
const HOP_MS = 170;
const ARCH = { x0: 46, x1: 65, cx: 56, cy: 13, r: 10 };
const BRAZIERS = [30, 82];

const hash2 = (a: number, b: number): number => {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const candleCount = (g: GraveView): number => {
  if (g.liar > g.honest * 1.5) return 0;
  return g.honest >= 15 ? 3 : g.honest >= 5 ? 2 : g.honest >= 1 ? 1 : 0;
};

export const isKnownLiar = (g: GraveView): boolean => g.honest + g.liar >= 3 && g.liar > g.honest * 1.5;

export type SceneEvents = {
  onFallDone?: () => void;
  onCrossDone?: () => void;
};

export class Scene {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layer: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;
  private readonly events: SceneEvents;
  private readonly reduced: boolean;
  private state: SceneState | null = null;
  private layerKey = '';
  private pos = { x: 0, y: 0 };
  private hopFrom = { x: 0, y: 0 };
  private hopT0 = -1;
  private phaseT0 = 0;
  private lastPhase: Phase = 'idle';
  private motes: Mote[] = [];
  private raf = 0;
  private lanternGlow = 1;

  constructor(canvas: HTMLCanvasElement, events: SceneEvents = {}) {
    this.canvas = canvas;
    this.events = events;
    canvas.width = SCENE_W;
    canvas.height = SCENE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.layer = document.createElement('canvas');
    this.layer.width = SCENE_W;
    this.layer.height = SCENE_H;
    const lctx = this.layer.getContext('2d');
    if (!lctx) throw new Error('2d context unavailable');
    this.lctx = lctx;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < 22; i++) this.motes.push({ x: 0, y: 0, vx: 0, vy: 0, life: -1, seed: i * 7.3 });
  }

  setState(next: SceneState): void {
    const prev = this.state;
    this.state = next;
    const now = performance.now();
    if (!prev) {
      this.pos = { x: next.player.c, y: next.player.r };
    } else if (prev.player.c !== next.player.c || prev.player.r !== next.player.r) {
      const dist = Math.max(Math.abs(prev.player.c - next.player.c), Math.abs(prev.player.r - next.player.r));
      if (dist === 1 && !this.reduced) {
        this.hopFrom = { ...this.pos };
        this.hopT0 = now;
      } else {
        this.pos = { x: next.player.c, y: next.player.r };
        this.hopT0 = -1;
      }
    }
    if (next.phase !== this.lastPhase) {
      this.phaseT0 = now;
      this.lastPhase = next.phase;
    }
  }

  start(): void {
    const loop = (t: number) => {
      this.frame(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Map a pointer position to a board cell, or null when outside the stones. */
  tileAt(clientX: number, clientY: number): Cell | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * SCENE_W;
    const y = ((clientY - rect.top) / rect.height) * SCENE_H - TOP;
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return { c, r };
  }

  // ── static layer: wall, stones, digits, graves (rebuilt only on change) ────
  private ensureLayer(s: SceneState): void {
    let key = `${s.board.day}|${[...s.revealed].sort((a, b) => a - b).join(',')}|`;
    s.graves.forEach((g, i) => { key += `${i}:${g.honest}:${g.liar}:${g.carved ? 1 : 0}:${g.mine ? 1 : 0};`; });
    if (key === this.layerKey) return;
    this.layerKey = key;
    const x = this.lctx;
    x.fillStyle = C.void0;
    x.fillRect(0, 0, SCENE_W, SCENE_H);
    this.drawWall(x, s.board.day);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) this.drawStone(x, s, c, r);
    this.drawStairs(x);
    s.graves.forEach((g, i) => this.drawGrave(x, i, g));
  }

  private px(x: CanvasRenderingContext2D, color: ColorKey, px: number, py: number, w = 1, h = 1): void {
    x.fillStyle = C[color];
    x.fillRect(px, py, w, h);
  }

  private drawWall(x: CanvasRenderingContext2D, day: number): void {
    const rand = mulberry32(day * 31 + 7);
    // sky behind the battlements
    this.px(x, 'void1', 0, 0, SCENE_W, 4);
    // bricks
    for (let row = 0; row < 5; row++) {
      const y = 2 + row * 4;
      const off = row % 2 ? 4 : 0;
      for (let bx = -off; bx < SCENE_W; bx += 8) {
        const shade: ColorKey = rand() < 0.3 ? 'stone5' : rand() < 0.6 ? 'stone4' : 'stone3';
        this.px(x, shade, bx + 1, y + 1, 7, 3);
        if (rand() < 0.25) this.px(x, 'stone5', bx + 2, y + 1, 2, 1);
        if (rand() < 0.18) this.px(x, rand() < 0.5 ? 'moss2' : 'moss1', bx + 1 + Math.floor(rand() * 5), y + 3, 2, 1);
      }
    }
    // battlements
    for (let mx = 0; mx < SCENE_W; mx += 10) this.px(x, 'void1', mx + 6, 0, 4, 3);
    // arch opening: night sky
    for (let yy = 3; yy < TOP; yy++)
      for (let xx = ARCH.x0; xx <= ARCH.x1; xx++) {
        const inside = yy >= ARCH.cy || Math.hypot(xx + 0.5 - ARCH.cx, yy + 0.5 - ARCH.cy) <= ARCH.r;
        const ring = !inside && Math.hypot(xx + 0.5 - ARCH.cx, yy + 0.5 - ARCH.cy) <= ARCH.r + 1.4;
        if (inside) this.px(x, yy < 9 ? 'void1' : yy < 15 ? 'void2' : 'ghost1', xx, yy);
        else if (ring) this.px(x, 'stone6', xx, yy);
      }
    for (let yy = ARCH.cy; yy < TOP; yy++) { this.px(x, 'stone6', ARCH.x0 - 1, yy); this.px(x, 'stone6', ARCH.x1 + 1, yy); }
    // braziers (unlit bowls on posts)
    for (const bx of BRAZIERS) {
      this.px(x, 'stone3', bx, 15, 1, 7);
      this.px(x, 'warm1', bx - 2, 13, 5, 2);
      this.px(x, 'warm0', bx - 1, 15, 3, 1);
      this.px(x, 'stone7', bx - 2, 13, 5, 1);
    }
  }

  private drawStone(x: CanvasRenderingContext2D, s: SceneState, c: number, r: number): void {
    const i = idx(c, r);
    const rand = mulberry32(s.board.day * 977 + i * 131);
    const X = c * TILE, Y = TOP + r * TILE;
    const walked = s.revealed.has(i);
    const base: ColorKey = walked ? 'stone6' : 'stone5';
    const hi: ColorKey = walked ? 'stone7' : 'stone6';
    this.px(x, 'void1', X, Y, TILE, TILE);
    this.px(x, base, X, Y, TILE - 1, TILE - 1);
    this.px(x, hi, X, Y, TILE - 1, 1);
    this.px(x, hi, X, Y, 1, TILE - 1);
    this.px(x, 'stone4', X, Y + TILE - 2, TILE - 1, 1);
    this.px(x, 'stone4', X + TILE - 2, Y, 1, TILE - 1);
    for (let k = 0; k < 7; k++) {
      this.px(x, rand() < 0.5 ? 'stone4' : hi, X + 2 + Math.floor(rand() * 11), Y + 2 + Math.floor(rand() * 11));
    }
    if (rand() < 0.38) { // crack
      let cx = X + 3 + Math.floor(rand() * 9), cy = Y + 3 + Math.floor(rand() * 4);
      for (let k = 0; k < 6; k++) {
        this.px(x, 'stone3', cx, cy);
        cx += rand() < 0.5 ? 1 : 0; cy += 1;
        if (cx > X + 12 || cy > Y + 12) break;
      }
    }
    if (rand() < 0.32) { // moss creeping from an edge
      const edgeY = rand() < 0.5 ? Y + 1 : Y + TILE - 3;
      const mx = X + 1 + Math.floor(rand() * 9);
      this.px(x, 'moss2', mx, edgeY, 3, 1);
      this.px(x, 'moss3', mx + 1, edgeY + (edgeY === Y + 1 ? 1 : -1), 2, 1);
      if (rand() < 0.5) this.px(x, 'moss4', mx + 1, edgeY, 1, 1);
    }
    if (walked) {
      const n = clue(s.board, c, r);
      if (n > 0) {
        const sp = getSprites();
        const col: ColorKey = n >= 4 ? 'red2' : n === 3 ? 'warm4' : 'bone3';
        x.drawImage(sp.digit(n, 'void0').canvas, X + 7, Y + 6);
        x.drawImage(sp.digit(n, col).canvas, X + 6, Y + 5);
      } else {
        // a worn, safe stone: faint footprint
        this.px(x, 'stone7', X + 6, Y + 7, 1, 2);
        this.px(x, 'stone7', X + 8, Y + 5, 1, 2);
      }
    }
  }

  private drawStairs(x: CanvasRenderingContext2D): void {
    const y0 = TOP + ROWS * TILE;
    this.px(x, 'void1', 0, y0, SCENE_W, BOTTOM);
    for (let k = 0; k < 3; k++) {
      const w = 16 + k * 6;
      const sx = 3 * TILE + 8 - w / 2;
      this.px(x, k % 2 ? 'stone4' : 'stone5', sx, y0 + 1 + k * 3, w, 2);
      this.px(x, 'stone3', sx, y0 + 3 + k * 3, w, 1);
    }
  }

  private drawGrave(x: CanvasRenderingContext2D, i: number, g: GraveView): void {
    const c = i % COLS, r = Math.floor(i / COLS);
    const X = c * TILE, Y = TOP + r * TILE;
    // the pit itself shows as a dark mouth under the stone
    this.px(x, 'void0', X + 2, Y + 11, 12, 3);
    this.px(x, 'void1', X + 3, Y + 10, 10, 1);
    const sp = getSprites();
    x.drawImage((g.mine ? sp.stoneMine : sp.stone).canvas, X + 3, Y + 1);
    if (g.falls > 1) { // others fell here too: a second, older stone behind
      this.px(x, 'stone4', X + 11, Y + 4, 3, 7);
      this.px(x, 'stone6', X + 11, Y + 4, 3, 1);
    }
    if (isKnownLiar(g)) {
      for (let k = 0; k < 5; k++) {
        this.px(x, 'red2', X + 5 + k, Y + 3 + k);
        this.px(x, 'red1', X + 9 - k, Y + 3 + k);
      }
    }
    const n = candleCount(g);
    const spots = [[X + 1, Y + 11], [X + 14, Y + 11], [X + 1, Y + 7]];
    for (let k = 0; k < n; k++) {
      const [cx, cy] = spots[k]!;
      this.px(x, 'bone2', cx!, cy!, 1, 3);
      this.px(x, 'bone1', cx!, cy! + 2, 1, 1);
    }
  }

  // ── per frame ────────────────────────────────────────────────────────────
  private frame(now: number): void {
    const s = this.state;
    if (!s) return;
    this.ensureLayer(s);
    const t = now / 1000;
    const phaseP = (ms: number) => Math.min(1, (now - this.phaseT0) / ms);

    // movement
    let hop = 0;
    if (this.hopT0 >= 0) {
      const p = Math.min(1, (now - this.hopT0) / HOP_MS);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      this.pos.x = this.hopFrom.x + (s.player.c - this.hopFrom.x) * e;
      this.pos.y = this.hopFrom.y + (s.player.r - this.hopFrom.y) * e;
      hop = Math.sin(p * Math.PI) * 3;
      if (p >= 1) this.hopT0 = -1;
    }

    let fallP = 0, crossP = 0;
    if (s.phase === 'falling') {
      fallP = phaseP(FALL_MS);
      if (fallP >= 1 && this.lastPhase === 'falling') { this.lastPhase = 'fallen'; this.events.onFallDone?.(); }
    }
    if (s.phase === 'fallen') fallP = 1;
    if (s.phase === 'crossing') {
      crossP = phaseP(CROSS_MS);
      if (crossP >= 1 && this.lastPhase === 'crossing') { this.lastPhase = 'crossed'; this.events.onCrossDone?.(); }
    }
    if (s.phase === 'crossed') crossP = 1;

    // walking into the arch while crossing
    let walkY = this.pos.y;
    if (crossP > 0) walkY = s.player.r - Math.min(1, crossP / 0.45) * 1.15;
    const walkX = crossP > 0 ? this.pos.x + (3 - this.pos.x) * Math.min(1, crossP / 0.45) : this.pos.x;

    const ctx = this.ctx;
    ctx.save();
    ctx.drawImage(this.layer, 0, 0);

    // pit opening
    if (fallP > 0 && s.phase !== 'walking') {
      const fx = s.player.c * TILE + 8, fy = TOP + s.player.r * TILE + 9;
      const rr = 2 + Math.min(1, fallP / 0.5) * 5;
      ctx.fillStyle = C.void0;
      ctx.beginPath(); ctx.ellipse(fx, fy, rr, rr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }

    // wanderer
    const bob = this.reduced || hop ? 0 : Math.round(Math.sin(t * 2.2) * 0.6);
    const wx = Math.round(walkX * TILE + 4);
    let wy = Math.round(TOP + walkY * TILE + 3 - hop + bob);
    const showWanderer = s.phase !== 'fallen' && s.phase !== 'idle' && !(crossP > 0.62);
    if (showWanderer) {
      ctx.save();
      if (fallP > 0) {
        wy += Math.round(fallP * fallP * 12);
        ctx.beginPath();
        ctx.rect(0, 0, SCENE_W, TOP + s.player.r * TILE + 11);
        ctx.clip();
      }
      ctx.drawImage(getSprites().wanderer.canvas, wx, wy);
      ctx.restore();
    }

    // portcullis bars (rise while crossing)
    const lift = Math.round(Math.min(1, crossP / 0.3) * 14);
    for (let bx = ARCH.x0 + 2; bx <= ARCH.x1 - 1; bx += 3) {
      ctx.fillStyle = C.stone3;
      ctx.fillRect(bx, 6 - lift, 1, TOP - 6);
    }
    ctx.fillStyle = C.stone4;
    ctx.fillRect(ARCH.x0, TOP - 2 - lift, ARCH.x1 - ARCH.x0 + 1, 1);
    ctx.restore();

    // ── lighting ──
    const flick = this.reduced ? 1 : 1 + 0.045 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 13.1 + 1.3) + 0.02 * Math.sin(t * 31.0);
    const targetGlow = s.phase === 'fallen' || s.phase === 'idle' ? 0.25 : 1;
    this.lanternGlow += (targetGlow - this.lanternGlow) * 0.08;
    const LR = 2.7 * TILE * flick * this.lanternGlow * (1 - 0.7 * fallP);
    const lx = wx + 7, ly = wy + 6;
    const dawn = crossP > 0.4 ? Math.min(1, (crossP - 0.4) / 0.6) : 0;
    const lights: Light[] = [{ x: lx, y: ly, r: LR, k: 1.55, cr: 1, cg: 0.72, cb: 0.4 }];
    lights.push({ x: ARCH.cx, y: ARCH.cy + 2, r: 20, k: 0.55 + dawn, cr: 0.45, cg: 0.65, cb: 0.95 });
    s.graves.forEach((g, i) => {
      if (!g.carved) return;
      const gx = (i % COLS) * TILE + 8, gy = TOP + Math.floor(i / COLS) * TILE + 6;
      const pulse = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 1.7 + i);
      lights.push({ x: gx, y: gy, r: 18 * pulse, k: 0.9, cr: 0.38, cg: 0.7, cb: 1 });
      const n = candleCount(g);
      if (n) lights.push({ x: gx, y: gy + 6, r: 8 + n * 3, k: 0.5, cr: 1, cg: 0.75, cb: 0.4 });
    });
    if (crossP > 0.35) {
      const ig = Math.min(1, (crossP - 0.35) / 0.15);
      for (const bx of BRAZIERS) lights.push({ x: bx, y: 11, r: 34 * ig * flick, k: 1.2, cr: 1, cg: 0.7, cb: 0.4 });
    }
    const amb = 0.36 + dawn * 0.5;
    const ambR = amb * 0.8, ambG = amb * 0.9, ambB = amb * 1.2;

    const img = ctx.getImageData(0, 0, SCENE_W, SCENE_H);
    const d = img.data;
    const revealed = s.revealed;
    for (let y = 0; y < SCENE_H; y++) {
      const tr = Math.floor((y - TOP) / TILE);
      for (let x = 0; x < SCENE_W; x++) {
        let lr = ambR, lg = ambG, lb = ambB;
        for (let li = 0; li < lights.length; li++) {
          const L = lights[li]!;
          const dx = x - L.x, dy = y - L.y;
          if (dx > L.r || dx < -L.r || dy > L.r || dy < -L.r) continue;
          const dd = (dx * dx + dy * dy) / (L.r * L.r);
          if (dd >= 1) continue;
          const f = (1 - dd) * (1 - dd) * L.k;
          lr += L.cr * f; lg += L.cg * f; lb += L.cb * f;
        }
        if (tr >= 0 && tr < ROWS && revealed.has(tr * COLS + Math.floor(x / TILE))) { lr += 0.22; lg += 0.22; lb += 0.24; }
        const th = BAYER[(x & 3) | ((y & 3) << 2)]!;
        const qr = Math.min(1.35, Math.floor(lr * 6 + th) / 6);
        const qg = Math.min(1.35, Math.floor(lg * 6 + th) / 6);
        const qb = Math.min(1.35, Math.floor(lb * 6 + th) / 6);
        const o = (y * SCENE_W + x) * 4;
        const out = snap(Math.min(255, d[o]! * qr), Math.min(255, d[o + 1]! * qg), Math.min(255, d[o + 2]! * qb));
        d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2];
      }
    }

    // screen shake when the floor gives way
    let sx = 0, sy = 0;
    if (s.phase === 'falling' && fallP > 0.15 && fallP < 0.5 && !this.reduced) {
      sx = Math.round(Math.sin(now * 0.09) * 1.2); sy = Math.round(Math.cos(now * 0.11));
    }
    if (sx || sy) { ctx.fillStyle = C.void0; ctx.fillRect(0, 0, SCENE_W, SCENE_H); }
    ctx.putImageData(img, sx, sy);
    ctx.save();
    ctx.translate(sx, sy);

    // ── emissive layer ──
    const blink = (seed: number, rate: number) => hash2(Math.floor(t * rate), Math.floor(seed * 1000)) ;
    // stars in the arch
    for (const [stx, sty, sd] of [[50, 6, 1], [60, 8, 2], [54, 10, 3], [62, 5, 4]] as const) {
      if (blink(sd, 2) > 0.25) this.px(ctx, blink(sd, 3) > 0.5 ? 'bone3' : 'ghost3', stx, sty - Math.round(lift * 0));
    }
    // candle flames
    s.graves.forEach((g, i) => {
      const n = candleCount(g);
      const X = (i % COLS) * TILE, Y = TOP + Math.floor(i / COLS) * TILE;
      const spots = [[X + 1, Y + 10], [X + 14, Y + 10], [X + 1, Y + 6]];
      for (let k = 0; k < n; k++) {
        const [cx, cy] = spots[k]!;
        this.px(ctx, blink(i * 3 + k, 9) > 0.4 ? 'warm5' : 'warm4', cx!, cy!);
        if (blink(i * 5 + k, 7) > 0.7) this.px(ctx, 'warm3', cx!, cy! - 1);
      }
    });
    // lantern
    if (showWanderer && fallP < 0.7) {
      this.px(ctx, 'warm2', lx - 1, ly - 2, 3, 1);
      this.px(ctx, 'warm5', lx - 1, ly - 1, 3, 3);
      this.px(ctx, blink(1, 12) > 0.3 ? 'warm6' : 'warm5', lx, ly);
    }
    // brazier flames
    if (crossP > 0.35) {
      for (const bx of BRAZIERS) {
        for (let k = 0; k < 5; k++) {
          const h = 1 + Math.floor(blink(bx + k, 10) * 4);
          this.px(ctx, k === 2 ? 'warm6' : k % 2 ? 'warm5' : 'warm4', bx - 2 + k, 13 - h, 1, h);
        }
      }
    }
    // dust motes drifting in the lantern light
    if (!this.reduced && showWanderer) {
      for (const m of this.motes) {
        m.life -= 1 / 60;
        if (m.life < 0 || Math.hypot(m.x - lx, m.y - ly) > LR) {
          const a = hash2(Math.floor(t * 10), Math.floor(m.seed * 100)) * Math.PI * 2;
          const rr = Math.sqrt(hash2(Math.floor(m.seed * 77), Math.floor(t * 13))) * LR * 0.8;
          m.x = lx + Math.cos(a) * rr; m.y = ly + Math.sin(a) * rr;
          m.vx = (hash2(m.seed, Math.floor(t)) - 0.5) * 0.08; m.vy = -0.03 - hash2(Math.floor(t * 3), m.seed) * 0.06;
          m.life = 2 + hash2(Math.floor(m.seed), Math.floor(t * 5)) * 3;
        }
        m.x += m.vx + Math.sin(t * 1.3 + m.seed) * 0.03; m.y += m.vy;
        const dist = Math.hypot(m.x - lx, m.y - ly);
        if (dist < LR * 0.85 && blink(m.seed, 6) > 0.2) this.px(ctx, dist < LR * 0.4 ? 'warm5' : 'warm3', Math.round(m.x), Math.round(m.y));
      }
    }
    // step markers: corner brackets on stones you can step to
    if (s.phase === 'walking' && this.hopT0 < 0) {
      const pulse = this.reduced ? 1 : 0.5 + 0.5 * Math.sin(t * 4);
      const col: ColorKey = pulse > 0.5 ? 'warm5' : 'warm3';
      for (const n of neighbors(s.player.c, s.player.r)) {
        const g = s.graves.get(idx(n.c, n.r));
        if (g && g.carved) continue;
        const X = n.c * TILE, Y = TOP + n.r * TILE, e = TILE - 2;
        this.px(ctx, col, X + 1, Y + 1, 2, 1); this.px(ctx, col, X + 1, Y + 1, 1, 2);
        this.px(ctx, col, X + e - 1, Y + 1, 2, 1); this.px(ctx, col, X + e, Y + 1, 1, 2);
        this.px(ctx, col, X + 1, Y + e, 2, 1); this.px(ctx, col, X + 1, Y + e - 1, 1, 2);
        this.px(ctx, col, X + e - 1, Y + e, 2, 1); this.px(ctx, col, X + e, Y + e - 1, 1, 2);
      }
    }
    // debris falling into the pit
    if (s.phase === 'falling' && fallP < 0.8) {
      const fx = s.player.c * TILE + 8, fy = TOP + s.player.r * TILE + 9;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = 3 + fallP * 6;
        this.px(ctx, k % 2 ? 'stone7' : 'stone6', Math.round(fx + Math.cos(a) * rr), Math.round(fy + Math.sin(a) * rr * 0.6 + fallP * fallP * 8));
      }
    }
    ctx.restore();
  }
}
