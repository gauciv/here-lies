// All sound is synthesised with WebAudio: no files, nothing to license, tiny.
// Audio only starts after the player's first tap (browser autoplay rules).

type Cue = 'step' | 'fall' | 'carve' | 'vote' | 'deny' | 'crumble' | 'revive' | 'snuff' | 'victory' | 'door' | 'ignite' | 'ui' | 'page' | 'pop' | 'slab';

const MUTE_KEY = 'herelies:muted';
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

const readMuted = (): boolean => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
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
  muted = readMuted();

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

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      window.localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* per-viewer preference only */
    }
    if (m) this.stopAmbience();
    else this.startAmbience();
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
      case 'victory': { // through the door: a soft rising bell chord, then a shimmer (no boom)
        [293.66, 369.99, 440, 587.33].forEach((hz, k) => this.tone(t + k * 0.12, 1.8, hz, 0.055, 'triangle'));
        [587.33, 739.99, 880].forEach((hz) => this.tone(t + 0.5, 2.4, hz, 0.03, 'sine'));
        [1174.66, 1479.98, 1760].forEach((hz, k) => this.tone(t + 0.6 + k * 0.09, 1.8, hz, 0.02, 'sine'));
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

  private mode: 'dungeon' | 'camp' = 'dungeon';

  /** Switch soundtracks: tense in the dungeon, calm at camp. Only plays after a tap. */
  setMode(mode: 'dungeon' | 'camp'): void {
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
    bus.gain.exponentialRampToValueAtTime(1, now + 3);
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

    if (this.mode === 'dungeon') {
      // drone: D with a grinding E-flat a minor second above, low and filtered
      const drone = ctx.createGain();
      drone.gain.setValueAtTime(0.0001, ctx.currentTime);
      drone.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      drone.connect(lp).connect(bus);
      // pitched where a phone speaker can actually play it
      osc('sawtooth', 146.83, 0.5, drone);
      osc('sawtooth', 155.56, 0.28, drone);
      osc('triangle', 220.0, 0.35, drone);
      // a slow wobble on the filter keeps the drone uneasy
      const wob = ctx.createOscillator();
      wob.frequency.value = 0.09;
      const wobG = ctx.createGain();
      wobG.gain.value = 220;
      wob.connect(wobG).connect(lp.frequency);
      wob.start();
      nodes.push(wob);
      // heartbeat: lub-dub, slow and steady
      every(1500, 1700, () => {
        if (performance.now() < this.quietUntil || !this.ctx) return;
        const at = this.ctx.currentTime + 0.02;
        // a low thud with enough overtones to be heard on small speakers
        this.tone(at, 0.16, 116, 0.14, 'triangle', 80);
        this.tone(at + 0.2, 0.14, 104, 0.1, 'triangle', 76);
      });
      // the theme: a slow music-box line in D minor, echoing in the dark
      const phrases = [
        [587.33, 698.46, 880.0, 783.99, 698.46, 659.25, 587.33, 0],
        [587.33, 523.25, 466.16, 440.0, 466.16, 523.25, 440.0, 0],
        [698.46, 659.25, 587.33, 554.37, 587.33, 0, 440.0, 0],
      ];
      let phrase = 0;
      const playPhrase = () => {
        if (!this.ctx || performance.now() < this.quietUntil) return;
        const at = this.ctx.currentTime + 0.05;
        (phrases[phrase++ % phrases.length] ?? []).forEach((hz, k) => { if (hz) this.bell(bus, echo, at + k * 0.62, hz, 0.075); });
      };
      timers.push(window.setTimeout(playPhrase, 2500));
      every(9500, 9500, playPhrase);
      // eerie bells: tritones, slightly detuned, far apart
      const eerie = [146.83, 207.65, 155.56, 220.0, 293.66, 415.3];
      every(6000, 12000, () => {
        if (performance.now() < this.quietUntil || !this.ctx) return;
        const at = this.ctx.currentTime + 0.05;
        const k = Math.floor(Math.random() * (eerie.length - 1));
        this.bell(bus, echo, at, eerie[k]! * 2.008, 0.05);
        this.bell(bus, echo, at + 0.6, eerie[k + 1]! * 1.994, 0.04);
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
      crackle = fireCrackle(200, 0.08); // the torch
    } else {
      // camp: warm pads drifting between Dmaj7 and Gmaj7, gentle plucks, a cosy fire
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
          g.gain.exponentialRampToValueAtTime(0.045, at + 2.2);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 8.5);
          o.connect(g).connect(bus);
          o.start(at);
          o.stop(at + 8.6);
        }
      };
      pad(ctx.currentTime + 0.1, chords[0]!);
      // each chord, a slow plucked arpeggio an octave up, like a lute by the fire
      const pluck = (at: number, notes: number[]) => notes.forEach((hz, k) => this.bell(bus, echo, at + k * 0.42, hz * 2, 0.05));
      pluck(ctx.currentTime + 0.6, chords[0]!);
      every(7000, 7000, () => {
        if (!this.ctx) return;
        which = 1 - which;
        pad(this.ctx.currentTime + 0.05, chords[which]!);
        pluck(this.ctx.currentTime + 0.6, chords[which]!);
      });
      const pent = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
      let note = 2;
      every(2600, 5200, () => {
        if (!this.ctx) return;
        note = Math.max(0, Math.min(pent.length - 1, note + [-1, -1, 1, 1, 2, -2][Math.floor(Math.random() * 6)]!));
        this.bell(bus, echo, this.ctx.currentTime + 0.05, pent[note]!, 0.05);
      });
      crackle = fireCrackle(120, 0.13); // the campfire
    }

    this.ambience = {
      stop: () => {
        stopped = true;
        timers.forEach((t) => window.clearTimeout(t));
        window.clearInterval(crackle);
        const t = this.ctx?.currentTime ?? 0;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
        bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        window.setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 600);
      },
    };
  }

  stopAmbience(): void {
    this.ambience?.stop();
    this.ambience = null;
  }
}

export const sound = new Sound();
