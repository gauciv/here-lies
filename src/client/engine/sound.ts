// All sound is synthesised with WebAudio: no files, nothing to license, tiny.
// Audio only starts after the player's first tap (browser autoplay rules).

type Cue = 'step' | 'fall' | 'carve' | 'vote' | 'deny' | 'crumble' | 'revive' | 'snuff' | 'victory' | 'door' | 'ignite' | 'ui' | 'page' | 'pop' | 'slab' | 'start' | 'death' | 'gameover';
export type Mode = 'dungeon' | 'camp' | 'quiet';

const VOLUME_KEY = { music: 'herelies:vol-music', sfx: 'herelies:vol-sfx' } as const;
export type Channel = keyof typeof VOLUME_KEY;
const BASE = 0.85;

const readVolume = (ch: Channel): number => {
  try {
    const v = Number(window.localStorage.getItem(VOLUME_KEY[ch]));
    return window.localStorage.getItem(VOLUME_KEY[ch]) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  } catch {
    return 1;
  }
};

class Sound {
  private ctx: AudioContext | null = null;
  /** sound effects go here */
  private master: GainNode | null = null;
  /** both soundtracks go here, so music and effects have their own volume */
  private music: GainNode | null = null;
  private volumes: Record<Channel, number> = { music: readVolume('music'), sfx: readVolume('sfx') };
  private noise: AudioBuffer | null = null;
  private ambience: { stop: () => void } | null = null;
  /** the old mute button is gone (Settings has volumes now), so an old 'muted' never traps anyone in silence */
  muted = false;

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
      // a gentle limiter on the way out: everything can be loud enough for a phone speaker without clipping
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 8;
      limiter.ratio.value = 10;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.2;
      limiter.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = BASE * this.volumes.sfx;
      this.master.connect(limiter);
      this.music = this.ctx.createGain();
      this.music.gain.value = BASE * this.volumes.music;
      this.music.connect(limiter);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  volume(ch: Channel): number {
    return this.volumes[ch];
  }

  /** 0..1, remembered on this device */
  setVolume(ch: Channel, v: number): void {
    const vol = Math.max(0, Math.min(1, v));
    this.volumes[ch] = vol;
    try {
      window.localStorage.setItem(VOLUME_KEY[ch], String(vol));
    } catch {
      /* per-viewer preference only */
    }
    const node = ch === 'music' ? this.music : this.master;
    if (node && this.ctx) node.gain.setTargetAtTime(BASE * vol, this.ctx.currentTime, 0.05);
  }

  /** filtered noise burst */
  private burst(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(master);
    src.start(at, Math.random() * 0.5, dur + 0.05);
  }

  private pulses: PeriodicWave | null = null;

  /**
   * A door creak: wood sticking and slipping on its hinge is a train of tiny clicks
   * whose rate wanders, ringing through a few wooden resonances. Ends with a soft
   * knock as the door swings against the wall.
   */
  private creak(at: number, dur: number): void {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    if (!this.pulses) {
      const n = 48;
      const real = new Float32Array(n), imag = new Float32Array(n);
      for (let k = 1; k < n; k++) real[k] = 1; // equal harmonics: a narrow click train
      this.pulses = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    }
    const o = ctx.createOscillator();
    o.setPeriodicWave(this.pulses);
    // the stick-slip rate: slow, catching, speeding up, dragging again
    const steps = 24;
    const curve = new Float32Array(steps);
    for (let k = 0; k < steps; k++) {
      const x = k / (steps - 1);
      curve[k] = 14 + 38 * Math.sin(Math.PI * Math.min(1, x * 1.2)) + (Math.random() - 0.5) * 10;
    }
    o.frequency.setValueCurveAtTime(curve, at, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + 0.08);
    g.gain.setValueAtTime(0.5, at + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    for (const [hz, q, lvl] of [[520, 14, 0.09], [1150, 16, 0.06], [2300, 18, 0.03]] as const) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(hz, at);
      f.frequency.linearRampToValueAtTime(hz * 1.12, at + dur * 0.5);
      f.frequency.linearRampToValueAtTime(hz * 0.95, at + dur);
      f.Q.value = q;
      const out = ctx.createGain();
      out.gain.value = lvl;
      g.connect(f).connect(out).connect(master);
    }
    o.start(at);
    o.stop(at + dur + 0.05);
    // the door knocks softly against the stone
    this.burst(at + dur - 0.05, 0.16, 260, 0.8, 0.14);
    this.tone(at + dur - 0.05, 0.14, 120, 0.06, 'triangle', 80);
  }

