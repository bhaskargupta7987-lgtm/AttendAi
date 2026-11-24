/**
 * Offline procedural background soundtrack + Web Speech voiceover coordinator
 * for the AttendAI 60-second Demo Video Studio.
 * Zero external API calls or paid assets; routes BG music (+ optional mic/file voice)
 * to both speakers and a MediaStreamAudioDestinationNode for .webm video export.
 */

export interface DemoAudioSettings {
  bgMusicEnabled: boolean;
  bgVolume: number; // 0..1
  voiceoverEnabled: boolean;
  voiceURI: string;
  voiceRate: number; // 0.8..1.3
  embedMicDuringExport: boolean;
}

const CHORD_PROGRESSION_HZ: number[][] = [
  // Cmaj9 (warm studio open)
  [130.81, 196.0, 246.94, 293.66, 329.63],
  // Am9 (analytical focus)
  [110.0, 164.81, 196.0, 246.94, 329.63],
  // Fmaj7 (pedagogical clarity)
  [87.31, 174.61, 220.0, 261.63, 329.63],
  // G6 (confident resolution)
  [98.0, 196.0, 246.94, 293.66, 329.63],
];

const ARP_NOTES_HZ: number[][] = [
  [523.25, 659.25, 783.99, 987.77],
  [440.0, 523.25, 659.25, 783.99],
  [349.23, 440.0, 523.25, 659.25],
  [392.0, 493.88, 587.33, 659.25],
];

