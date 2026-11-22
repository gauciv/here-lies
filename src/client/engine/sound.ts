// All sound is synthesised with WebAudio: no files, nothing to license, tiny.
// Audio only starts after the player's first tap (browser autoplay rules).

type Cue = 'step' | 'fall' | 'carve' | 'vote' | 'cross' | 'deny' | 'crumble';

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

  /**
   * The dungeon's music: a breathing low drone, sparse bell notes wandering a
   * minor scale through a cave echo, the odd drip, a draft and the torch. It is
   * generative (never the same twice), quiet, and only starts after a tap.
   */
  startAmbience(): void {
    const ctx = this.ensure();
    if (!ctx || this.ambience || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    const timers: number[] = [];
    const nodes: AudioScheduledSourceNode[] = [];
    let stopped = false;

    // one bus for everything, fading in so it never starts abruptly
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(1, now + 4);
    bus.connect(this.master);

    // cave echo: a dark, decaying delay
    const echo = ctx.createDelay(1.5);
    echo.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1500;
    echo.connect(damp).connect(feedback).connect(echo);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    damp.connect(wet).connect(bus);

    // draft: filtered noise, slowly swelling
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const airF = ctx.createBiquadFilter();
    airF.type = 'lowpass';
    airF.frequency.value = 220;
    const airG = ctx.createGain();
    airG.gain.value = 0.03;
    const airLfo = ctx.createOscillator();
    airLfo.frequency.value = 0.07;
    const airLfoG = ctx.createGain();
    airLfoG.gain.value = 0.015;
    airLfo.connect(airLfoG).connect(airG.gain);
    air.connect(airF).connect(airG).connect(bus);
    nodes.push(air, airLfo);

    // drone: D and A, a little detuned so they shimmer, breathing slowly
    const drone = ctx.createGain();
    drone.gain.setValueAtTime(0.0001, now);
    drone.gain.exponentialRampToValueAtTime(0.045, now + 6);
    const droneF = ctx.createBiquadFilter();
    droneF.type = 'lowpass';
    droneF.frequency.value = 360;
    drone.connect(droneF).connect(bus);
    for (const [hz, type, level] of [[73.42, 'sine', 1], [73.9, 'sine', 0.6], [110, 'triangle', 0.35]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(drone);
      o.start();
      nodes.push(o);
    }
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.05;
    const breathG = ctx.createGain();
    breathG.gain.value = 0.015;
    breath.connect(breathG).connect(drone.gain);
    breath.start();
    nodes.push(breath);
    air.start();
    airLfo.start();

    // bells: sparse, mostly stepwise through D minor, so it feels like a slow tune
    const scale = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23];
    let note = 3;
    const nextBell = () => {
      if (stopped) return;
      timers.push(window.setTimeout(() => {
        if (stopped || !this.ctx) return;
        if (performance.now() > this.quietUntil) {
          note = Math.max(0, Math.min(scale.length - 1, note + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]!));
          const at = this.ctx.currentTime + 0.05;
          this.bell(bus, echo, at, scale[note]!, 0.045);
          if (Math.random() < 0.3) this.bell(bus, echo, at + 0.9, scale[Math.max(0, note - 2)]!, 0.03);
        }
        nextBell();
      }, 4000 + Math.random() * 5000));
    };
    nextBell();

    // drips: a high plink that falls in pitch, then echoes away
    const nextDrip = () => {
      if (stopped) return;
      timers.push(window.setTimeout(() => {
        if (stopped || !this.ctx) return;
        if (performance.now() > this.quietUntil) {
          const at = this.ctx.currentTime + 0.02;
          const o = this.ctx.createOscillator();
          o.type = 'sine';
          const hz = 1800 + Math.random() * 900;
          o.frequency.setValueAtTime(hz, at);
          o.frequency.exponentialRampToValueAtTime(hz * 0.55, at + 0.07);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.025, at + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
          o.connect(g);
          g.connect(echo);
          g.connect(bus);
          o.start(at);
          o.stop(at + 0.15);
        }
        nextDrip();
      }, 7000 + Math.random() * 9000));
    };
    nextDrip();

    // the torch, kept quiet underneath
    const crackle = window.setInterval(() => {
      if (!this.ctx || Math.random() < 0.4) return;
      const at = this.ctx.currentTime + Math.random() * 0.2;
      this.burst(at, 0.02 + Math.random() * 0.03, 2500 + Math.random() * 2500, 2, 0.025 + Math.random() * 0.035, 'bandpass');
    }, 200);

    this.ambience = {
      stop: () => {
        stopped = true;
        timers.forEach((t) => window.clearTimeout(t));
        window.clearInterval(crackle);
        const t = this.ctx?.currentTime ?? 0;
        bus.gain.cancelScheduledValues(t);
        bus.gain.setValueAtTime(bus.gain.value, t);
        bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        window.setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 500);
      },
    };
  }

  stopAmbience(): void {
    this.ambience?.stop();
    this.ambience = null;
  }
}

export const sound = new Sound();
