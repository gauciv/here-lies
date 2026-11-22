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

  /** quiet draft and torch crackle while exploring */
  startAmbience(): void {
    const ctx = this.ensure();
    if (!ctx || this.ambience || !this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    lfo.start();
    const crackle = window.setInterval(() => {
      if (!this.ctx || Math.random() < 0.35) return;
      const at = this.ctx.currentTime + Math.random() * 0.2;
      this.burst(at, 0.02 + Math.random() * 0.03, 2500 + Math.random() * 2500, 2, 0.04 + Math.random() * 0.05, 'bandpass');
    }, 180);
    this.ambience = {
      stop: () => {
        window.clearInterval(crackle);
        try { src.stop(); lfo.stop(); } catch { /* already stopped */ }
      },
    };
  }

  stopAmbience(): void {
    this.ambience?.stop();
    this.ambience = null;
  }
}

export const sound = new Sound();