export class DemoAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgBusGain: GainNode | null = null;
  private mediaDest: MediaStreamAudioDestinationNode | null = null;
  private schedulerId: number | null = null;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private customAudioEl: HTMLAudioElement | null = null;
  private customAudioSource: MediaElementAudioSourceNode | null = null;

  private bgEnabled = true;
  private bgVolume = 0.35;
  private isDucking = false;
  private isRunningBg = false;
  private stepCounter = 0;

  private lastSpokenCueKey = '';
  private lastChimeChapter = -1;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;

      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;

      const master = ctx.createGain();
      master.gain.value = 0.9;

      const bgBus = ctx.createGain();
      bgBus.gain.value = this.bgEnabled ? this.bgVolume : 0;

      const dest = ctx.createMediaStreamDestination();

      bgBus.connect(compressor);
      compressor.connect(master);
      master.connect(ctx.destination);
      master.connect(dest);

      this.ctx = ctx;
      this.masterGain = master;
      this.bgBusGain = bgBus;
      this.mediaDest = dest;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setBgSettings(enabled: boolean, volume: number): void {
    this.bgEnabled = enabled;
    this.bgVolume = Math.max(0, Math.min(1, volume));
    this.applyBgGain();
  }

  private applyBgGain(): void {
    if (!this.ctx || !this.bgBusGain) return;
    const now = this.ctx.currentTime;
    const target = this.bgEnabled
      ? this.bgVolume * (this.isDucking ? 0.3 : 1.0)
      : 0;
    this.bgBusGain.gain.cancelScheduledValues(now);
    this.bgBusGain.gain.setTargetAtTime(target, now, 0.14);
  }

  public startBgMusic(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.isRunningBg) return;

    this.isRunningBg = true;
    this.applyBgGain();
    this.triggerMusicalStep();

    this.schedulerId = window.setInterval(() => {
      if (this.isRunningBg) {
        this.triggerMusicalStep();
      }
    }, 625); // ~96 BPM eighth-note gentle studio pulse
  }

  public stopBgMusic(): void {
    this.isRunningBg = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    if (this.ctx && this.bgBusGain) {
      this.bgBusGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  private triggerMusicalStep(): void {
    if (!this.ctx || !this.bgBusGain || !this.bgEnabled) return;
    const now = this.ctx.currentTime;
    const stepInBar = this.stepCounter % 8;
    const chordIdx = Math.floor(this.stepCounter / 8) % CHORD_PROGRESSION_HZ.length;
    this.stepCounter++;

    // On beat 0 of every bar, bloom a warm low-pass filtered pad chord
    if (stepInBar === 0) {
      const chord = CHORD_PROGRESSION_HZ[chordIdx];
      chord.forEach((freq, idx) => {
        if (!this.ctx || !this.bgBusGain) return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const env = this.ctx.createGain();

        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime((idx % 2 === 0 ? 1 : -1) * 3.5, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(idx === 0 ? 280 : 950, now);

        const peakGain = idx === 0 ? 0.14 : 0.052;
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(peakGain, now + 0.55);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 5.1);

        osc.connect(filter);
        filter.connect(env);
        env.connect(this.bgBusGain);

        osc.start(now);
        osc.stop(now + 5.2);
      });
    }

    // Soft rhythmic marimba-like plucked pulse on alternating steps
    if (stepInBar % 2 === 0 || stepInBar === 5) {
      const arp = ARP_NOTES_HZ[chordIdx];
      const noteFreq = arp[stepInBar % arp.length];
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(noteFreq, now);

      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(0.032, now + 0.025);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc.connect(env);
      env.connect(this.bgBusGain);
      osc.start(now);
      osc.stop(now + 0.48);
    }
  }

  /** Subtle harmonic bell transition when crossing into a new chapter */
  public playChapterChime(chapterIndex: number): void {
    if (chapterIndex === this.lastChimeChapter) return;
    this.lastChimeChapter = chapterIndex;
    if (!this.bgEnabled) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.bgBusGain) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.065);
      env.gain.setValueAtTime(0.0001, now + idx * 0.065);
      env.gain.linearRampToValueAtTime(0.045, now + idx * 0.065 + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.65);

      osc.connect(env);
      env.connect(this.bgBusGain!);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.7);
    });
  }

  /** Trigger synchronized Web Speech voiceover for the current caption cue */
  public syncVoiceoverCue(params: {
    cueKey: string;
    text: string;
    enabled: boolean;
    voiceURI: string;
    rate: number;
  }): void {
    if (!params.enabled) {
      this.stopVoiceover();
      return;
    }
    if (params.cueKey === this.lastSpokenCueKey) return;
    this.lastSpokenCueKey = params.cueKey;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(params.text);
      utter.rate = Math.max(0.8, Math.min(1.35, params.rate));
      utter.pitch = 1.0;
      utter.volume = 1.0;

      if (params.voiceURI) {
        const voices = window.speechSynthesis.getVoices();
        const matched = voices.find((v) => v.voiceURI === params.voiceURI);
        if (matched) utter.voice = matched;
      }

      utter.onstart = () => {
        this.isDucking = true;
        this.applyBgGain();
      };
      utter.onend = () => {
        this.isDucking = false;
        this.applyBgGain();
      };
      utter.onerror = () => {
        this.isDucking = false;
        this.applyBgGain();
      };

      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore speech synthesis errors on restricted platforms
    }
  }

  public resetCueTracking(): void {
    this.lastSpokenCueKey = '';
    this.lastChimeChapter = -1;
  }

  public stopVoiceover(): void {
    this.lastSpokenCueKey = '';
    this.isDucking = false;
    this.applyBgGain();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  /** Optional live microphone voiceover mixed directly into WebM export track */
  public async attachMicToMix(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      this.detachMicFromMix();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const source = ctx.createMediaStreamSource(stream);
      const micGain = ctx.createGain();
      micGain.gain.value = 1.15;
      source.connect(micGain);
      if (this.mediaDest) {
        micGain.connect(this.mediaDest);
      }
      this.micStream = stream;
      this.micSource = source;
      this.isDucking = true;
      this.applyBgGain();
      return true;
    } catch {
      return false;
    }
  }

  public detachMicFromMix(): void {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // ignore
      }
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.isDucking = false;
    this.applyBgGain();
  }

  /** Optional uploaded custom narration audio file mixed into playback & export */
  public async startCustomVoiceoverTrack(
    audioUrl: string,
    offsetSec: number
  ): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    this.stopCustomVoiceoverTrack();

    const el = new Audio(audioUrl);
    el.crossOrigin = 'anonymous';
    el.currentTime = Math.max(0, offsetSec);
    const src = ctx.createMediaElementSource(el);
    src.connect(this.masterGain);
    this.customAudioEl = el;
    this.customAudioSource = src;
    this.isDucking = true;
    this.applyBgGain();
    try {
      await el.play();
    } catch {
      // ignore autoplay blocks
    }
  }

  public stopCustomVoiceoverTrack(): void {
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl = null;
    }
    if (this.customAudioSource) {
      try {
        this.customAudioSource.disconnect();
      } catch {
        // ignore
      }
      this.customAudioSource = null;
    }
    this.isDucking = false;
    this.applyBgGain();
  }

  /** Returns the mixed stereo Web Audio track to embed into MediaRecorder .webm exports */
  public getExportAudioTracks(): MediaStreamTrack[] {
    this.ensureContext();
    if (!this.mediaDest) return [];
    return this.mediaDest.stream.getAudioTracks();
  }

  public dispose(): void {
    this.stopBgMusic();
    this.stopVoiceover();
    this.detachMicFromMix();
    this.stopCustomVoiceoverTrack();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
    this.bgBusGain = null;
    this.mediaDest = null;
  }
}
