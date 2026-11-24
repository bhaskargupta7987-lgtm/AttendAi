import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Film,
  Mic,
  Music,
  Pause,
  Play,
  RotateCcw,
  Square,
  Subtitles,
  Target,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DemoAudioEngine } from '../demo/demoAudioEngine';
import { renderDemoFrame } from '../demo/demoCanvasRenderer';
import {
  DEFAULT_DEMO_CHAPTERS,
  DEMO_VIDEO_HEIGHT,
  DEMO_VIDEO_WIDTH,
  DemoChapter,
  formatTimecode,
  getActiveChapter,
  TOTAL_DEMO_DURATION_SEC,
} from '../demo/demoStoryboard';

interface Props {
  darkMode: boolean;
}

interface ExportJob {
  mode: 'full' | 'chapter';
  label: string;
  startSec: number;
  durationSec: number;
  progressPct: number;
  elapsedSec: number;
}

function selectSupportedMimeType(withAudio: boolean): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = withAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

export const DemoVideoStudioTab: React.FC<Props> = ({ darkMode }) => {
  const [chapters, setChapters] = useState<DemoChapter[]>(() =>
    DEFAULT_DEMO_CHAPTERS.map((c) => ({
      ...c,
      captions: c.captions.map((cap) => ({ ...cap })),
      callouts: c.callouts.map((co) => ({ ...co })),
    }))
  );
  const [currentSec, setCurrentSec] = useState<number>(0);
  // Start paused by default so user click unlocks browser Web Audio + Speech cleanly
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showCaptions, setShowCaptions] = useState<boolean>(true);
  const [showCallouts, setShowCallouts] = useState<boolean>(true);
  const [studioTheme, setStudioTheme] = useState<'dark' | 'light'>(
    darkMode ? 'dark' : 'light'
  );

  // Voiceover & Background Sound State
  const [voiceoverEnabled, setVoiceoverEnabled] = useState<boolean>(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [voiceRate, setVoiceRate] = useState<number>(1.04);
  const [bgMusicEnabled, setBgMusicEnabled] = useState<boolean>(true);
  const [bgVolume, setBgVolume] = useState<number>(0.38);
  const [embedMicVoice, setEmbedMicVoice] = useState<boolean>(false);
  const [customVoiceUrl, setCustomVoiceUrl] = useState<string | null>(null);
  const [customVoiceName, setCustomVoiceName] = useState<string>('');

  // Export state
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [exportedFile, setExportedFile] = useState<{
    url: string;
    filename: string;
    sizeMb: string;
  } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const exportAbortRef = useRef<boolean>(false);
  const audioEngineRef = useRef<DemoAudioEngine | null>(null);

  const currentSecRef = useRef<number>(currentSec);
  currentSecRef.current = currentSec;

  const audioConfigRef = useRef({
    voiceoverEnabled,
    selectedVoiceURI,
    voiceRate,
    bgMusicEnabled,
    bgVolume,
    customVoiceUrl,
  });
  audioConfigRef.current = {
    voiceoverEnabled,
    selectedVoiceURI,
    voiceRate,
    bgMusicEnabled,
    bgVolume,
    customVoiceUrl,
  };

  if (!audioEngineRef.current && typeof window !== 'undefined') {
    audioEngineRef.current = new DemoAudioEngine();
  }

  const { chapter: activeChapter, localSec } = useMemo(
    () => getActiveChapter(chapters, currentSec),
    [chapters, currentSec]
  );

  // Load installed browser SpeechSynthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
      const sorted = english.length > 0 ? english : voices;
      setAvailableVoices(sorted);
      setSelectedVoiceURI((prev) => {
        if (prev && sorted.some((v) => v.voiceURI === prev)) return prev;
        const preferred =
          sorted.find((v) => /natural|neural|google us|samantha|aria/i.test(v.name)) ??
          sorted[0];
        return preferred?.voiceURI ?? '';
      });
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // Keep studio theme synced with global theme when not exporting
  useEffect(() => {
    if (!exportJob) {
      setStudioTheme(darkMode ? 'dark' : 'light');
    }
  }, [darkMode, exportJob]);

  // Sync BG music volume/toggle to audio engine live
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    engine.setBgSettings(bgMusicEnabled, bgVolume);
    if (!bgMusicEnabled) {
      engine.stopBgMusic();
    } else if (isPlaying || exportJob) {
      engine.startBgMusic();
    }
  }, [bgMusicEnabled, bgVolume, isPlaying, exportJob]);

  // Stop speech immediately if user turns off voiceover
  useEffect(() => {
    if (!voiceoverEnabled) {
      audioEngineRef.current?.stopVoiceover();
    }
  }, [voiceoverEnabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (exportedFile?.url) URL.revokeObjectURL(exportedFile.url);
      if (customVoiceUrl) URL.revokeObjectURL(customVoiceUrl);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      audioEngineRef.current?.dispose();
    };
  }, [exportedFile, customVoiceUrl]);

  const paintFrame = useCallback(
    (sec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderDemoFrame({
        ctx,
        chapters,
        globalSec: sec,
        darkTheme: studioTheme === 'dark',
        showCaptions,
        showCallouts,
      });
    },
    [chapters, studioTheme, showCaptions, showCallouts]
  );

  // Sync voiceover cue + chapter transition chime for a given global timestamp
  const syncAudioAtTime = useCallback(
    (sec: number) => {
      const engine = audioEngineRef.current;
      if (!engine) return;
      const cfg = audioConfigRef.current;
      const { chapter, localSec: lSec } = getActiveChapter(chapters, sec);

      engine.playChapterChime(chapter.index);

      // If custom uploaded narration track is active, let it play without TTS overlap
      if (cfg.customVoiceUrl) return;

      const cueIdx = chapter.captions.findIndex(
        (c) => lSec >= c.startSec && lSec <= c.endSec
      );
      if (cueIdx !== -1) {
        const cue = chapter.captions[cueIdx];
        engine.syncVoiceoverCue({
          cueKey: `${chapter.id}-${cueIdx}`,
          text: `${cue.headline}. ${cue.text}`,
          enabled: cfg.voiceoverEnabled,
          voiceURI: cfg.selectedVoiceURI,
          rate: cfg.voiceRate,
        });
      }
    },
    [chapters]
  );

  // Preview playback loop
  useEffect(() => {
    if (exportJob) return;

    paintFrame(currentSecRef.current);

    if (!isPlaying) {
      audioEngineRef.current?.stopBgMusic();
      audioEngineRef.current?.stopVoiceover();
      audioEngineRef.current?.stopCustomVoiceoverTrack();
      return;
    }

    const engine = audioEngineRef.current;
    if (engine) {
      engine.setBgSettings(
        audioConfigRef.current.bgMusicEnabled,
        audioConfigRef.current.bgVolume
      );
      if (audioConfigRef.current.bgMusicEnabled) {
        engine.startBgMusic();
      }
      if (audioConfigRef.current.customVoiceUrl) {
        engine.startCustomVoiceoverTrack(
          audioConfigRef.current.customVoiceUrl,
          currentSecRef.current
        );
      }
    }

    let lastTs = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;

      let nextSec = currentSecRef.current + dt * playbackRate;
      if (nextSec >= TOTAL_DEMO_DURATION_SEC) {
        nextSec = 0;
        audioEngineRef.current?.resetCueTracking();
      }
      currentSecRef.current = nextSec;
      paintFrame(nextSec);
      syncAudioAtTime(nextSec);
      setCurrentSec(nextSec);

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, playbackRate, paintFrame, syncAudioAtTime, exportJob]);

  useEffect(() => {
    if (!isPlaying && !exportJob) {
      paintFrame(currentSec);
    }
  }, [currentSec, isPlaying, exportJob, paintFrame]);

  const handleScrub = (sec: number) => {
    if (exportJob) return;
    audioEngineRef.current?.resetCueTracking();
    currentSecRef.current = sec;
    setCurrentSec(sec);
    paintFrame(sec);
    if (isPlaying) {
      syncAudioAtTime(sec);
    }
  };

  const handleJumpChapter = (ch: DemoChapter) => {
    if (exportJob) return;
    audioEngineRef.current?.resetCueTracking();
    currentSecRef.current = ch.startSec;
    setCurrentSec(ch.startSec);
    paintFrame(ch.startSec);
    setIsPlaying(true);
  };

  const handleCaptionEdit = (
    chapterIdx: number,
    cueIdx: number,
    field: 'headline' | 'text',
    value: string
  ) => {
    setChapters((prev) =>
      prev.map((ch, ci) =>
        ci !== chapterIdx
          ? ch
          : {
              ...ch,
              captions: ch.captions.map((cue, qi) =>
                qi !== cueIdx ? cue : { ...cue, [field]: value }
              ),
            }
      )
    );
  };

  const handleResetCaptions = () => {
    setChapters(
      DEFAULT_DEMO_CHAPTERS.map((c) => ({
        ...c,
        captions: c.captions.map((cap) => ({ ...cap })),
        callouts: c.callouts.map((co) => ({ ...co })),
      }))
    );
  };

  const handleCustomVoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customVoiceUrl) URL.revokeObjectURL(customVoiceUrl);
    const url = URL.createObjectURL(file);
    setCustomVoiceUrl(url);
    setCustomVoiceName(file.name);
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCancelExport = () => {
    exportAbortRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    audioEngineRef.current?.stopBgMusic();
    audioEngineRef.current?.stopVoiceover();
    audioEngineRef.current?.detachMicFromMix();
    audioEngineRef.current?.stopCustomVoiceoverTrack();
    setExportJob(null);
  };

  const startVideoExport = async (mode: 'full' | 'chapter') => {
    setExportError(null);
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== 'function') {
      setExportError(
        'Canvas video capture is not supported in this browser. Try Chrome, Edge, or Firefox.'
      );
      return;
    }

    const engine = audioEngineRef.current;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
    exportAbortRef.current = false;

    const startSec = mode === 'full' ? 0 : activeChapter.startSec;
    const durationSec =
      mode === 'full' ? TOTAL_DEMO_DURATION_SEC : activeChapter.durationSec;
    const filename =
      mode === 'full'
        ? 'attendai-60s-demo-with-audio.webm'
        : `attendai-chapter-${activeChapter.code}-${activeChapter.id}.webm`;

    // Start Web Audio BG soundtrack (+ optional mic / uploaded voiceover) so MediaRecorder muxes stereo audio
    if (engine) {
      engine.resetCueTracking();
      engine.setBgSettings(bgMusicEnabled, bgVolume);
      if (bgMusicEnabled) {
        engine.startBgMusic();
      }
      if (embedMicVoice) {
        await engine.attachMicToMix();
      }
      if (customVoiceUrl) {
        await engine.startCustomVoiceoverTrack(customVoiceUrl, startSec);
      }
    }

    const videoStream = canvas.captureStream(30);
    const audioTracks = engine ? engine.getExportAudioTracks() : [];
    const combinedTracks: MediaStreamTrack[] = [
      ...videoStream.getVideoTracks(),
      ...audioTracks,
    ];
    const combinedStream = new MediaStream(combinedTracks);

    const mimeType = selectSupportedMimeType(audioTracks.length > 0);
    if (!mimeType) {
      setExportError('WebM MediaRecorder is unavailable in this browser context.');
      engine?.stopBgMusic();
      engine?.detachMicFromMix();
      return;
    }

    setExportJob({
      mode,
      label:
        mode === 'full'
          ? 'Rendering Full 60s Demo Video with Audio (1280×720 · 30 FPS)'
          : `Rendering Chapter ${activeChapter.code} with Audio (${activeChapter.durationSec}s)`,
      startSec,
      durationSec,
      progressPct: 0,
      elapsedSec: 0,
    });

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 4_500_000,
      audioBitsPerSecond: 128_000,
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
      }
    };

    recorder.onstop = () => {
      videoStream.getTracks().forEach((t) => t.stop());
      engine?.stopBgMusic();
      engine?.stopVoiceover();
      engine?.detachMicFromMix();
      engine?.stopCustomVoiceoverTrack();
      recorderRef.current = null;
      if (exportAbortRef.current) return;

      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);
      setExportedFile((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, filename, sizeMb };
      });
      setExportJob(null);
      triggerDownload(url, filename);
    };

    recorder.onerror = () => {
      setExportError('Video encoding failed unexpectedly. Please try again.');
      engine?.stopBgMusic();
      engine?.stopVoiceover();
      engine?.detachMicFromMix();
      setExportJob(null);
    };

    paintFrame(startSec);
    syncAudioAtTime(startSec);
    recorder.start(250);
    const wallStart = performance.now();

    const renderTick = (now: number) => {
      if (exportAbortRef.current) return;
      const elapsed = (now - wallStart) / 1000;
      const targetSec = Math.min(startSec + durationSec, startSec + elapsed);

      currentSecRef.current = targetSec;
      paintFrame(targetSec);
      syncAudioAtTime(targetSec);
      setCurrentSec(targetSec);

      const pct = Math.min(100, (elapsed / durationSec) * 100);
      setExportJob((prev) =>
        prev ? { ...prev, progressPct: pct, elapsedSec: elapsed } : null
      );

      if (elapsed >= durationSec) {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(renderTick);
    };

    rafRef.current = requestAnimationFrame(renderTick);
  };

  return (
    <div className="space-y-6">
      {/* Studio Action Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold font-display text-slate-900 dark:text-slate-100">
            Offline 60-Second Demo Video Studio
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            100% free local renderer · 1280×720 HD · Voiceover narration · Procedural ambient BG soundtrack
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={Boolean(exportJob)}
            onClick={() => startVideoExport('chapter')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
          >
            <Film className="w-3.5 h-3.5" />
            Export Chapter {activeChapter.code} (15s)
          </button>
          <button
            type="button"
            disabled={Boolean(exportJob)}
            onClick={() => startVideoExport('full')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Full 60s Video (.webm)
          </button>
        </div>
      </div>

      {/* Export Progress or Completed Banner */}
      {exportJob && (
        <div className="rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/35 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-sky-950 dark:text-sky-100">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span>{exportJob.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tabular-nums text-sky-800 dark:text-sky-200">
                {exportJob.elapsedSec.toFixed(1)}s / {exportJob.durationSec}s ·{' '}
                {exportJob.progressPct.toFixed(0)}%
              </span>
              <button
                type="button"
                onClick={handleCancelExport}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-sky-300 dark:border-sky-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Square className="w-3 h-3 fill-current" />
                Cancel
              </button>
            </div>
          </div>
          <div className="h-2 w-full rounded-full bg-sky-200/70 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-sky-600 dark:bg-sky-400 transition-all duration-150"
              style={{ width: `${exportJob.progressPct}%` }}
            />
          </div>
        </div>
      )}

      {exportedFile && !exportJob && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/35 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-emerald-950 dark:text-emerald-100">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              Exported <span className="font-mono font-semibold">{exportedFile.filename}</span> ({exportedFile.sizeMb} MB) with embedded audio track.
            </span>
          </div>
          <button
            type="button"
            onClick={() => triggerDownload(exportedFile.url, exportedFile.filename)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download Again
          </button>
        </div>
      )}

      {exportError && (
        <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-900 dark:text-rose-200">
          {exportError}
        </div>
      )}

      {/* Main 2-Column Studio Stage */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: 16:9 HD Showcase Canvas + Transport + Audio Mixer */}
        <div className="xl:col-span-8 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3.5 space-y-3.5">
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={DEMO_VIDEO_WIDTH}
                height={DEMO_VIDEO_HEIGHT}
                className="w-full h-auto aspect-video rounded-lg border border-slate-200 dark:border-slate-800 bg-[#0B1120] block"
              />
              {!isPlaying && !exportJob && currentSec === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/35 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      audioEngineRef.current?.resetCueTracking();
                      setIsPlaying(true);
                    }}
                    className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm font-semibold text-white shadow-lg transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Play 60s Demo with Voiceover &amp; BG Sound
                  </button>
                </div>
              )}
            </div>

            {/* Unified 00:00 - 01:00 Scrubber with Chapter Markers */}
            <div className="space-y-2 px-1">
              <div>
                <input
                  type="range"
                  min={0}
                  max={TOTAL_DEMO_DURATION_SEC}
                  step={0.1}
                  disabled={Boolean(exportJob)}
                  value={currentSec}
                  onChange={(e) => handleScrub(Number(e.target.value))}
                  aria-label="Demo timeline scrubber"
                  className="w-full accent-sky-600 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="grid grid-cols-4 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                  {chapters.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={Boolean(exportJob)}
                      onClick={() => handleJumpChapter(ch)}
                      className={`text-left truncate pr-2 hover:text-sky-600 dark:hover:text-sky-400 transition-colors ${
                        activeChapter.id === ch.id
                          ? 'text-sky-600 dark:text-sky-400 font-semibold'
                          : ''
                      }`}
                    >
                      {ch.code} · {formatTimecode(ch.startSec).slice(0, 5)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transport & Overlay Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(exportJob)}
                    onClick={() => setIsPlaying((p) => !p)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Play
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(exportJob)}
                    onClick={() => {
                      handleScrub(0);
                      setIsPlaying(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restart
                  </button>
                  <span className="ml-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {formatTimecode(currentSec)} / 01:00.0
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(exportJob)}
                    onClick={() => setShowCaptions((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      showCaptions
                        ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Subtitles className="w-3.5 h-3.5" />
                    Captions
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(exportJob)}
                    onClick={() => setShowCallouts((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      showCallouts
                        ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Target className="w-3.5 h-3.5" />
                    Callouts
                  </button>

                  <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {(['dark', 'light'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={Boolean(exportJob)}
                        onClick={() => setStudioTheme(mode)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                          studioTheme === mode
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {[1, 1.25, 1.5].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        disabled={Boolean(exportJob)}
                        onClick={() => setPlaybackRate(rate)}
                        className={`px-2 py-1 rounded-md text-xs font-mono tabular-nums transition-colors ${
                          playbackRate === rate
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Voiceover & Background Sound Mixer */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Voiceover &amp; Background Sound Mixer
                </h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Auto-ducking active · Embedded stereo BG music in .webm export
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Voiceover Column */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    disabled={Boolean(exportJob)}
                    onClick={() => setVoiceoverEnabled((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      voiceoverEnabled
                        ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {voiceoverEnabled ? (
                      <Volume2 className="w-3.5 h-3.5" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5" />
                    )}
                    {voiceoverEnabled ? 'Voiceover On' : 'Voiceover Off'}
                  </button>

                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Speed: {voiceRate.toFixed(2)}×
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="vo-voice-select"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    System Narrator Voice (Offline Web Speech)
                  </label>
                  <select
                    id="vo-voice-select"
                    disabled={!voiceoverEnabled || Boolean(exportJob)}
                    value={selectedVoiceURI}
                    onChange={(e) => setSelectedVoiceURI(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 disabled:opacity-50"
                  >
                    {availableVoices.length === 0 ? (
                      <option value="">Default System Voice</option>
                    ) : (
                      availableVoices.map((v, idx) => (
                        <option key={`${v.voiceURI}-${idx}`} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <input
                    type="range"
                    min={0.85}
                    max={1.3}
                    step={0.05}
                    disabled={!voiceoverEnabled || Boolean(exportJob)}
                    value={voiceRate}
                    onChange={(e) => setVoiceRate(Number(e.target.value))}
                    aria-label="Voiceover speaking speed"
                    className="w-full accent-sky-600 cursor-pointer disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Background Sound & Export Track Mixing Column */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    disabled={Boolean(exportJob)}
                    onClick={() => setBgMusicEnabled((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      bgMusicEnabled
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Music className="w-3.5 h-3.5" />
                    {bgMusicEnabled ? 'BG Soundtrack On' : 'BG Soundtrack Off'}
                  </button>

                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Vol: {Math.round(bgVolume * 100)}%
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="bg-vol-slider"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Ambient Synth &amp; Chapter Chime Volume
                  </label>
                  <input
                    id="bg-vol-slider"
                    type="range"
                    min={0}
                    max={0.85}
                    step={0.05}
                    disabled={!bgMusicEnabled || Boolean(exportJob)}
                    value={bgVolume}
                    onChange={(e) => setBgVolume(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer disabled:opacity-50"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled={Boolean(exportJob)}
                    onClick={() => setEmbedMicVoice((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      embedMicVoice
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    {embedMicVoice ? 'Mic Voice in Export: On' : 'Record Mic Voice in Export'}
                  </button>

                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:border-sky-500 whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5" />
                    <span className="max-w-[140px] truncate">
                      {customVoiceName || 'Mix Audio (.mp3/.wav)'}
                    </span>
                    <input
                      type="file"
                      accept="audio/*"
                      disabled={Boolean(exportJob)}
                      onChange={handleCustomVoiceUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Chapter Storyboard Selector Deck */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {chapters.map((ch) => {
              const isCurrent = ch.id === activeChapter.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  disabled={Boolean(exportJob)}
                  onClick={() => handleJumpChapter(ch)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    isCurrent
                      ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span
                      className={
                        isCurrent
                          ? 'text-sky-600 dark:text-sky-400 font-semibold'
                          : ''
                      }
                    >
                      Chapter {ch.code}
                    </span>
                    <span>
                      {formatTimecode(ch.startSec).slice(0, 5)} –{' '}
                      {formatTimecode(ch.startSec + ch.durationSec).slice(0, 5)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                    {ch.title}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {ch.subtitle}
                  </p>
                  <div className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {ch.features.slice(0, 2).join(' · ')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Active Chapter Caption & Voiceover Script Inspector */}
        <div className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs font-mono text-sky-600 dark:text-sky-400">
                Chapter {activeChapter.code} · {localSec.toFixed(1)}s / 15.0s
              </div>
              <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                Voiceover &amp; Caption Script
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetCaptions}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 whitespace-nowrap shrink-0"
            >
              Reset Script
            </button>
          </div>

          <div className="space-y-3.5">
            {activeChapter.captions.map((cue, cueIdx) => {
              const isCueActive =
                localSec >= cue.startSec && localSec <= cue.endSec;
              return (
                <div
                  key={`${activeChapter.id}-cue-${cueIdx}`}
                  className={`rounded-lg border p-3 space-y-2 transition-colors ${
                    isCueActive
                      ? 'border-sky-500/80 bg-sky-50/50 dark:bg-sky-950/25'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    <span>
                      Cue {cueIdx + 1} (
                      {formatTimecode(
                        activeChapter.startSec + cue.startSec
                      ).slice(0, 5)}{' '}
                      –{' '}
                      {formatTimecode(
                        activeChapter.startSec + cue.endSec
                      ).slice(0, 5)}
                      )
                    </span>
                    {isCueActive && (
                      <span className="font-semibold text-sky-600 dark:text-sky-400">
                        Speaking
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={cue.headline}
                    disabled={Boolean(exportJob)}
                    onChange={(e) =>
                      handleCaptionEdit(
                        activeChapter.index,
                        cueIdx,
                        'headline',
                        e.target.value
                      )
                    }
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <textarea
                    rows={2}
                    value={cue.text}
                    disabled={Boolean(exportJob)}
                    onChange={(e) =>
                      handleCaptionEdit(
                        activeChapter.index,
                        cueIdx,
                        'text',
                        e.target.value
                      )
                    }
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              );
            })}
          </div>

          {/* Timed Spotlight Callouts Summary */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Chapter Spotlight Callouts
            </h4>
            <div className="space-y-1.5">
              {activeChapter.callouts.map((co) => {
                const isLit = localSec >= co.startSec && localSec <= co.endSec;
                return (
                  <div
                    key={co.id}
                    className={`flex items-baseline justify-between gap-2 text-xs py-1 ${
                      isLit
                        ? 'text-slate-900 dark:text-slate-100 font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span className="truncate">
                      {co.label} —{' '}
                      <span className="font-normal">{co.detail}</span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] shrink-0">
                      {co.startSec.toFixed(0)}s–{co.endSec.toFixed(0)}s
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
