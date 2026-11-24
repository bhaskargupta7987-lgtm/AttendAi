/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Calculator,
  Camera,
  FileSpreadsheet,
  Film,
  Menu,
  Moon,
  Play,
  RotateCcw,
  Square,
  Sun,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { BrowserAudioAnalyzer } from './audio/audioAnalyzer';
import { AuditLogsTab } from './components/AuditLogsTab';
import { DemoVideoStudioTab } from './components/DemoVideoStudioTab';
import { EngagementTrendChart } from './components/EngagementTrendChart';
import { SafeLeaveSimulatorTab } from './components/SafeLeaveSimulatorTab';
import { SessionAnalyticsTab } from './components/SessionAnalyticsTab';
import {
  AttendanceRecord,
  AudioInputMode,
  AudioState,
  AuditLedgerEntry,
  ClassroomEvent,
  DEFAULT_ROSTER,
  EngagementSample,
  FusionWeights,
  SimulationScenario,
  TrackedParticipant,
  VideoInputSource,
} from './types/attendai';
import {
  appendVerifiedAttendance,
  loadAttendanceLogs,
  loadAuditLedger,
  saveAttendanceLogs,
  saveAuditLedger,
} from './utils/cryptoLedger';
import { buildTeachingSuggestion, parseRosterInput } from './utils/suggestions';
import {
  BrowserFaceDetector,
  ClassroomTracker,
  drawHudOverlay,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  renderDemoClassroomScene,
} from './vision/facePipeline';

type NavTab = 'monitor' | 'analytics' | 'simulator' | 'audit' | 'demo';

