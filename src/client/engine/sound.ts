// All sound is synthesised with WebAudio: no files, nothing to license, tiny.
// Audio only starts after the player's first tap (browser autoplay rules).

type Cue = 'step' | 'fall' | 'carve' | 'vote' | 'cross' | 'deny' | 'crumble' | 'revive' | 'snuff' | 'victory' | 'door';

const MUTE_KEY = 'herelies:muted';

const readMuted = (): boolean => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
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
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
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
      case 'step': // boot on stone
        this.burst(t, 0.09, 420 + Math.random() * 120, 0.8, 0.55);
        this.tone(t, 0.07, 95, 0.12, 'sine', 70);
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
      case 'victory': { // a deep stone boom, a rising brassy D-major flourish, a bell shimmer
        this.tone(t, 0.9, 73.42, 0.16, 'triangle', 55);
        this.burst(t, 0.5, 180, 0.6, 0.2);
        const notes = [293.66, 369.99, 440, 587.33];
        notes.forEach((hz, k) => {
          this.tone(t + 0.12 + k * 0.13, 0.5, hz, 0.07, 'sawtooth');
          this.tone(t + 0.12 + k * 0.13, 0.9, hz, 0.06, 'triangle');
        });
        [587.33, 739.99, 880].forEach((hz) => this.tone(t + 0.7, 2.6, hz, 0.05, 'triangle'));
        [1174.66, 1479.98, 1760].forEach((hz, k) => this.tone(t + 0.75 + k * 0.09, 1.8, hz, 0.025, 'sine'));
        break;
      }
      case 'door': { // the old door groans open
        const ctxD = this.ctx;
        if (!ctxD || !this.master) break;
        const o = ctxD.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(95, t);
        o.frequency.linearRampToValueAtTime(140, t + 0.45);
        o.frequency.linearRampToValueAtTime(88, t + 0.85);
        const f = ctxD.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 800;
        f.Q.value = 7;
        const g = ctxD.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(f).connect(g).connect(this.master);
        o.start(t);
        o.stop(t + 0.95);
        this.burst(t + 0.85, 0.2, 160, 0.7, 0.18);
        break;
      }
      case 'snuff': // a candle pinched out: a short hiss and a breath of smoke
        this.burst(t, 0.18, 5200, 0.8, 0.12, 'highpass');
        this.burst(t + 0.05, 0.35, 900, 0.7, 0.05);
        break;
      case 'deny':
        this.tone(t, 0.12, 180, 0.08, 'square', 140);
        break;
      case 'cross': { // door creaks open, then a warm chord swells
        const ctxN = this.ctx;
        if (!ctxN || !this.master) break;
        const o = ctxN.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(110, t);
        o.frequency.linearRampToValueAtTime(150, t + 0.5);
        o.frequency.linearRampToValueAtTime(95, t + 0.9);
        const f = ctxN.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 6;
        const g = ctxN.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        o.connect(f).connect(g).connect(this.master);
        o.start(t);
        o.stop(t + 1);
        [261.6, 329.6, 392, 523.3].forEach((hz, k) => this.tone(t + 0.9 + k * 0.12, 2.2, hz, 0.07));
        break;
      }
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
    const { bus, echo } = this.musicBus(ctx, this.master);
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
      drone.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      drone.connect(lp).connect(bus);
      osc('sawtooth', 73.42, 0.5, drone);
      osc('sawtooth', 77.78, 0.32, drone);
      osc('sine', 36.71, 0.8, drone);
      // a slow wobble on the filter keeps the drone uneasy
      const wob = ctx.createOscillator();
      wob.frequency.value = 0.09;
      const wobG = ctx.createGain();
      wobG.gain.value = 60;
      wob.connect(wobG).connect(lp.frequency);
      wob.start();
      nodes.push(wob);
      // heartbeat: lub-dub, slow and steady
      every(1500, 1700, () => {
        if (performance.now() < this.quietUntil || !this.ctx) return;
        const at = this.ctx.currentTime + 0.02;
        this.tone(at, 0.16, 58, 0.16, 'sine', 40);
        this.tone(at + 0.2, 0.14, 52, 0.11, 'sine', 38);
      });
      // eerie bells: tritones, slightly detuned, far apart
      const eerie = [146.83, 207.65, 155.56, 220.0, 293.66, 415.3];
      every(6000, 12000, () => {
        if (performance.now() < this.quietUntil || !this.ctx) return;
        const at = this.ctx.currentTime + 0.05;
        const k = Math.floor(Math.random() * (eerie.length - 1));
        this.bell(bus, echo, at, eerie[k]! * 1.004, 0.035);
        this.bell(bus, echo, at + 0.6, eerie[k + 1]! * 0.997, 0.028);
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
      crackle = fireCrackle(220, 0.045);
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
          g.gain.exponentialRampToValueAtTime(0.022, at + 2.2);
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
      const pent = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
      let note = 2;
      every(2600, 5200, () => {
        if (!this.ctx) return;
        note = Math.max(0, Math.min(pent.length - 1, note + [-1, -1, 1, 1, 2, -2][Math.floor(Math.random() * 6)]!));
        this.bell(bus, echo, this.ctx.currentTime + 0.05, pent[note]!, 0.03);
      });
      crackle = fireCrackle(140, 0.07);
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
