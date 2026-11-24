import { AudioInputMode, AudioState } from '../types/attendai';

export interface AudioAnalysisResult {
  state: AudioState;
  score: number;
  rms: number;
  zcr: number;
  sourceLabel: string;
}

/**
 * Offline Web Audio API analyzer computing RMS energy & Zero-Crossing Rate (ZCR).
 * Safely falls back to Silence / Passive (65 pts) when microphone is unavailable.
 */
export class BrowserAudioAnalyzer {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private timeBuffer: Float32Array<ArrayBuffer> | null = null;
  private micActive = false;
  private statusNote = 'Standby';

  public async startMicrophone(): Promise<void> {
    if (this.micActive) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.micActive = false;
      this.statusNote = 'Mic API Unavailable (Fallback)';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      this.stream = stream;
      this.audioCtx = ctx;
      this.analyser = analyser;
      this.timeBuffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.micActive = true;
      this.statusNote = 'Live Mic Active';
    } catch {
      this.stopMicrophone();
      this.statusNote = 'Mic Permission Fallback';
    }
  }

  public stopMicrophone(): void {
    this.micActive = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.analyser = null;
    this.timeBuffer = null;
  }

  public analyze(mode: AudioInputMode, simNoiseOverride?: boolean): AudioAnalysisResult {
    if (mode === 'muted') {
      return {
        state: 'Silence / Passive',
        score: 65,
        rms: 0.004,
        zcr: 0.02,
        sourceLabel: 'Muted Fallback',
      };
    }

    if (mode === 'simulated') {
      if (simNoiseOverride) {
        return {
          state: 'High Noise / Disturbance',
          score: 35,
          rms: 0.168,
          zcr: 0.245,
          sourceLabel: 'Simulated Audio',
        };
      }
      const phase = Math.floor(Date.now() / 8000) % 3;
      if (phase === 0) {
        return {
          state: 'Active Speech / Q&A',
          score: 100,
          rms: 0.044,
          zcr: 0.088,
          sourceLabel: 'Simulated Q&A',
        };
      }
      if (phase === 1) {
        return {
          state: 'Silence / Passive',
          score: 65,
          rms: 0.007,
          zcr: 0.025,
          sourceLabel: 'Simulated Passive',
        };
      }
      return {
        state: 'High Noise / Disturbance',
        score: 35,
        rms: 0.158,
        zcr: 0.235,
        sourceLabel: 'Simulated Noise',
      };
    }

    // Live Microphone mode
    if (!this.micActive || !this.analyser || !this.timeBuffer) {
      return {
        state: 'Silence / Passive',
        score: 65,
        rms: 0,
        zcr: 0,
        sourceLabel: this.statusNote,
      };
    }

    this.analyser.getFloatTimeDomainData(this.timeBuffer);
    const n = this.timeBuffer.length;
    let sumSq = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < n; i++) {
      const sample = this.timeBuffer[i];
      sumSq += sample * sample;
      if (i > 0) {
        const prev = this.timeBuffer[i - 1];
        if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) {
          zeroCrossings++;
        }
      }
    }

    const rms = Math.sqrt(sumSq / n);
    const zcr = zeroCrossings / Math.max(1, n - 1);

    if (rms < 0.012) {
      return {
        state: 'Silence / Passive',
        score: 65,
        rms,
        zcr,
        sourceLabel: 'Live Mic',
      };
    }
    if (rms > 0.12 || zcr > 0.22) {
      return {
        state: 'High Noise / Disturbance',
        score: 35,
        rms,
        zcr,
        sourceLabel: 'Live Mic',
      };
    }
    return {
      state: 'Active Speech / Q&A',
      score: 100,
      rms,
      zcr,
      sourceLabel: 'Live Mic',
    };
  }
}