export default function App() {
  // Theme & Layout
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<NavTab>('monitor');

  // Agent Controls & Config (Real-Time Live Webcam & Mic by default)
  const [agentRunning, setAgentRunning] = useState<boolean>(false);
  const [videoSource, setVideoSource] = useState<VideoInputSource>('webcam');
  const [simScenario, setSimScenario] = useState<SimulationScenario>('balanced');
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [mirrorCamera, setMirrorCamera] = useState<boolean>(true);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string>('');
  const [presenceThreshold, setPresenceThreshold] = useState<number>(8);
  const [inactivityThreshold, setInactivityThreshold] = useState<number>(8);
  const [rawWeights, setRawWeights] = useState<FusionWeights>({
    pose: 0.5,
    movement: 0.25,
    audio: 0.25,
  });
  const [audioMode, setAudioMode] = useState<AudioInputMode>('microphone');
  const [rosterText, setRosterText] = useState<string>(() =>
    DEFAULT_ROSTER.map((r) => `${r.studentId}, ${r.name}`).join('\n')
  );
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Live Telemetry State
  const [activeParticipants, setActiveParticipants] = useState<TrackedParticipant[]>([]);
  const [allParticipants, setAllParticipants] = useState<TrackedParticipant[]>([]);
  const [classEngagement, setClassEngagement] = useState<number>(0);
  const [peakEngagement, setPeakEngagement] = useState<number>(0);
  const [audioState, setAudioState] = useState<AudioState>('Silence / Passive');
  const [fps, setFps] = useState<number>(0);
  const [engagementHistory, setEngagementHistory] = useState<EngagementSample[]>([]);
  const [events, setEvents] = useState<ClassroomEvent[]>([]);
  const [attentionDropCount, setAttentionDropCount] = useState<number>(0);
  const [sessionStartTs, setSessionStartTs] = useState<number>(() => Date.now());

  // Persistent Offline CSV & SHA-256 Ledger State
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>(() =>
    loadAttendanceLogs()
  );
  const [auditLedger, setAuditLedger] = useState<AuditLedgerEntry[]>(() =>
    loadAuditLedger()
  );

  // Refs for real-time 30fps Vision + Audio Pipeline
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const detectorRef = useRef<BrowserFaceDetector | null>(null);
  const trackerRef = useRef<ClassroomTracker>(
    new ClassroomTracker(DEFAULT_ROSTER)
  );
  const audioAnalyzerRef = useRef<BrowserAudioAnalyzer>(
    new BrowserAudioAnalyzer()
  );

  const attendanceLogsRef = useRef<AttendanceRecord[]>(attendanceLogs);
  const auditLedgerRef = useRef<AuditLedgerEntry[]>(auditLedger);
  attendanceLogsRef.current = attendanceLogs;
  auditLedgerRef.current = auditLedger;

  const commitQueueRef = useRef<Promise<void>>(Promise.resolve());
  const inDropStateRef = useRef<boolean>(false);

  const parsedRoster = useMemo(() => parseRosterInput(rosterText), [rosterText]);

  // Normalized Fusion Weights
  const normalizedWeights = useMemo<FusionWeights>(() => {
    const sum = rawWeights.pose + rawWeights.movement + rawWeights.audio;
    if (sum <= 0) return { pose: 0.5, movement: 0.25, audio: 0.25 };
    return {
      pose: rawWeights.pose / sum,
      movement: rawWeights.movement / sum,
      audio: rawWeights.audio / sum,
    };
  }, [rawWeights]);

  // Keep latest config accessible inside animation loop without restarting stream
  const configRef = useRef({
    videoSource,
    simScenario,
    mirrorCamera,
    presenceThreshold,
    inactivityThreshold,
    weights: normalizedWeights,
    audioMode,
    darkMode,
  });
  configRef.current = {
    videoSource,
    simScenario,
    mirrorCamera,
    presenceThreshold,
    inactivityThreshold,
    weights: normalizedWeights,
    audioMode,
    darkMode,
  };

  // Discover available real-time webcams
  const refreshCameraDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setCameraDevices(videoInputs);
      setSelectedCameraId((prev) => {
        if (prev && videoInputs.some((d) => d.deviceId === prev)) return prev;
        return videoInputs[0]?.deviceId ?? '';
      });
    } catch {
      // ignore permission errors prior to stream start
    }
  }, []);

  useEffect(() => {
    refreshCameraDevices();
  }, [refreshCameraDevices]);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  // Sync roster updates to tracker
  useEffect(() => {
    trackerRef.current.updateRoster(parsedRoster);
  }, [parsedRoster]);

  // Draw crisp Standby Canvas whenever stopped
  const drawStandbyCanvas = useCallback((isDark: boolean, msg?: string) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = isDark ? '#0F172A' : '#F1F5F9';
    ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

    ctx.strokeStyle = isDark ? '#38BDF8' : '#0284C7';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, FRAME_WIDTH - 36, FRAME_HEIGHT - 36);

    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
    ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(
      'AttendAI Classroom Vision Standby',
      FRAME_WIDTH / 2,
      FRAME_HEIGHT / 2 - 22
    );

    ctx.fillStyle = isDark ? '#38BDF8' : '#0284C7';
    ctx.font = '500 13px "DM Sans", sans-serif';
    ctx.fillText(
      msg || 'Click "Start Camera Agent" to begin real-time multimodal tracking',
      FRAME_WIDTH / 2,
      FRAME_HEIGHT / 2 + 12
    );

    ctx.fillStyle = isDark ? '#94A3B8' : '#64748B';
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.fillText(
      '100% Offline · Zero Raw Video Stored · Privacy-First',
      FRAME_WIDTH / 2,
      FRAME_HEIGHT / 2 + 44
    );
    ctx.textAlign = 'left';
  }, []);

  useEffect(() => {
    if (!agentRunning) {
      drawStandbyCanvas(darkMode, cameraError ?? undefined);
    }
  }, [agentRunning, darkMode, cameraError, drawStandbyCanvas, activeTab]);

  // Cleanly stop media & loops
  const stopMediaResources = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoElRef.current) {
      videoElRef.current.pause();
      videoElRef.current.srcObject = null;
      videoElRef.current.removeAttribute('src');
    }
    audioAnalyzerRef.current.stopMicrophone();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMediaResources();
      if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
      }
    };
  }, [stopMediaResources, uploadedVideoUrl]);

  // Handle attendance commit -> append to SHA-256 ledger sequentially
  const handleAttendanceCommit = useCallback((participant: TrackedParticipant) => {
    const ts =
      participant.presentTimestamp ??
      new Date().toISOString().replace('T', ' ').slice(0, 19);
    const avgEng =
      participant.engagementSamples.length > 0
        ? participant.engagementSamples.reduce((a, b) => a + b, 0) /
          participant.engagementSamples.length
        : participant.engagementScore;

    commitQueueRef.current = commitQueueRef.current.then(async () => {
      const res = await appendVerifiedAttendance({
        studentId: participant.studentId,
        name: participant.name,
        timestamp: ts,
        sustainedSec: participant.sustainedSec,
        avgEngagement: avgEng,
        currentLogs: attendanceLogsRef.current,
        currentLedger: auditLedgerRef.current,
      });
      participant.sha256Token = res.record.SHA256_Token;
      attendanceLogsRef.current = res.nextLogs;
      auditLedgerRef.current = res.nextLedger;
      setAttendanceLogs(res.nextLogs);
      setAuditLedger(res.nextLedger);
    });
  }, []);

  // Main real-time Vision & Audio processing lifecycle
  useEffect(() => {
    if (!agentRunning) {
      stopMediaResources();
      return;
    }

    let cancelled = false;
    setCameraError(null);

    const startAgentPipeline = async () => {
      if (!detectorRef.current) {
        detectorRef.current = new BrowserFaceDetector();
      }
      const detector = detectorRef.current;

      if (configRef.current.audioMode === 'microphone') {
        await audioAnalyzerRef.current.startMicrophone();
      }

      // Initialize video stream if webcam or uploaded video
      if (videoSource === 'webcam') {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Webcam API not available in this browser context.');
          setAgentRunning(false);
          return;
        }
        try {
          const videoConstraints: MediaTrackConstraints = {
            width: { ideal: FRAME_WIDTH },
            height: { ideal: FRAME_HEIGHT },
            frameRate: { ideal: 30 },
          };
          if (selectedCameraId) {
            videoConstraints.deviceId = { exact: selectedCameraId };
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          mediaStreamRef.current = stream;
          refreshCameraDevices();
          const v = videoElRef.current;
          if (v) {
            v.srcObject = stream;
            await v.play();
          }
        } catch {
          setCameraError(
            'Camera permission denied or no webcam detected. Allow camera access in your browser, or switch to Upload Video / Virtual Demo Class.'
          );
          setAgentRunning(false);
          return;
        }
      } else if (videoSource === 'video') {
        if (!uploadedVideoUrl) {
          setCameraError('Please upload an .mp4, .mov, .webm, or .avi file in the sidebar.');
          setAgentRunning(false);
          return;
        }
        const v = videoElRef.current;
        if (v) {
          v.srcObject = null;
          v.src = uploadedVideoUrl;
          v.loop = true;
          v.muted = true;
          try {
            await v.play();
          } catch {
            setCameraError('Unable to decode the uploaded video file in this browser.');
            setAgentRunning(false);
            return;
          }
        }
      }

      let prevFrameTime = performance.now();
      let lastUiSync = 0;
      let lastChartSample = 0;
      let smoothedFps = 0;
      let processingFrame = false;

      const tick = async () => {
        if (cancelled) return;
        rafRef.current = requestAnimationFrame(tick);

        if (processingFrame) return;
        processingFrame = true;

        try {
          const canvas = displayCanvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          const nowMs = performance.now();
          const dt = Math.max(0.008, (nowMs - prevFrameTime) / 1000);
          prevFrameTime = nowMs;

          const instFps = 1 / dt;
          smoothedFps =
            smoothedFps === 0 ? instFps : 0.85 * smoothedFps + 0.15 * instFps;

          const cfg = configRef.current;

          // Draw raw source frame at 640x480
          if (cfg.videoSource === 'simulation') {
            renderDemoClassroomScene(ctx, nowMs / 1000, cfg.simScenario);
          } else {
            const v = videoElRef.current;
            if (!v || v.readyState < 2) {
              return;
            }
            if (cfg.videoSource === 'webcam' && cfg.mirrorCamera) {
              ctx.save();
              ctx.translate(FRAME_WIDTH, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(v, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
              ctx.restore();
            } else {
              ctx.drawImage(v, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
            }
          }

          // Audio analysis
          const audioRes = audioAnalyzerRef.current.analyze(
            cfg.audioMode,
            cfg.videoSource === 'simulation' && cfg.simScenario === 'distracted'
          );

          // Vision detection + EMA tracking
          const detections = await detector.detect(canvas);
          const tracks = trackerRef.current.step({
            detections,
            frameCanvas: canvas,
            frameCtx: ctx,
            dt,
            presenceThresholdSec: cfg.presenceThreshold,
            inactivityThresholdSec: cfg.inactivityThreshold,
            audioState: audioRes.state,
            audioScore: audioRes.score,
            weights: cfg.weights,
            onAttendanceCommit: handleAttendanceCommit,
          });

          const avgEng =
            tracks.length > 0
              ? tracks.reduce((acc, t) => acc + t.engagementScore, 0) / tracks.length
              : 0;

          // Draw crisp HUD overlay onto the 640x480 canvas
          drawHudOverlay({
            ctx,
            tracks,
            presenceThresholdSec: cfg.presenceThreshold,
            inactivityThresholdSec: cfg.inactivityThreshold,
            classEngagement: avgEng,
            audioState: audioRes.state,
            fps: smoothedFps,
            engineLabel: detector.activeEngineLabel,
          });

          // Track attention drop events (<55%)
          if (tracks.length > 0 && avgEng < 55) {
            if (!inDropStateRef.current) {
              inDropStateRef.current = true;
              setAttentionDropCount((c) => c + 1);
              trackerRef.current.logEvent(
                'Attention Drop',
                `Class engagement dropped to ${avgEng.toFixed(1)}% (${audioRes.state})`
              );
            }
          } else {
            inDropStateRef.current = false;
          }

          // Sample Engagement Trend chart every 1s
          if (nowMs - lastChartSample >= 1000) {
            lastChartSample = nowMs;
            const timeStr = new Date().toLocaleTimeString('en-GB', {
              hour12: false,
            });
            setEngagementHistory((prev) => {
              const next = [
                ...prev,
                {
                  step: prev.length + 1,
                  time: timeStr,
                  engagement: Number(avgEng.toFixed(1)),
                },
              ];
              return next.length > 600 ? next.slice(-600) : next;
            });
          }

          // Sync React UI tables/metrics at ~3Hz to avoid unnecessary re-renders
          if (nowMs - lastUiSync >= 320) {
            lastUiSync = nowMs;
            setActiveParticipants(tracks.map((t) => ({ ...t })));
            setAllParticipants(
              Array.from(trackerRef.current.retiredTracks.values()).map((t) => ({
                ...t,
              }))
            );
            setClassEngagement(avgEng);
            setPeakEngagement((p) => (avgEng > p ? avgEng : p));
            setAudioState(audioRes.state);
            setFps(smoothedFps);
            setEvents([...trackerRef.current.events]);
          }
        } finally {
          processingFrame = false;
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    startAgentPipeline();

    return () => {
      cancelled = true;
      stopMediaResources();
    };
  }, [
    agentRunning,
    videoSource,
    selectedCameraId,
    uploadedVideoUrl,
    handleAttendanceCommit,
    stopMediaResources,
    refreshCameraDevices,
  ]);

  // Toggle audio mode while running
  useEffect(() => {
    if (!agentRunning) return;
    if (audioMode === 'microphone') {
      audioAnalyzerRef.current.startMicrophone();
    } else {
      audioAnalyzerRef.current.stopMicrophone();
    }
  }, [audioMode, agentRunning]);

  const handleResetSession = () => {
    setAgentRunning(false);
    stopMediaResources();
    trackerRef.current = new ClassroomTracker(parsedRoster);
    inDropStateRef.current = false;
    setActiveParticipants([]);
    setAllParticipants([]);
    setClassEngagement(0);
    setPeakEngagement(0);
    setAudioState('Silence / Passive');
    setFps(0);
    setEngagementHistory([]);
    setEvents([]);
    setAttentionDropCount(0);
    setSessionStartTs(Date.now());
    setCameraError(null);
  };

  const handleClearAttendanceLogs = () => {
    saveAttendanceLogs([]);
    saveAuditLedger([]);
    setAttendanceLogs([]);
    setAuditLedger([]);
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);
    setUploadedVideoName(file.name);
    setCameraError(null);
  };

  const markedPresentCount = useMemo(() => {
    const sessionVerified = allParticipants.filter((p) => p.markedPresent).length;
    return Math.max(sessionVerified, attendanceLogs.length);
  }, [allParticipants, attendanceLogs.length]);

  const suggestion = useMemo(
    () =>
      buildTeachingSuggestion({
        activeTracks: activeParticipants,
        classEngagement,
        audioState,
        inactivityThresholdSec: inactivityThreshold,
      }),
    [activeParticipants, classEngagement, audioState, inactivityThreshold]
  );

  const suggestionStyles: Record<typeof suggestion.level, string> = {
    info: 'border-sky-300/70 dark:border-sky-800/70 bg-sky-50 dark:bg-sky-950/35 text-sky-950 dark:text-sky-100',
    warn: 'border-amber-300/70 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/35 text-amber-950 dark:text-amber-100',
    alert: 'border-rose-300/70 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/35 text-rose-950 dark:text-rose-100',
    success: 'border-emerald-300/70 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-950 dark:text-emerald-100',
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {/* Hidden video element for webcam/file decoding */}
      <video
        ref={videoElRef}
        playsInline
        muted
        className="hidden"
        width={FRAME_WIDTH}
        height={FRAME_HEIGHT}
      />

      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Control Panel Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-base font-bold tracking-tight font-display text-slate-900 dark:text-slate-100">
              AttendAI
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Offline Classroom Engine
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Toggle dark theme"
              title={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
              className="p-2 rounded-lg lg:hidden text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
          {/* Input Stream Source */}
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Video Input Source
            </h2>
            <div className="grid grid-cols-1 gap-1.5">
              {(
                [
                  { id: 'webcam', label: 'Real-Time Camera (Live)' },
                  { id: 'video', label: 'Upload Video (.mp4/.mov/.avi)' },
                  { id: 'simulation', label: 'Virtual Demo Class (Offline)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (agentRunning && opt.id !== videoSource) {
                      setAgentRunning(false);
                    }
                    setVideoSource(opt.id);
                    if (opt.id === 'webcam') setAudioMode('microphone');
                    setCameraError(null);
                  }}
                  className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap truncate ${
                    videoSource === opt.id
                      ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {videoSource === 'simulation' && (
              <div className="pt-1">
                <label
                  htmlFor="sim-scenario"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Evaluation Scenario Preset
                </label>
                <select
                  id="sim-scenario"
                  value={simScenario}
                  onChange={(e) =>
                    setSimScenario(e.target.value as SimulationScenario)
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="balanced">Balanced Classroom (3 Students)</option>
                  <option value="peak">Peak Engagement (&gt;78%)</option>
                  <option value="distracted">Attention Drop (Looking Away)</option>
                  <option value="static">Static Learners (Inactivity ≥8s)</option>
                  <option value="empty">Empty Room (Standby Alert)</option>
                </select>
              </div>
            )}

            {videoSource === 'video' && (
              <div className="pt-1">
                <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:border-sky-500">
                  <Upload className="w-3.5 h-3.5" />
                  <span className="truncate">
                    {uploadedVideoName || 'Select .mp4 / .mov / .avi'}
                  </span>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
                    onChange={handleVideoFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </section>

          {/* Attendance & Inactivity Thresholds */}
          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Attendance &amp; Inactivity Rules
            </h2>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 dark:text-slate-300">
                  Sustained Presence
                </span>
                <span className="font-mono tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                  {presenceThreshold}s
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={45}
                step={1}
                value={presenceThreshold}
                onChange={(e) => setPresenceThreshold(Number(e.target.value))}
                className="w-full accent-sky-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 dark:text-slate-300">
                  Inactivity Alert
                </span>
                <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                  {inactivityThreshold}s
                </span>
              </div>
              <input
                type="range"
                min={4}
                max={20}
                step={1}
                value={inactivityThreshold}
                onChange={(e) => setInactivityThreshold(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </section>

          {/* Multimodal Signal Fusion Weights */}
          <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Multimodal Fusion Weights
              </h2>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Sum 100%
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 dark:text-slate-300">Head Pose</span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {Math.round(normalizedWeights.pose * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={rawWeights.pose}
                onChange={(e) =>
                  setRawWeights((w) => ({ ...w, pose: Number(e.target.value) }))
                }
                className="w-full accent-sky-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 dark:text-slate-300">
                  Movement / Inactivity
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {Math.round(normalizedWeights.movement * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={rawWeights.movement}
                onChange={(e) =>
                  setRawWeights((w) => ({ ...w, movement: Number(e.target.value) }))
                }
                className="w-full accent-sky-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-700 dark:text-slate-300">
                  Audio Activity
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                  {Math.round(normalizedWeights.audio * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={rawWeights.audio}
                onChange={(e) =>
                  setRawWeights((w) => ({ ...w, audio: Number(e.target.value) }))
                }
                className="w-full accent-sky-600 cursor-pointer"
              />
            </div>

            <div className="pt-1">
              <label
                htmlFor="audio-mode-select"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                Audio Signal Source
              </label>
              <select
                id="audio-mode-select"
                value={audioMode}
                onChange={(e) => setAudioMode(e.target.value as AudioInputMode)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="simulated">Simulated Q&amp;A Cycle</option>
                <option value="microphone">Live Microphone (RMS + ZCR)</option>
                <option value="muted">Muted Fallback (65 pts)</option>
              </select>
            </div>
          </section>

          {/* Classroom Roster Editor */}
          <section className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <label
              htmlFor="roster-editor"
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400"
            >
              Classroom Roster Mapping
            </label>
            <textarea
              id="roster-editor"
              rows={5}
              value={rosterText}
              onChange={(e) => setRosterText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </section>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Header (3-Zone Single Row) */}
        <header className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open control panel"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 lg:hidden text-slate-700 dark:text-slate-200"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-base sm:text-lg font-bold font-display text-slate-900 dark:text-slate-100 truncate">
              Multimodal Attendance &amp; Engagement Agent
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleResetSession}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Session
            </button>
            <button
              type="button"
              onClick={() => setAgentRunning((r) => !r)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors ${
                agentRunning
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-sky-600 hover:bg-sky-500'
              }`}
            >
              {agentRunning ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop Camera Agent
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Start Camera Agent
                </>
              )}
            </button>
          </div>
        </header>

        {/* 5-Tab Navigation Strip */}
        <nav
          aria-label="Workspace Views"
          className="px-5 pt-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center gap-2 overflow-x-auto"
        >
          {(
            [
              { id: 'monitor', label: 'Live Classroom Monitor', icon: Camera },
              { id: 'analytics', label: 'Session Dynamics & Analytics', icon: BarChart3 },
              { id: 'simulator', label: 'Student Safe-Leave Simulator', icon: Calculator },
              { id: 'audit', label: 'Timestamped Attendance & SHA-256 Audit Logs', icon: FileSpreadsheet },
              { id: 'demo', label: 'Demo Video Studio (60s)', icon: Film },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Main Viewport Content */}
        <main className="flex-1 p-5 max-w-[1440px] w-full mx-auto">
          {cameraError && (
            <div className="mb-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-rose-900 dark:text-rose-200">
              <span>{cameraError}</span>
              {videoSource === 'webcam' && (
                <button
                  type="button"
                  onClick={() => {
                    setCameraError(null);
                    setVideoSource('simulation');
                    setAudioMode('simulated');
                    setAgentRunning(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  Use Virtual Demo Class Instead
                </button>
              )}
            </div>
          )}

          {/* TAB 1: Live Classroom Monitor (mounted continuously while running) */}
          <div className={activeTab === 'monitor' ? 'space-y-5' : 'hidden'}>
            {/* Top Row: 5 KPI Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Live Engagement
                </div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {classEngagement.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Peak Engagement
                </div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {peakEngagement.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Participants In Frame
                </div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {activeParticipants.length}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Marked Present
                </div>
                <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                  {markedPresentCount}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Audio Activity &amp; FPS
                </div>
                <div className="mt-1 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 truncate">
                  {audioState.split('/')[0].trim()} · {fps.toFixed(1)} FPS
                </div>
              </div>
            </div>

            {/* 2-Column Monitor Workspace */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              {/* Left: 640x480 Video Viewport + Scenario 3 Teaching Suggestion */}
              <div className="xl:col-span-6 space-y-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-3 space-y-2.5">
                  {/* Direct Mode Switcher: Real-Time Camera vs Video Upload vs Virtual Demo */}
                  <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      {(
                        [
                          { id: 'webcam', label: 'Real-Time Camera' },
                          { id: 'video', label: 'Upload Video' },
                          { id: 'simulation', label: 'Virtual Demo' },
                        ] as const
                      ).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            if (agentRunning && mode.id !== videoSource) {
                              setAgentRunning(false);
                            }
                            setVideoSource(mode.id);
                            if (mode.id === 'webcam') setAudioMode('microphone');
                            if (mode.id === 'simulation') setAudioMode('simulated');
                            setCameraError(null);
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                            videoSource === mode.id
                              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {videoSource === 'webcam' && (
                      <div className="flex items-center gap-2">
                        {cameraDevices.length > 1 && (
                          <select
                            aria-label="Select camera device"
                            value={selectedCameraId}
                            onChange={(e) => setSelectedCameraId(e.target.value)}
                            className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200 max-w-[155px]"
                          >
                            {cameraDevices.map((dev, idx) => (
                              <option
                                key={`${dev.deviceId || 'cam'}-${idx}`}
                                value={dev.deviceId}
                              >
                                {dev.label || `Camera ${idx + 1}`}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => setMirrorCamera((m) => !m)}
                          className={`px-2 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                            mirrorCamera
                              ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                              : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Mirror
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <canvas
                      ref={displayCanvasRef}
                      width={FRAME_WIDTH}
                      height={FRAME_HEIGHT}
                      className="w-full h-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-900 block"
                    />
                    {!agentRunning && (
                      <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
                        <button
                          type="button"
                          onClick={() => setAgentRunning(true)}
                          className="pointer-events-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white shadow-lg transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          {videoSource === 'webcam'
                            ? 'Start Real-Time Camera & Mic'
                            : videoSource === 'video'
                            ? 'Analyze Uploaded Video'
                            : 'Start Virtual Demo Class'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Scenario 3: AI-Driven Pedagogical Teaching Suggestion */}
                <div
                  className={`rounded-xl border p-4 transition-colors ${suggestionStyles[suggestion.level]}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold opacity-80">
                        <Activity className="w-3.5 h-3.5" />
                        Pedagogical Decision Support
                      </div>
                      <h3 className="mt-1 text-sm font-bold">{suggestion.title}</h3>
                      <p className="mt-1 text-xs sm:text-sm leading-relaxed opacity-90">
                        {suggestion.body}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Altair-style Engagement Trend + Live Behavioral Roster */}
              <div className="xl:col-span-6 space-y-4">
                <EngagementTrendChart data={engagementHistory} />

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Live Behavioral Roster
                      </h3>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      Threshold: {presenceThreshold}s
                    </span>
                  </div>

                  {activeParticipants.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                      No participants currently tracked in frame. Start Camera Agent to monitor sustained presence and engagement.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-600 dark:text-slate-400">
                            <th className="py-2.5 px-3">Participant</th>
                            <th className="py-2.5 px-3">Presence Timer</th>
                            <th className="py-2.5 px-3">Head Pose</th>
                            <th className="py-2.5 px-3 text-right">Inactivity</th>
                            <th className="py-2.5 px-3 text-right">Engagement</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {activeParticipants.map((p, idx) => {
                            const pct = p.markedPresent
                              ? 100
                              : Math.min(
                                  100,
                                  (p.sustainedSec / Math.max(1, presenceThreshold)) * 100
                                );
                            return (
                              <tr
                                key={`${p.trackId}-${p.studentId}-${idx}`}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                              >
                                <td className="py-2.5 px-3">
                                  <div className="font-medium text-slate-900 dark:text-slate-100">
                                    {p.name}
                                  </div>
                                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    {p.studentId}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 min-w-[150px]">
                                  <div className="flex items-center justify-between mb-1 font-mono tabular-nums">
                                    <span
                                      className={
                                        p.markedPresent
                                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                          : 'text-sky-600 dark:text-sky-400'
                                      }
                                    >
                                      {p.markedPresent
                                        ? '✅ PRESENT'
                                        : `⏳ ${p.sustainedSec.toFixed(1)}s / ${presenceThreshold}s`}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className={`h-full transition-all duration-200 ${
                                        p.markedPresent ? 'bg-emerald-500' : 'bg-sky-500'
                                      }`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={
                                      p.headPose === 'Focused'
                                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                        : 'text-amber-600 dark:text-amber-400 font-medium'
                                    }
                                  >
                                    {p.headPose}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                  {p.inactivityTotalSec.toFixed(1)}s
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                  {p.engagementScore.toFixed(0)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* TAB 2: Session Dynamics & Analytics */}
          {activeTab === 'analytics' && (
            <SessionAnalyticsTab
              participants={allParticipants}
              history={engagementHistory}
              events={events}
              peakEngagement={peakEngagement}
              attentionDropCount={attentionDropCount}
              sessionStartTs={sessionStartTs}
            />
          )}

          {/* TAB 3: Student Safe-Leave Simulator */}
          {activeTab === 'simulator' && (
            <SafeLeaveSimulatorTab roster={parsedRoster} />
          )}

          {/* TAB 4: Timestamped Attendance & SHA-256 Audit Logs */}
          {activeTab === 'audit' && (
            <AuditLogsTab
              attendanceLogs={attendanceLogs}
              auditLedger={auditLedger}
              onClearAttendanceLogs={handleClearAttendanceLogs}
            />
          )}

          {/* TAB 5: Offline 60-Second Demo Video Studio */}
          {activeTab === 'demo' && (
            <DemoVideoStudioTab darkMode={darkMode} />
          )}
        </main>
      </div>
    </div>
  );
}
