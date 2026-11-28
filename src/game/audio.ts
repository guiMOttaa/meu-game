export interface VoiceClipSpec {
  start: number;
  duration: number;
  text: string;
}

export const NPC_VOICE_CLIPS: VoiceClipSpec[] = [
  {
    start: 0.68,
    duration: 2.55,
    text: 'Ei, garoto. Tome cuidado.',
  },
  {
    start: 4.08,
    duration: 4.82,
    text: 'As coisas depois desse portão... vão ficar diferentes.',
  },
  {
    start: 10.32,
    duration: 3.46,
    text: 'Um amigo meu foi pra lá... e nunca mais voltou.',
  },
  {
    start: 15.1,
    duration: 3.85,
    text: 'Tenho medo de continuar aqui dentro.',
  },
];

const USER_VOICE_URL = '/assets/aistudio/Grava__o_97704bb7.m4a';
const WAKE_AUDIO_URL = '/assets/aistudio/1127__1__45f89282.MP3';
const TV_NEWS_AUDIO_URL = '/assets/aistudio/tv_fa2ac788.MP3';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private ambienceGain: GainNode | null = null;
  private ambienceNodes: AudioNode[] = [];
  private ambienceTimers: number[] = [];
  private ambienceRunning = false;
  private stepToggle = false;

  private brownNoiseBuffer: AudioBuffer | null = null;
  private stoneReverbBuffer: AudioBuffer | null = null;
  private wakeReverbBuffer: AudioBuffer | null = null;
  private userVoiceBuffer: AudioBuffer | null = null;
  private voiceLoadingPromise: Promise<AudioBuffer | null> | null = null;
  private wakeRawBytesPromise: Promise<ArrayBuffer | null> | null = null;
  private wakeBuffer: AudioBuffer | null = null;
  private wakeLoadingPromise: Promise<AudioBuffer | null> | null = null;
  private activeVoiceSources: AudioBufferSourceNode[] = [];
  private activeWakeNodes: AudioNode[] = [];
  private wakeCleanupTimer: number | null = null;
  private cutsceneDroneNodes: AudioNode[] = [];
  private cutsceneDroneGain: GainNode | null = null;
  private tvAudioEl: HTMLAudioElement | null = null;
  private tvNewsEndedCb: (() => void) | null = null;
  private tvStaticNodes: AudioNode[] = [];
  private tvStaticGain: GainNode | null = null;
  private tvStaticTimer: number | null = null;

  private musicVolume = 0.75;
  private speechVolume = 0.9;
  private voiceEnabled = true;
  private monoAudio = false;
  private outputNode: GainNode | null = null;
  private mediaElementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

  private applyChannelRouting(ctx: AudioContext): void {
    if (!this.outputNode) return;
    if (this.monoAudio) {
      this.outputNode.channelCount = 1;
      this.outputNode.channelCountMode = 'explicit';
      this.outputNode.channelInterpretation = 'speakers';
    } else {
      const maxCh = Math.max(2, ctx.destination.maxChannelCount || 2);
      this.outputNode.channelCount = Math.min(2, maxCh);
      this.outputNode.channelCountMode = 'max';
      this.outputNode.channelInterpretation = 'speakers';
    }
  }

  private getOutputDestination(ctx: AudioContext): AudioNode {
    if (!this.outputNode) {
      this.outputNode = ctx.createGain();
      this.outputNode.gain.value = 1;
      this.applyChannelRouting(ctx);
      this.outputNode.connect(ctx.destination);
    }
    return this.outputNode;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx) {
      this.getOutputDestination(this.ctx);
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public applySettings(settings: {
    musicVolume: number;
    speechVolume: number;
    mode: 'dubbed' | 'subtitled';
    monoAudio?: boolean;
  }): void {
    this.musicVolume = Math.max(0, Math.min(1, settings.musicVolume));
    this.speechVolume = Math.max(0, Math.min(1, settings.speechVolume));
    this.voiceEnabled = settings.mode === 'dubbed';
    if (typeof settings.monoAudio === 'boolean') {
      this.monoAudio = settings.monoAudio;
      if (this.ctx) {
        this.applyChannelRouting(this.ctx);
      }
    }

    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.setTargetAtTime(
        this.muted ? 0 : 0.095 * this.musicVolume,
        this.ctx.currentTime,
        0.15
      );
    }
    if (!this.voiceEnabled || this.speechVolume <= 0.005) {
      this.stopActiveVoice();
    }
    this.updateTvAudioLevels();
  }

  public syncMediaElement(audio: HTMLAudioElement | null, forceMono = this.monoAudio): void {
    if (!audio || typeof window === 'undefined') return;
    const existingSource = this.mediaElementSources.get(audio);
    if (!forceMono && !existingSource) {
      return;
    }
    let ctx = this.ctx;
    if (!ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();
      this.ctx = ctx;
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const dest = this.getOutputDestination(ctx);
    if (!existingSource) {
      try {
        const source = ctx.createMediaElementSource(audio);
        source.connect(dest);
        this.mediaElementSources.set(audio, source);
      } catch {
        // Ignore if browser cannot capture media element
      }
    }
    this.applyChannelRouting(ctx);
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.setTargetAtTime(
        mute ? 0 : 0.095 * this.musicVolume,
        this.ctx.currentTime,
        0.2
      );
    }
    if (mute) {
      this.stopActiveVoice();
      this.stopCutsceneEntityDrone();
    }
    this.updateTvAudioLevels();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public prefetchWakeAudioBytes(): void {
    if (this.wakeRawBytesPromise || typeof fetch === 'undefined') return;
    this.wakeRawBytesPromise = fetch(WAKE_AUDIO_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch wake audio');
        return res.arrayBuffer();
      })
      .catch(() => null);
  }

  public preloadWakeAudio(): void {
    this.prefetchWakeAudioBytes();
    const ctx = this.ensureContext();
    if (!ctx || this.wakeBuffer || this.wakeLoadingPromise || !this.wakeRawBytesPromise) return;

    this.wakeLoadingPromise = this.wakeRawBytesPromise
      .then((bytes) => {
        if (!bytes) return null;
        return ctx.decodeAudioData(bytes.slice(0));
      })
      .then((decoded) => {
        this.wakeBuffer = decoded;
        return decoded;
      })
      .catch(() => null);
  }

  public preloadVoice(): void {
    this.preloadWakeAudio();
    const ctx = this.ensureContext();
    if (!ctx || this.userVoiceBuffer || this.voiceLoadingPromise) return;

    this.voiceLoadingPromise = fetch(USER_VOICE_URL)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load voice asset');
        return res.arrayBuffer();
      })
      .then((arr) => ctx.decodeAudioData(arr))
      .then((decoded) => {
        this.userVoiceBuffer = decoded;
        return decoded;
      })
      .catch(() => null);
  }

  private getBrownNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.brownNoiseBuffer && this.brownNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.brownNoiseBuffer;
    }
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 3.2;
    }
    this.brownNoiseBuffer = buffer;
    return buffer;
  }

  private getStoneReverbBuffer(ctx: AudioContext): AudioBuffer {
    if (this.stoneReverbBuffer && this.stoneReverbBuffer.sampleRate === ctx.sampleRate) {
      return this.stoneReverbBuffer;
    }
    const duration = 0.95;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 3.1);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
    }
    this.stoneReverbBuffer = buffer;
    return buffer;
  }

  private getWakeReverbBuffer(ctx: AudioContext): AudioBuffer {
    if (this.wakeReverbBuffer && this.wakeReverbBuffer.sampleRate === ctx.sampleRate) {
      return this.wakeReverbBuffer;
    }
    const duration = 2.7;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.45);
        const white = (Math.random() * 2 - 1) * decay;
        // Soften high frequencies across the reverb tail for a dark study atmosphere
        lp = lp * 0.62 + white * 0.38;
        data[i] = lp * 1.35;
      }
    }
    this.wakeReverbBuffer = buffer;
    return buffer;
  }

  public startAmbience(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.preloadVoice();
    if (this.ambienceRunning) return;

    try {
      const masterGain = ctx.createGain();
      masterGain.gain.value = this.muted ? 0 : 0.095 * this.musicVolume;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 185;
      lowpass.Q.value = 1.4;

      const oscSub = ctx.createOscillator();
      oscSub.type = 'sine';
      oscSub.frequency.value = 41.2;

      const oscDark = ctx.createOscillator();
      oscDark.type = 'triangle';
      oscDark.frequency.value = 61.74;
      const darkGain = ctx.createGain();
      darkGain.gain.value = 0.25;

      const oscDetune = ctx.createOscillator();
      oscDetune.type = 'sine';
      oscDetune.frequency.value = 41.7;
      const detuneGain = ctx.createGain();
      detuneGain.gain.value = 0.35;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.085;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 45;
      lfo.connect(lfoGain);
      lfoGain.connect(lowpass.frequency);

      const airNoise = ctx.createBufferSource();
      airNoise.buffer = this.getBrownNoiseBuffer(ctx);
      airNoise.loop = true;

      const airFilter = ctx.createBiquadFilter();
      airFilter.type = 'bandpass';
      airFilter.frequency.value = 260;
      airFilter.Q.value = 0.7;

      const airGain = ctx.createGain();
      airGain.gain.value = 0.08;

      oscSub.connect(lowpass);
      oscDark.connect(darkGain);
      darkGain.connect(lowpass);
      oscDetune.connect(detuneGain);
      detuneGain.connect(lowpass);
      lowpass.connect(masterGain);

      airNoise.connect(airFilter);
      airFilter.connect(airGain);
      airGain.connect(masterGain);

      masterGain.connect(this.getOutputDestination(ctx));

      oscSub.start();
      oscDark.start();
      oscDetune.start();
      lfo.start();
      airNoise.start();

      this.ambienceGain = masterGain;
      this.ambienceNodes = [oscSub, oscDark, oscDetune, lfo, airNoise, masterGain];
      this.ambienceRunning = true;

      const timer = window.setInterval(() => {
        if (!this.ambienceRunning || this.muted) return;
        if (Math.random() < 0.4) {
          this.playDistantCreak();
        }
      }, 7000);
      this.ambienceTimers.push(timer);
    } catch {
      // Ignore audio blocks until gesture
    }
  }

  public stopAmbience(): void {
    this.stopActiveVoice();
    this.stopCutsceneEntityDrone();
    this.stopTvAudio();
    if (!this.ambienceRunning) return;
    this.ambienceTimers.forEach((id) => window.clearInterval(id));
    this.ambienceTimers = [];
    for (const node of this.ambienceNodes) {
      try {
        if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
          (node as OscillatorNode).stop();
        }
        node.disconnect();
      } catch {
        // Ignore cleanup
      }
    }
    this.ambienceNodes = [];
    this.ambienceGain = null;
    this.ambienceRunning = false;
  }

  private playDistantCreak(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const base = 175 + Math.random() * 110;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + 0.85);
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    gain.gain.setValueAtTime(0.0005, now);
    gain.gain.linearRampToValueAtTime(0.014, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.9);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    osc.start(now);
    osc.stop(now + 0.95);
  }

  /**
   * Natural, organic footsteps using pre-filtered brown noise, smooth raised attack,
   * damped low-end boot weight, and stone corridor convolution echo.
   */
  public playFootstep(surface: 'wood' | 'stone'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.stepToggle = !this.stepToggle;

    const pitchVar = (this.stepToggle ? 1 : 0.91) * (0.95 + Math.random() * 0.1);
    const brown = this.getBrownNoiseBuffer(ctx);
    const offset = Math.random() * 1.4;

    // 1. Soft leather-sole contact noise (warm lowpass, zero harsh ringing)
    const soleSrc = ctx.createBufferSource();
    soleSrc.buffer = brown;
    soleSrc.playbackRate.value = pitchVar;

    const soleFilter = ctx.createBiquadFilter();
    soleFilter.type = 'lowpass';
    soleFilter.frequency.value = surface === 'wood' ? 380 * pitchVar : 680 * pitchVar;
    soleFilter.Q.value = 0.7;

    const soleGain = ctx.createGain();
    const dur = surface === 'wood' ? 0.095 : 0.075;
    soleGain.gain.setValueAtTime(0.001, now);
    soleGain.gain.linearRampToValueAtTime(surface === 'wood' ? 0.14 : 0.11, now + 0.011);
    soleGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    soleSrc.connect(soleFilter);
    soleFilter.connect(soleGain);
    soleGain.connect(this.getOutputDestination(ctx));

    // Subtle spatial stone corridor tail
    if (surface === 'stone') {
      const convolver = ctx.createConvolver();
      convolver.buffer = this.getStoneReverbBuffer(ctx);
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.18;
      soleGain.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(this.getOutputDestination(ctx));
    }

    soleSrc.start(now, offset, dur + 0.02);

    // 2. Damped sub-bass heel weight (smooth sine, no 8-bit click)
    const heel = ctx.createOscillator();
    const heelGain = ctx.createGain();
    heel.type = 'sine';
    heel.frequency.setValueAtTime(surface === 'wood' ? 76 * pitchVar : 98 * pitchVar, now);
    heel.frequency.exponentialRampToValueAtTime(surface === 'wood' ? 34 : 46, now + 0.075);

    heelGain.gain.setValueAtTime(0.001, now);
    heelGain.gain.linearRampToValueAtTime(surface === 'wood' ? 0.095 : 0.055, now + 0.008);
    heelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    heel.connect(heelGain);
    heelGain.connect(this.getOutputDestination(ctx));
    heel.start(now);
    heel.stop(now + 0.095);
  }

  public playDrawerOpen(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const knock = ctx.createOscillator();
    const knockGain = ctx.createGain();
    knock.type = 'sine';
    knock.frequency.setValueAtTime(145, now);
    knock.frequency.exponentialRampToValueAtTime(62, now + 0.045);
    knockGain.gain.setValueAtTime(0.09, now);
    knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    knock.connect(knockGain);
    knockGain.connect(this.getOutputDestination(ctx));
    knock.start(now);
    knock.stop(now + 0.055);

    const slide = ctx.createBufferSource();
    slide.buffer = this.getBrownNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(240, now + 0.03);
    filter.frequency.linearRampToValueAtTime(380, now + 0.28);
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now + 0.03);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    slide.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    slide.start(now + 0.03, 0.2, 0.32);
  }

  public playShelfSearch(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const wood = ctx.createOscillator();
    const woodFilter = ctx.createBiquadFilter();
    const woodGain = ctx.createGain();
    wood.type = 'triangle';
    wood.frequency.setValueAtTime(125, now);
    wood.frequency.linearRampToValueAtTime(98, now + 0.18);
    woodFilter.type = 'lowpass';
    woodFilter.frequency.value = 320;
    woodGain.gain.setValueAtTime(0.001, now);
    woodGain.gain.linearRampToValueAtTime(0.06, now + 0.03);
    woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    wood.connect(woodFilter);
    woodFilter.connect(woodGain);
    woodGain.connect(this.getOutputDestination(ctx));
    wood.start(now);
    wood.stop(now + 0.22);

    setTimeout(() => this.playBooksInspect(), 85);
  }

  public playBooksInspect(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.07, 0.14].forEach((offset, idx) => {
      const len = Math.floor(ctx.sampleRate * 0.06);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1750 + idx * 280;
      filter.Q.value = 1.2;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.055, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);

      src.connect(filter);
      filter.connect(g);
      g.connect(this.getOutputDestination(ctx));
      src.start(now + offset);
    });

    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(105, now + 0.19);
    thump.frequency.exponentialRampToValueAtTime(44, now + 0.28);
    thumpGain.gain.setValueAtTime(0.075, now + 0.19);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.29);
    thump.connect(thumpGain);
    thumpGain.connect(this.getOutputDestination(ctx));
    thump.start(now + 0.19);
    thump.stop(now + 0.3);
  }

  public playFabricSearch(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.getBrownNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 540;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    src.start(now, 0.35, 0.25);
  }

  public playKeyPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [1240, 1860, 2480];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.045);
      gain.gain.setValueAtTime(0.075, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.045 + 0.3);
      osc.connect(gain);
      gain.connect(this.getOutputDestination(ctx));
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.32);
    });
  }

  public playDoorLocked(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.1].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, now + offset);
      osc.frequency.exponentialRampToValueAtTime(50, now + offset + 0.08);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.085);
      osc.connect(gain);
      gain.connect(this.getOutputDestination(ctx));
      osc.start(now + offset);
      osc.stop(now + offset + 0.09);
    });
  }

  public playDoorUnlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(480, now);
    click.frequency.exponentialRampToValueAtTime(180, now + 0.055);
    clickGain.gain.setValueAtTime(0.1, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    click.connect(clickGain);
    clickGain.connect(this.getOutputDestination(ctx));
    click.start(now);
    click.stop(now + 0.07);

    const creak = ctx.createOscillator();
    const creakFilter = ctx.createBiquadFilter();
    const creakGain = ctx.createGain();
    creak.type = 'triangle';
    creak.frequency.setValueAtTime(118, now + 0.08);
    creak.frequency.linearRampToValueAtTime(164, now + 0.52);
    creakFilter.type = 'bandpass';
    creakFilter.frequency.value = 340;
    creakFilter.Q.value = 3.5;
    creakGain.gain.setValueAtTime(0.001, now + 0.08);
    creakGain.gain.linearRampToValueAtTime(0.065, now + 0.18);
    creakGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    creak.connect(creakFilter);
    creakFilter.connect(creakGain);
    creakGain.connect(this.getOutputDestination(ctx));
    creak.start(now + 0.08);
    creak.stop(now + 0.6);
  }

  public playDrawerClose(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const slide = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    slide.type = 'triangle';
    slide.frequency.setValueAtTime(160, now);
    slide.frequency.exponentialRampToValueAtTime(72, now + 0.14);
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    slide.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    slide.start(now);
    slide.stop(now + 0.16);
  }

  public playDoorClose(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const creak = ctx.createOscillator();
    const creakFilter = ctx.createBiquadFilter();
    const creakGain = ctx.createGain();
    creak.type = 'triangle';
    creak.frequency.setValueAtTime(154, now);
    creak.frequency.linearRampToValueAtTime(102, now + 0.24);
    creakFilter.type = 'bandpass';
    creakFilter.frequency.value = 310;
    creakFilter.Q.value = 3.2;
    creakGain.gain.setValueAtTime(0.001, now);
    creakGain.gain.linearRampToValueAtTime(0.055, now + 0.05);
    creakGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    creak.connect(creakFilter);
    creakFilter.connect(creakGain);
    creakGain.connect(this.getOutputDestination(ctx));
    creak.start(now);
    creak.stop(now + 0.28);

    const latch = ctx.createOscillator();
    const latchGain = ctx.createGain();
    latch.type = 'sine';
    latch.frequency.setValueAtTime(120, now + 0.23);
    latch.frequency.exponentialRampToValueAtTime(46, now + 0.34);
    latchGain.gain.setValueAtTime(0.11, now + 0.23);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    latch.connect(latchGain);
    latchGain.connect(this.getOutputDestination(ctx));
    latch.start(now + 0.23);
    latch.stop(now + 0.36);
  }

  public playSwitchClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.032);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);
    osc.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playTvToggle(on: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Tactile Bakelite power button clack
    const clack = ctx.createOscillator();
    const clackGain = ctx.createGain();
    clack.type = 'triangle';
    clack.frequency.setValueAtTime(on ? 520 : 380, now);
    clack.frequency.exponentialRampToValueAtTime(140, now + 0.045);
    clackGain.gain.setValueAtTime(0.09, now);
    clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    clack.connect(clackGain);
    clackGain.connect(this.getOutputDestination(ctx));
    clack.start(now);
    clack.stop(now + 0.055);

    if (on) {
      // Brief CRT warm-up static hiss
      const len = Math.floor(ctx.sampleRate * 0.2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2400;
      filter.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.055, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.getOutputDestination(ctx));
      src.start(now + 0.03);
    } else {
      // CRT tube discharge drop
      const drop = ctx.createOscillator();
      const dropGain = ctx.createGain();
      drop.type = 'sine';
      drop.frequency.setValueAtTime(680, now + 0.02);
      drop.frequency.exponentialRampToValueAtTime(75, now + 0.16);
      dropGain.gain.setValueAtTime(0.045, now + 0.02);
      dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      drop.connect(dropGain);
      dropGain.connect(this.getOutputDestination(ctx));
      drop.start(now + 0.02);
      drop.stop(now + 0.18);
    }
  }

  private updateTvAudioLevels(): void {
    if (this.tvAudioEl) {
      const audible = !this.muted && this.voiceEnabled && this.speechVolume > 0.005;
      this.tvAudioEl.volume = audible ? Math.max(0, Math.min(1, this.speechVolume)) : 0;
      this.syncMediaElement(this.tvAudioEl, this.monoAudio);
    }
    if (this.tvStaticGain && this.ctx) {
      this.tvStaticGain.gain.setTargetAtTime(
        this.muted ? 0 : 0.16 * Math.max(0.2, this.musicVolume),
        this.ctx.currentTime,
        0.06
      );
    }
  }

  public startTvNews(onEnded: () => void): void {
    this.stopTvAudio();
    if (typeof Audio === 'undefined') return;

    const audio = new Audio(TV_NEWS_AUDIO_URL);
    audio.preload = 'auto';
    this.tvAudioEl = audio;
    this.tvNewsEndedCb = onEnded;
    this.updateTvAudioLevels();

    audio.addEventListener('ended', () => {
      if (this.tvAudioEl !== audio) return;
      const cb = this.tvNewsEndedCb;
      this.stopTvAudio();
      cb?.();
    });

    void audio.play().catch(() => {
      // Fallback timeline in GameEngine handles completion even if blocked
    });
  }

  public startTvStatic(durationSec = 2.45): void {
    this.stopTvAudio();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * Math.max(0.6, durationSec + 0.15));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.35 + white * 0.65;
      const pop = Math.random() < 0.0028 ? (Math.random() > 0.5 ? 0.9 : -0.9) : 0;
      data[i] = Math.max(-1, Math.min(1, last * 0.72 + pop * 0.45));
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1850;
    bandpass.Q.value = 0.65;

    const humOsc = ctx.createOscillator();
    humOsc.type = 'sawtooth';
    humOsc.frequency.value = 60;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 180;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.14;

    const masterGain = ctx.createGain();
    const targetGain = this.muted ? 0 : 0.16 * Math.max(0.2, this.musicVolume);
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(targetGain, now + 0.08);
    masterGain.gain.setValueAtTime(targetGain, now + Math.max(0.15, durationSec - 0.14));
    masterGain.gain.exponentialRampToValueAtTime(0.0008, now + durationSec);

    noiseSrc.connect(bandpass);
    bandpass.connect(masterGain);
    humOsc.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(masterGain);
    masterGain.connect(this.getOutputDestination(ctx));

    noiseSrc.start(now, 0, durationSec);
    humOsc.start(now);
    humOsc.stop(now + durationSec + 0.04);

    this.tvStaticGain = masterGain;
    this.tvStaticNodes = [noiseSrc, humOsc, masterGain];
    this.tvStaticTimer = window.setTimeout(() => {
      this.stopTvStaticNodes();
    }, (durationSec + 0.15) * 1000);
  }

  private stopTvStaticNodes(): void {
    if (this.tvStaticTimer !== null) {
      window.clearTimeout(this.tvStaticTimer);
      this.tvStaticTimer = null;
    }
    for (const node of this.tvStaticNodes) {
      try {
        if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
          (node as OscillatorNode).stop();
        }
        node.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.tvStaticNodes = [];
    this.tvStaticGain = null;
  }

  public pauseTvAudio(): void {
    if (this.tvAudioEl && !this.tvAudioEl.paused && !this.tvAudioEl.ended) {
      this.tvAudioEl.pause();
    }
    this.stopTvStaticNodes();
  }

  public resumeTvNews(): void {
    if (this.tvAudioEl && this.tvAudioEl.paused && !this.tvAudioEl.ended) {
      this.updateTvAudioLevels();
      void this.tvAudioEl.play().catch(() => {});
    }
  }

  public stopTvAudio(): void {
    this.stopTvStaticNodes();
    this.tvNewsEndedCb = null;
    if (this.tvAudioEl) {
      try {
        this.tvAudioEl.pause();
        this.tvAudioEl.currentTime = 0;
      } catch {
        // Ignore cleanup errors
      }
      this.tvAudioEl = null;
    }
  }

  public getTvNewsCurrentTime(): number | null {
    if (!this.tvAudioEl) return null;
    return this.tvAudioEl.paused ? null : this.tvAudioEl.currentTime;
  }

  public isTvNewsEnded(): boolean {
    return Boolean(this.tvAudioEl?.ended);
  }

  public playPowerBlackout(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const volScale = Math.max(0.25, this.musicVolume);

    // Breaker relay clack
    const clack = ctx.createOscillator();
    const clackGain = ctx.createGain();
    clack.type = 'triangle';
    clack.frequency.setValueAtTime(310, now);
    clack.frequency.exponentialRampToValueAtTime(52, now + 0.09);
    clackGain.gain.setValueAtTime(0.11 * volScale, now);
    clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    clack.connect(clackGain);
    clackGain.connect(this.getOutputDestination(ctx));
    clack.start(now);
    clack.stop(now + 0.11);

    // Dying electrical hum drop
    const hum = ctx.createOscillator();
    const humFilter = ctx.createBiquadFilter();
    const humGain = ctx.createGain();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(120, now);
    hum.frequency.exponentialRampToValueAtTime(34, now + 0.55);
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 240;
    humGain.gain.setValueAtTime(0.065 * volScale, now);
    humGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.58);
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(this.getOutputDestination(ctx));
    hum.start(now);
    hum.stop(now + 0.6);
  }

  public playPowerRestore(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const volScale = Math.max(0.25, this.musicVolume);

    // Soft filament warm-up swell + gentle flicker pulse
    const hum = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(58, now);
    hum.frequency.linearRampToValueAtTime(60, now + 0.8);
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.045 * volScale, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    hum.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    hum.start(now);
    hum.stop(now + 1.0);
  }

  public stopWakeVoice(): void {
    if (this.wakeCleanupTimer !== null) {
      window.clearTimeout(this.wakeCleanupTimer);
      this.wakeCleanupTimer = null;
    }
    for (const node of this.activeWakeNodes) {
      try {
        if ('stop' in node && typeof (node as AudioBufferSourceNode).stop === 'function') {
          (node as AudioBufferSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // Ignore already stopped nodes
      }
    }
    this.activeWakeNodes = [];
  }

  public stopActiveVoice(): void {
    this.stopWakeVoice();
    for (const src of this.activeVoiceSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped sources
      }
    }
    this.activeVoiceSources = [];
  }

  /**
   * Plays the opening "acorda" audio processed inside the game's dark study acoustics,
   * with a smooth tail crossfade & matching cavernous echo so it never cuts off abruptly.
   */
  public async playWakeUpVoice(getCutsceneElapsed?: () => number): Promise<void> {
    if (this.muted || !this.voiceEnabled || this.speechVolume <= 0.005) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.wakeBuffer) {
      this.preloadWakeAudio();
      if (this.wakeLoadingPromise) {
        await this.wakeLoadingPromise;
      }
    }

    if (!this.wakeBuffer || this.muted || !this.voiceEnabled || this.speechVolume <= 0.005) return;

    this.stopWakeVoice();

    const elapsed = getCutsceneElapsed ? getCutsceneElapsed() : 0;
    const startOffset = Math.max(0, Math.min(1.3, elapsed));
    const endClipTime = Math.min(this.wakeBuffer.duration - 0.14, 3.62);
    const playSpan = Math.max(0.25, endClipTime - startOffset);

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.wakeBuffer;

    // Shape tone so it sits inside the dim wooden study space
    const lowWarmth = ctx.createBiquadFilter();
    lowWarmth.type = 'lowshelf';
    lowWarmth.frequency.value = 185;
    lowWarmth.gain.value = 2.8;

    const roomRollOff = ctx.createBiquadFilter();
    roomRollOff.type = 'lowpass';
    roomRollOff.frequency.value = 3100;
    roomRollOff.Q.value = 0.7;

    // Smooth anti-cutoff envelope on the source before feeding the delay/reverb sends
    const srcEnv = ctx.createGain();
    const fadeOutStart = Math.max(0.18, 2.95 - startOffset);
    srcEnv.gain.setValueAtTime(0.001, now);
    srcEnv.gain.linearRampToValueAtTime(1.0, now + 0.06);
    if (fadeOutStart < playSpan - 0.05) {
      srcEnv.gain.setValueAtTime(1.0, now + fadeOutStart);
    }
    srcEnv.gain.exponentialRampToValueAtTime(0.0008, now + playSpan);

    // Master output with gentle final tail fade scaled by speechVolume
    const masterOut = ctx.createGain();
    const tailTotal = playSpan + 2.6;
    const vol = Math.max(0.001, 1.05 * this.speechVolume);
    masterOut.gain.setValueAtTime(vol, now);
    masterOut.gain.setValueAtTime(vol, now + playSpan + 1.4);
    masterOut.gain.linearRampToValueAtTime(0.0005, now + tailTotal);
    masterOut.connect(this.getOutputDestination(ctx));

    // Dry in-room path
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.92;
    src.connect(lowWarmth);
    lowWarmth.connect(roomRollOff);
    roomRollOff.connect(srcEnv);
    srcEnv.connect(dryGain);
    dryGain.connect(masterOut);

    // Long dark cavernous reverb matching the eerie voice atmosphere
    const convolver = ctx.createConvolver();
    convolver.buffer = this.getWakeReverbBuffer(ctx);
    const reverbFilter = ctx.createBiquadFilter();
    reverbFilter.type = 'lowpass';
    reverbFilter.frequency.value = 1650;
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.52;

    srcEnv.connect(convolver);
    convolver.connect(reverbFilter);
    reverbFilter.connect(reverbGain);
    reverbGain.connect(masterOut);

    // Primary eerie feedback echo tap (dissolves "acorda" smoothly into space)
    const delay1 = ctx.createDelay(2.0);
    delay1.delayTime.value = 0.36;
    const echo1Filter = ctx.createBiquadFilter();
    echo1Filter.type = 'lowpass';
    echo1Filter.frequency.value = 1280;
    const echo1Feedback = ctx.createGain();
    echo1Feedback.gain.value = 0.44;
    const echo1Out = ctx.createGain();
    echo1Out.gain.value = 0.34;

    srcEnv.connect(delay1);
    delay1.connect(echo1Filter);
    echo1Filter.connect(echo1Feedback);
    echo1Feedback.connect(delay1);
    echo1Filter.connect(echo1Out);
    echo1Out.connect(masterOut);
    echo1Out.connect(convolver);

    // Secondary spacious echo tap
    const delay2 = ctx.createDelay(2.0);
    delay2.delayTime.value = 0.61;
    const echo2Filter = ctx.createBiquadFilter();
    echo2Filter.type = 'lowpass';
    echo2Filter.frequency.value = 960;
    const echo2Out = ctx.createGain();
    echo2Out.gain.value = 0.22;

    srcEnv.connect(delay2);
    delay2.connect(echo2Filter);
    echo2Filter.connect(echo2Out);
    echo2Out.connect(masterOut);
    echo2Out.connect(convolver);

    src.start(now, startOffset, playSpan + 0.04);

    this.activeWakeNodes = [src, masterOut, delay1, delay2, convolver];
    this.wakeCleanupTimer = window.setTimeout(() => {
      this.stopWakeVoice();
    }, (tailTotal + 0.25) * 1000);
  }

  /**
   * Plays a sliced phrase from the user's uploaded voice recording through an
   * eerie dark stone-corridor reverb & subtle whisper-double effects chain.
   */
  public async playNpcVoiceClip(clipIndex: number): Promise<void> {
    if (this.muted || !this.voiceEnabled || this.speechVolume <= 0.005) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const clip = NPC_VOICE_CLIPS[clipIndex % NPC_VOICE_CLIPS.length];
    if (!this.userVoiceBuffer) {
      this.preloadVoice();
      if (this.voiceLoadingPromise) {
        await this.voiceLoadingPromise;
      }
    }

    if (!this.userVoiceBuffer || this.muted || !this.voiceEnabled || this.speechVolume <= 0.005) {
      return;
    }

    this.stopActiveVoice();

    const now = ctx.currentTime;
    const rate = 0.94;
    const playDur = clip.duration / rate;

    // Main deep processed voice
    const mainSrc = ctx.createBufferSource();
    mainSrc.buffer = this.userVoiceBuffer;
    mainSrc.playbackRate.value = rate;

    // Warm dark room EQ
    const lowWarmth = ctx.createBiquadFilter();
    lowWarmth.type = 'lowshelf';
    lowWarmth.frequency.value = 210;
    lowWarmth.gain.value = 3.5;

    const airCut = ctx.createBiquadFilter();
    airCut.type = 'lowpass';
    airCut.frequency.value = 3600;

    const speechOut = ctx.createGain();
    speechOut.gain.value = this.speechVolume;
    speechOut.connect(this.getOutputDestination(ctx));

    const dryGain = ctx.createGain();
    dryGain.gain.setValueAtTime(0.001, now);
    dryGain.gain.linearRampToValueAtTime(1.15, now + 0.04);
    dryGain.gain.setValueAtTime(1.15, now + Math.max(0.06, playDur - 0.12));
    dryGain.gain.linearRampToValueAtTime(0.001, now + playDur);

    // Stone corridor echo tail
    const convolver = ctx.createConvolver();
    convolver.buffer = this.getStoneReverbBuffer(ctx);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.34;

    mainSrc.connect(lowWarmth);
    lowWarmth.connect(airCut);
    airCut.connect(dryGain);
    dryGain.connect(speechOut);
    dryGain.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(speechOut);

    // Subtle eerie low ghost-whisper layer delayed slightly
    const ghostSrc = ctx.createBufferSource();
    ghostSrc.buffer = this.userVoiceBuffer;
    ghostSrc.playbackRate.value = 0.91;

    const ghostFilter = ctx.createBiquadFilter();
    ghostFilter.type = 'bandpass';
    ghostFilter.frequency.value = 520;
    ghostFilter.Q.value = 1.4;

    const ghostGain = ctx.createGain();
    ghostGain.gain.setValueAtTime(0.001, now + 0.04);
    ghostGain.gain.linearRampToValueAtTime(0.18, now + 0.12);
    ghostGain.gain.linearRampToValueAtTime(0.001, now + playDur + 0.04);

    ghostSrc.connect(ghostFilter);
    ghostFilter.connect(ghostGain);
    ghostGain.connect(convolver);

    mainSrc.start(now, clip.start, clip.duration);
    ghostSrc.start(now + 0.04, clip.start, clip.duration);

    this.activeVoiceSources = [mainSrc, ghostSrc];
  }

  public playGateEncounter(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [55.0, 82.41, 130.81];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 1.9);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.12 : 0.07, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getOutputDestination(ctx));
      osc.start(now);
      osc.stop(now + 2.1);
    });
  }

  public playCutsceneHeartbeat(intensity = 0.7, speed = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const amp = Math.max(0.1, Math.min(1.1, intensity));
    const lubDubGap = Math.max(0.13, 0.21 / Math.max(0.75, speed));

    const triggerThump = (offset: number, startHz: number, endHz: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(startHz, now + offset);
      osc.frequency.exponentialRampToValueAtTime(endHz, now + offset + 0.13);

      filter.type = 'lowpass';
      filter.frequency.value = 155;
      filter.Q.value = 1.2;

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(gainPeak * amp, now + offset + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + offset + 0.16);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getOutputDestination(ctx));

      osc.start(now + offset);
      osc.stop(now + offset + 0.17);
    };

    triggerThump(0, 58, 31, 0.24);
    triggerThump(lubDubGap, 50, 27, 0.17);
  }

  public playCutsceneEntityEntrance(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.getWakeReverbBuffer(ctx);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.45;
    reverb.connect(wetGain);
    wetGain.connect(this.getOutputDestination(ctx));

    // Deep sub-bass pressure closing in
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(42, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 2.3);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.24, now + 0.55);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);
    sub.connect(subGain);
    subGain.connect(this.getOutputDestination(ctx));
    sub.start(now);
    sub.stop(now + 2.65);

    // Dark echoing dissonant swell
    [55, 77.78].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = idx === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq * 1.06, now);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 1.8);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, now);
      filter.frequency.linearRampToValueAtTime(460, now + 0.75);
      filter.frequency.exponentialRampToValueAtTime(135, now + 2.5);
      filter.Q.value = 2.4;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(idx === 0 ? 0.055 : 0.045, now + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.getOutputDestination(ctx));
      gain.connect(reverb);
      osc.start(now);
      osc.stop(now + 2.65);
    });

    // Swirling gloom air materializing
    const air = ctx.createBufferSource();
    air.buffer = this.getBrownNoiseBuffer(ctx);
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.setValueAtTime(220, now);
    airFilter.frequency.linearRampToValueAtTime(620, now + 0.85);
    airFilter.frequency.exponentialRampToValueAtTime(180, now + 2.3);
    airFilter.Q.value = 1.6;
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.001, now);
    airGain.gain.linearRampToValueAtTime(0.14, now + 0.6);
    airGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);

    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(this.getOutputDestination(ctx));
    airGain.connect(reverb);
    air.start(now, 0.1, 2.45);
  }

  public playCutsceneEntitySigh(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const air = ctx.createBufferSource();
    air.buffer = this.getBrownNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(390, now);
    filter.frequency.exponentialRampToValueAtTime(145, now + 1.15);
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.getWakeReverbBuffer(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;

    air.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    gain.connect(reverb);
    reverb.connect(wet);
    wet.connect(this.getOutputDestination(ctx));
    air.start(now, 0.35, 1.3);
  }

  public startCutsceneEntityDrone(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.cutsceneDroneGain) return;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0008, now);
    master.gain.linearRampToValueAtTime(0.048, now + 1.4);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 160;
    lowpass.Q.value = 1.2;

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 46.2;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 46.9;

    const osc3 = ctx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.value = 69.3;
    const osc3Gain = ctx.createGain();
    osc3Gain.gain.value = 0.22;

    osc1.connect(lowpass);
    osc2.connect(lowpass);
    osc3.connect(osc3Gain);
    osc3Gain.connect(lowpass);
    lowpass.connect(master);
    master.connect(this.getOutputDestination(ctx));

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    this.cutsceneDroneGain = master;
    this.cutsceneDroneNodes = [osc1, osc2, osc3, master];
  }

  public stopCutsceneEntityDrone(): void {
    const ctx = this.ctx;
    const nodes = this.cutsceneDroneNodes;
    const gain = this.cutsceneDroneGain;
    this.cutsceneDroneNodes = [];
    this.cutsceneDroneGain = null;

    if (!nodes.length) return;
    if (ctx && gain) {
      try {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0.0001, now, 0.22);
      } catch {
        // Ignore ramp error
      }
    }

    window.setTimeout(() => {
      for (const node of nodes) {
        try {
          if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
            (node as OscillatorNode).stop();
          }
          node.disconnect();
        } catch {
          // Ignore cleanup
        }
      }
    }, 550);
  }

  public playCutscenePenScratch(strokeIndex = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const dur = strokeIndex === 2 ? 0.22 : 0.14;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);

    // Textured paper friction + pen nib micro-strokes
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.sin(t * Math.PI);
      const nibMod = 0.55 + 0.45 * Math.sin(t * Math.PI * (strokeIndex === 2 ? 11 : 7));
      data[i] = (Math.random() * 2 - 1) * env * nibMod;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const nibBand = ctx.createBiquadFilter();
    nibBand.type = 'bandpass';
    nibBand.frequency.setValueAtTime(2450 + strokeIndex * 220, now);
    nibBand.frequency.linearRampToValueAtTime(3200 + strokeIndex * 180, now + dur);
    nibBand.Q.value = 1.6;

    const nibGain = ctx.createGain();
    nibGain.gain.setValueAtTime(0.001, now);
    nibGain.gain.linearRampToValueAtTime(0.16, now + 0.018);
    nibGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const paperBody = ctx.createBiquadFilter();
    paperBody.type = 'bandpass';
    paperBody.frequency.value = 980;
    paperBody.Q.value = 1.1;

    const paperGain = ctx.createGain();
    paperGain.gain.setValueAtTime(0.08, now);
    paperGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(nibBand);
    nibBand.connect(nibGain);
    nibGain.connect(this.getOutputDestination(ctx));

    src.connect(paperBody);
    paperBody.connect(paperGain);
    paperGain.connect(this.getOutputDestination(ctx));

    src.start(now);
  }

  public playCutsceneEntityVanish(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const reverb = ctx.createConvolver();
    reverb.buffer = this.getWakeReverbBuffer(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.52;
    reverb.connect(wet);
    wet.connect(this.getOutputDestination(ctx));

    // Dissolving dark air sweeping down into muffled darkness
    const air = ctx.createBufferSource();
    air.buffer = this.getBrownNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(940, now);
    filter.frequency.exponentialRampToValueAtTime(85, now + 2.4);
    filter.Q.value = 1.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.6);

    air.connect(filter);
    filter.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    gain.connect(reverb);
    air.start(now, 0.15, 2.65);

    // Descending phantom resonance fading out
    const ghost = ctx.createOscillator();
    const ghostGain = ctx.createGain();
    ghost.type = 'sine';
    ghost.frequency.setValueAtTime(118, now);
    ghost.frequency.exponentialRampToValueAtTime(34, now + 2.4);
    ghostGain.gain.setValueAtTime(0.001, now);
    ghostGain.gain.linearRampToValueAtTime(0.085, now + 0.2);
    ghostGain.gain.exponentialRampToValueAtTime(0.0006, now + 2.5);

    ghost.connect(ghostGain);
    ghostGain.connect(this.getOutputDestination(ctx));
    ghostGain.connect(reverb);
    ghost.start(now);
    ghost.stop(now + 2.55);
  }

  public playUiClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(this.getOutputDestination(ctx));
    osc.start(now);
    osc.stop(now + 0.05);
  }
}

export const soundEngine = new SoundEngine();