  private tone(at: number, dur: number, freq: number, gain: number, type: OscillatorType = 'sine', slideTo?: number): void {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.04, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /**
   * An 8-bit voice: a square (or triangle) wave, softened a little so it sits in
   * the dark rather than buzzing, with an optional slide and vibrato.
   */
  private chip(at: number, dur: number, hz: number, gain: number, opts: { type?: OscillatorType; slideTo?: number; vibrato?: number; into?: AudioNode; release?: number } = {}): void {
    const ctx = this.ctx, out = opts.into ?? this.master;
    if (!ctx || !out) return;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'square';
    o.frequency.setValueAtTime(hz, at);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, at + dur);
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(hz * opts.vibrato, at + Math.min(0.4, dur / 2));
      lfo.connect(depth).connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + dur + 0.05);
    }
    const soft = ctx.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 2600;
    const g = ctx.createGain();
    const release = opts.release ?? Math.min(0.25, dur / 2);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.setValueAtTime(gain, at + Math.max(0.011, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(soft).connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** a deep, struck stone bell with uneven partials: the toll of something ending */
  private toll(at: number, hz: number, gain: number): void {
    for (const [mult, lvl, len] of [[1, 1, 3.2], [2.76, 0.35, 1.8], [5.4, 0.15, 0.9], [0.5, 0.4, 3.6]] as const) {
      this.tone(at, len, hz * mult, gain * lvl, 'sine');
    }
    this.burst(at, 0.05, 1800, 1, gain * 1.2, 'bandpass');
  }

  play(cue: Cue): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    switch (cue) {
      case 'step': { // a boot on stone: a gritty scuff and a hollow tok, never quite the same twice
        const v = 0.85 + Math.random() * 0.3;
        this.burst(t, 0.06, 1100 * v, 1.2, 0.5, 'bandpass');
        this.burst(t + 0.01, 0.1, 380 * v, 0.9, 0.35);
        this.tone(t, 0.09, 240 * v, 0.16, 'triangle', 150 * v);
        break;
      }
      case 'ui': // a button pressed: a small stone tick
        this.burst(t, 0.025, 3000, 2, 0.12, 'bandpass');
        this.tone(t, 0.06, 880, 0.06, 'triangle', 640);
        break;
      case 'pop': // a comic panel appears
        this.tone(t, 0.09, 520, 0.07, 'triangle', 800);
        this.burst(t, 0.05, 2400, 1.5, 0.08, 'bandpass');
        break;
      case 'page': { // paper: a page turning
        const ctxP = this.ctx;
        if (!ctxP || !this.master || !this.noise) break;
        const src = ctxP.createBufferSource();
        src.buffer = this.noise;
        const f = ctxP.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 0.9;
        f.frequency.setValueAtTime(700, t);
        f.frequency.exponentialRampToValueAtTime(3200, t + 0.28);
        const g = ctxP.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, Math.random() * 0.5, 0.4);
        break;
      }
      case 'slab': // reading a slab: stone grinds on stone
        this.burst(t, 0.22, 650, 1.4, 0.3, 'bandpass');
        this.tone(t, 0.2, 170, 0.08, 'triangle', 120);
        break;
      case 'fall': // stone cracks, gives way, long drop, distant thud
        this.burst(t, 0.12, 2400, 1.2, 0.35, 'bandpass');
        this.burst(t + 0.06, 0.7, 260, 0.6, 0.6);
        this.tone(t + 0.05, 0.75, 180, 0.18, 'triangle', 40);
        this.burst(t + 0.85, 0.25, 140, 0.7, 0.5);
        break;
      case 'carve': // three chisel taps
        for (let k = 0; k < 3; k++) {
          this.burst(t + k * 0.13, 0.05, 3200, 3, 0.28, 'bandpass');
          this.tone(t + k * 0.13, 0.06, 1900 - k * 120, 0.05, 'square');
        }
        break;
      case 'vote':
        this.burst(t, 0.04, 1800, 2, 0.2, 'bandpass');
        this.tone(t, 0.12, 660, 0.06, 'triangle');
        break;
      case 'crumble': // a crack, then grit and pebbles settling, then dust
        this.burst(t, 0.07, 1800, 1.5, 0.4, 'bandpass');
        this.tone(t, 0.12, 140, 0.12, 'triangle', 70);
        for (let k = 0; k < 9; k++) {
          const at = t + 0.06 + k * 0.045 + Math.random() * 0.03;
          this.burst(at, 0.03 + Math.random() * 0.03, 900 + Math.random() * 1600, 2.5, 0.12 + Math.random() * 0.1, 'bandpass');
        }
        this.burst(t + 0.15, 0.6, 500, 0.5, 0.12);
        break;
      case 'revive': { // an airy rush upward, then a soft rising chime
        const ctxN = this.ctx;
        if (!ctxN || !this.master || !this.noise) break;
        const src = ctxN.createBufferSource();
        src.buffer = this.noise;
        const f = ctxN.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.4;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.8);
        const g = ctxN.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        src.connect(f).connect(g).connect(this.master);
        src.start(t, 0, 1);
        [293.66, 349.23, 440, 587.33].forEach((hz, k) => this.tone(t + 0.25 + k * 0.11, 1.4, hz, 0.06, 'sine'));
        break;
      }
      case 'victory': { // a little 8-bit fanfare: up the D major chord, a held high note, sparkles falling
        const lead = [[293.66, 0], [369.99, 0.1], [440, 0.2], [587.33, 0.3], [440, 0.5], [587.33, 0.6]] as const;
        lead.forEach(([hz, d]) => this.chip(t + d, 0.11, hz, 0.075));
        this.chip(t + 0.72, 1.3, 739.99, 0.08, { vibrato: 0.012, release: 0.7 });
        this.chip(t + 0.72, 1.3, 587.33, 0.05, { vibrato: 0.012, release: 0.7 });
        // the bass walks under it on a triangle, like an old cartridge's
        [[146.83, 0], [146.83, 0.3], [220, 0.6]].forEach(([hz, d]) => this.chip(t + d!, 0.26, hz!, 0.16, { type: 'triangle' }));
        this.chip(t + 0.72, 1.4, 146.83, 0.18, { type: 'triangle', release: 0.8 });
        // twinkles tumbling down
        [2349.32, 1975.53, 1760, 1479.98, 1174.66].forEach((hz, k) => this.chip(t + 1.0 + k * 0.08, 0.1, hz, 0.025));
        this.burst(t + 0.72, 0.6, 6000, 0.7, 0.05, 'highpass');
        break;
      }
      case 'start': { // into the Deep: a low boom under the door, then three notes climbing somewhere they shouldn't
        this.tone(t, 1.2, 90, 0.3, 'triangle', 42);
        this.burst(t, 0.9, 220, 0.7, 0.3);
        [[293.66, 0.35], [440, 0.7], [622.25, 1.05]].forEach(([hz, d]) => this.chip(t + d!, 0.9, hz!, 0.045, { vibrato: 0.01, release: 0.6 }));
        this.chip(t + 0.35, 1.8, 73.42 * 2, 0.12, { type: 'triangle', release: 1 });
        break;
      }
      case 'death': { // the ghost rises: a falling minor line, a breath of air, a thin hollow note left hanging
        [[440, 0], [349.23, 0.2], [293.66, 0.4], [277.18, 0.6]].forEach(([hz, d]) => this.chip(t + d!, 0.22, hz!, 0.06));
        this.chip(t + 0.82, 1.2, 277.18, 0.045, { vibrato: 0.02, slideTo: 261.63, release: 0.8 });
        this.chip(t, 1.6, 73.42 * 2, 0.14, { type: 'triangle', release: 1 });
        const ctxD = this.ctx;
        if (ctxD && this.master && this.noise) {
          const src = ctxD.createBufferSource();
          src.buffer = this.noise;
          const f = ctxD.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = 2;
          f.frequency.setValueAtTime(400, t);
          f.frequency.exponentialRampToValueAtTime(1800, t + 1.4);
          const g = ctxD.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.08, t + 0.5);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
          src.connect(f).connect(g).connect(this.master);
          src.start(t, Math.random() * 0.4, 1.6);
        }
        break;
      }
      case 'gameover': { // the last candle: a stone bell tolls three times under a slow, sinking 8-bit line
        [0, 1.1, 2.2].forEach((d) => this.toll(t + d, 73.42 * 2, 0.16));
        [[587.33, 0], [523.25, 0.45], [466.16, 0.9], [440, 1.35], [349.23, 1.8], [293.66, 2.25]].forEach(([hz, d], k) =>
          this.chip(t + d!, k === 5 ? 1.8 : 0.42, hz!, 0.055, { vibrato: k === 5 ? 0.02 : 0, release: k === 5 ? 1.2 : 0.15 }));
        this.chip(t + 2.25, 2, 146.83, 0.14, { type: 'triangle', release: 1.4 });
        break;
      }
      case 'door': // an old wooden door creaks open and knocks against the wall
        this.creak(t, 1.15);
        break;
      case 'ignite': // a torch catches: a soft whoosh, then a few crackles
        this.burst(t, 0.35, 500, 0.8, 0.12, 'bandpass');
        this.burst(t + 0.05, 0.5, 1400, 0.6, 0.05, 'bandpass');
        [0.22, 0.31, 0.45, 0.58].forEach((d, k) => this.burst(t + d, 0.03, 2400 + k * 500, 2, 0.05, 'highpass'));
        break;
      case 'snuff': // a candle pinched out: a short hiss and a breath of smoke
        this.burst(t, 0.18, 5200, 0.8, 0.12, 'highpass');
        this.burst(t + 0.05, 0.35, 900, 0.7, 0.05);
        break;
      case 'deny':
        this.tone(t, 0.12, 180, 0.08, 'square', 140);
        break;
    }
  }

  private quietUntil = 0;

  /** Pause the melody for a moment (after a fall, the dungeon holds its breath). */
  hush(ms: number): void {
    this.quietUntil = performance.now() + ms;
  }

  /** a soft struck bell: fundamental plus a quiet octave, sent into the cave echo */
  private bell(bus: GainNode, echo: AudioNode, at: number, hz: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 3.2);
    for (const [mult, level] of [[1, 1], [2, 0.28], [3.01, 0.08]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(env);
      o.start(at);
      o.stop(at + 3.3);
    }
    env.connect(bus);
    env.connect(echo);
  }

  private mode: Mode = 'camp';

  /** true once the player has tapped and sound has been allowed to start */
  get started(): boolean {
    return this.ctx !== null;
  }

  /**
   * Switch soundtracks: eerie in the dungeon, the music box at camp, only the
   * wind for the moments between. The old one fades out under the new one, so
   * the change is never a cut. Only plays after a tap.
   */
  setMode(mode: Mode): void {
    if (mode === this.mode && this.ambience) return;
    this.mode = mode;
    this.stopAmbience();
    this.startAmbience();
  }

  /** Shared plumbing for both soundtracks: a fading-in bus and a dark cave echo. */
  private musicBus(ctx: AudioContext, master: GainNode) {
    const now = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(1, now + 2.5);
    bus.connect(master);
    const echo = ctx.createDelay(1.5);
    echo.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.36;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1500;
    echo.connect(damp).connect(feedback).connect(echo);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    damp.connect(wet).connect(bus);
    return { bus, echo };
  }

  startAmbience(): void {
    const ctx = this.ensure();
    if (!ctx || this.ambience || !this.master || !this.noise) return;
    const timers: number[] = [];
    const nodes: AudioScheduledSourceNode[] = [];
    let stopped = false;
    const { bus, echo } = this.musicBus(ctx, this.music ?? this.master);
    const every = (minMs: number, maxMs: number, fn: () => void) => {
      const next = () => {
        if (stopped) return;
        timers.push(window.setTimeout(() => { if (!stopped && this.ctx) fn(); next(); }, minMs + Math.random() * (maxMs - minMs)));
      };
      next();
    };
    const osc = (type: OscillatorType, hz: number, level: number, into: AudioNode) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(into);
      o.start();
      nodes.push(o);
      return o;
    };
    const fireCrackle = (rate: number, loud: number) => window.setInterval(() => {
      if (!this.ctx || Math.random() < 0.35) return;
      const at = this.ctx.currentTime + Math.random() * 0.2;
      this.burst(at, 0.02 + Math.random() * 0.03, 2200 + Math.random() * 2800, 2, loud * (0.5 + Math.random() * 0.6), 'bandpass');
    }, rate);
    let crackle = 0;

    // wind through the tunnels: noise drifting slowly through a narrow band
    const wind = (level: number) => {
      if (!this.noise) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = 0.5;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 3;
      f.frequency.value = 520;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const depth = ctx.createGain();
      depth.gain.value = 260;
      lfo.connect(depth).connect(f.frequency);
      const g = ctx.createGain();
      g.gain.value = level;
      src.connect(f).connect(g).connect(bus);
      src.start();
      lfo.start();
      nodes.push(src, lfo);
    };

    if (this.mode === 'quiet') {
      // between places: only the wind, and something low and far away
      wind(0.05);
      const low = ctx.createGain();
      low.gain.value = 0.02;
      low.connect(bus);
      osc('triangle', 146.83, 1, low);
    } else if (this.mode === 'dungeon') {
      // drone: D with a grinding E-flat a minor second above, low and filtered
      const drone = ctx.createGain();
      drone.gain.setValueAtTime(0.0001, ctx.currentTime);
      drone.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 650;
      drone.connect(lp).connect(bus);
      // pitched where a phone speaker can actually play it
      osc('sawtooth', 146.83, 0.5, drone);
      osc('sawtooth', 155.56, 0.25, drone);
      osc('triangle', 220.0, 0.3, drone);
      // a slow wobble on the filter keeps the drone uneasy
      const wob = ctx.createOscillator();
      wob.frequency.value = 0.09;
      const wobG = ctx.createGain();
      wobG.gain.value = 200;
      wob.connect(wobG).connect(lp.frequency);
      wob.start();
      nodes.push(wob);
      wind(0.06);
      // heartbeat: lub-dub, slow and steady
      every(1500, 1700, () => {
        if (performance.now() < this.quietUntil || !this.ctx) return;
        const at = this.ctx.currentTime + 0.02;
        this.tone(at, 0.16, 116, 0.12, 'triangle', 80);
        this.tone(at + 0.2, 0.14, 104, 0.085, 'triangle', 76);
      });
      // the dungeon's song: a lone 8-bit voice wandering D phrygian, never settling,
      // its notes ringing off the walls. Silent for a while after you fall.
      const scale = [293.66, 311.13, 349.23, 392.0, 415.3, 440.0, 523.25, 587.33, 622.25];
      let note = 0;
      const wander = () => {
        if (!this.ctx || performance.now() < this.quietUntil) return;
        const at = this.ctx.currentTime + 0.05;
        const run = 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < run; k++) {
          note = Math.max(0, Math.min(scale.length - 1, note + [-2, -1, -1, 1, 1, 2, 3][Math.floor(Math.random() * 7)]!));
          const hz = scale[note]!;
          this.chip(at + k * 0.55, 0.9, hz, 0.03, { into: bus, vibrato: 0.008, release: 0.7 });
          this.chip(at + k * 0.55, 0.9, hz, 0.022, { into: echo, release: 0.7 });
        }
      };
      timers.push(window.setTimeout(wander, 3000));
      every(3200, 6200, wander);
      // now and then the floor answers: a slow triangle figure far below
      every(15000, 22000, () => {
        if (!this.ctx || performance.now() < this.quietUntil) return;
        const at = this.ctx.currentTime + 0.05;
        [146.83, 220.0, 207.65, 146.83].forEach((hz, k) => this.chip(at + k * 0.7, 0.8, hz, 0.07, { type: 'triangle', into: bus, release: 0.5 }));
      });
      // eerie bells: tritones, slightly detuned, far apart
      const eerie = [146.83, 207.65, 155.56, 220.0, 293.66, 415.3];
      every(9000, 16000, () => {
        if (performance.now() < this.quietUntil || !this.ctx) return;
        const at = this.ctx.currentTime + 0.05;
        const k = Math.floor(Math.random() * (eerie.length - 1));
        this.bell(bus, echo, at, eerie[k]! * 2.008, 0.035);
        this.bell(bus, echo, at + 0.6, eerie[k + 1]! * 1.994, 0.03);
      });
      // a distant metallic scrape now and then
      every(14000, 26000, () => {
        if (!this.ctx || !this.noise) return;
        const at = this.ctx.currentTime + 0.05;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noise;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 18;
        f.frequency.setValueAtTime(900, at);
        f.frequency.linearRampToValueAtTime(620, at + 1.2);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.05, at + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
        src.connect(f).connect(g);
        g.connect(echo);
        src.start(at, Math.random(), 1.4);
      });
      // drips
      every(7000, 15000, () => {
        if (!this.ctx) return;
        const at = this.ctx.currentTime + 0.02;
        const hz = 1700 + Math.random() * 900;
        const o = this.ctx.createOscillator();
        o.frequency.setValueAtTime(hz, at);
        o.frequency.exponentialRampToValueAtTime(hz * 0.55, at + 0.07);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.02, at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
        o.connect(g);
        g.connect(echo);
        o.start(at);
        o.stop(at + 0.15);
      });
      crackle = fireCrackle(200, 0.07); // the torch
    } else {
      // camp: warm pads drifting between Dmaj7 and Gmaj7, the music box over them, a cosy fire
      const chords = [[146.83, 185.0, 220.0, 277.18], [98.0, 123.47, 146.83, 185.0]];
      let which = 0;
      const pad = (at: number, notes: number[]) => {
        if (!this.ctx) return;
        for (const hz of notes) {
          const o = this.ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = hz;
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.04, at + 2.2);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 8.5);
          o.connect(g).connect(bus);
          o.start(at);
          o.stop(at + 8.6);
        }
      };
      pad(ctx.currentTime + 0.1, chords[0]!);
      every(7000, 7000, () => {
        if (!this.ctx) return;
        which = 1 - which;
        pad(this.ctx.currentTime + 0.05, chords[which]!);
      });
      // the music box: a slow tune in D major, one phrase across each pair of chords
      const phrases = [
        [587.33, 739.99, 880.0, 783.99, 739.99, 659.25, 587.33, 0],
        [587.33, 554.37, 493.88, 440.0, 493.88, 554.37, 440.0, 0],
        [739.99, 659.25, 587.33, 554.37, 587.33, 0, 440.0, 0],
        [493.88, 554.37, 587.33, 659.25, 587.33, 554.37, 587.33, 0],
      ];
      let phrase = 0;
      const playPhrase = () => {
        if (!this.ctx) return;
        const at = this.ctx.currentTime + 0.05;
        (phrases[phrase++ % phrases.length] ?? []).forEach((hz, k) => { if (hz) this.bell(bus, echo, at + k * 0.62, hz, 0.07); });
      };
      timers.push(window.setTimeout(playPhrase, 1500));
      every(7000, 7000, playPhrase);
      crackle = fireCrackle(120, 0.12); // the campfire
    }

    this.ambience = {
      stop: () => {
        stopped = true;
        timers.forEach((t) => window.clearTimeout(t));
        window.clearInterval(crackle);
        const t = this.ctx?.currentTime ?? 0;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
        bus.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        window.setTimeout(() => { nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }); bus.disconnect(); }, 2000);
      },
    };
  }

  stopAmbience(): void {
    this.ambience?.stop();
    this.ambience = null;
  }
}

export const sound = new Sound();
