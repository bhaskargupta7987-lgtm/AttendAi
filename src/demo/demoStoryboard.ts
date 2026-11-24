export interface DemoCallout {
  id: string;
  label: string;
  detail: string;
  /** Normalized coordinates (0..1) on the 1280x720 canvas */
  targetX: number;
  targetY: number;
  boxX: number;
  boxY: number;
  accent: 'sky' | 'emerald' | 'amber' | 'rose';
  startSec: number; // local chapter second (0..15)
  endSec: number;
}

export interface DemoCaptionCue {
  startSec: number; // local chapter second (0..15)
  endSec: number;
  headline: string;
  text: string;
}

export interface DemoChapter {
  id: 'attendance' | 'engagement' | 'guidance' | 'compliance';
  index: number;
  code: string;
  title: string;
  subtitle: string;
  startSec: number; // global second (0, 15, 30, 45)
  durationSec: number; // 15
  features: string[];
  captions: DemoCaptionCue[];
  callouts: DemoCallout[];
}

export const TOTAL_DEMO_DURATION_SEC = 60;
export const DEMO_VIDEO_WIDTH = 1280;
export const DEMO_VIDEO_HEIGHT = 720;

export const DEFAULT_DEMO_CHAPTERS: DemoChapter[] = [
  {
    id: 'attendance',
    index: 0,
    code: '01',
    title: 'Automated Attendance & Sustained Presence',
    subtitle: 'EMA-smoothed face tracking with 8-second continuous verification',
    startSec: 0,
    durationSec: 15,
    features: [
      '640×480 Dual-Space YCrCb + HSV Detection',
      'EMA Centroid & Bounding-Box Tracker',
      '8s Sustained Presence → Emerald PRESENT',
      'Automatic Offline CSV Attendance Commit',
    ],
    captions: [
      {
        startSec: 0,
        endSec: 5,
        headline: 'AttendAI · 100% Offline Classroom Intelligence',
        text: 'Track participants across frames with an EMA-smoothed centroid tracker that eliminates single-frame flicker.',
      },
      {
        startSec: 5,
        endSec: 10.5,
        headline: 'Sustained Presence Verification (8s Rule)',
        text: 'Students are marked PRESENT only after continuous verified presence—preventing false positives from brief passersby.',
      },
      {
        startSec: 10.5,
        endSec: 15,
        headline: 'Instant Roster Sync & Offline CSV Commit',
        text: 'Bounding boxes snap to emerald green and append timestamped attendance logs locally with zero raw video stored.',
      },
    ],
    callouts: [
      {
        id: 'c1-ema',
        label: 'EMA Bounding Box',
        detail: '1.4s occlusion grace · zero jitter',
        targetX: 0.25,
        targetY: 0.34,
        boxX: 0.05,
        boxY: 0.14,
        accent: 'sky',
        startSec: 1.0,
        endSec: 6.5,
      },
      {
        id: 'c1-timer',
        label: 'Sustained Timer',
        detail: 'Continuous 8.0s threshold',
        targetX: 0.39,
        targetY: 0.56,
        boxX: 0.37,
        boxY: 0.14,
        accent: 'emerald',
        startSec: 5.2,
        endSec: 11.5,
      },
      {
        id: 'c1-roster',
        label: 'Live Roster Commit',
        detail: 'Auto-logged to offline CSV',
        targetX: 0.78,
        targetY: 0.44,
        boxX: 0.68,
        boxY: 0.14,
        accent: 'emerald',
        startSec: 9.8,
        endSec: 14.8,
      },
    ],
  },
  {
    id: 'engagement',
    index: 1,
    code: '02',
    title: 'Multimodal Engagement & Session Dynamics',
    subtitle: 'Weighted fusion of head pose, movement inactivity, and audio RMS/ZCR',
    startSec: 15,
    durationSec: 15,
    features: [
      'Head Pose: Focused (98) vs. Looking Away (45)',
      'Movement & Static Inactivity Detection (≥8s)',
      'Offline Audio RMS + Zero-Crossing Rate',
      'Live Engagement Curve (55% Drop / 78% Peak)',
    ],
    captions: [
      {
        startSec: 0,
        endSec: 5,
        headline: 'Three Real-Time Behavioral Signals',
        text: 'Continuously evaluate Head Pose (50%), Movement & Static Inactivity (25%), and Classroom Audio RMS/ZCR (25%).',
      },
      {
        startSec: 5,
        endSec: 10.2,
        headline: 'Live Multimodal Engagement Curve',
        text: 'Normalized weights fuse into a 0–100% live class score, highlighting interaction peaks above 78% and drops below 55%.',
      },
      {
        startSec: 10.2,
        endSec: 15,
        headline: 'Acoustic State Classification',
        text: 'Distinguishes Active Speech / Q&A (100 pts), Passive Silence (65 pts), and High Ambient Noise (35 pts) offline.',
      },
    ],
    callouts: [
      {
        id: 'c2-weights',
        label: 'Multimodal Fusion',
        detail: '50% Pose · 25% Motion · 25% Audio',
        targetX: 0.24,
        targetY: 0.36,
        boxX: 0.05,
        boxY: 0.14,
        accent: 'sky',
        startSec: 0.8,
        endSec: 6.5,
      },
      {
        id: 'c2-chart',
        label: 'Peak & Drop Thresholds',
        detail: '>78% Peak · <55% Attention Drop',
        targetX: 0.72,
        targetY: 0.38,
        boxX: 0.62,
        boxY: 0.14,
        accent: 'emerald',
        startSec: 5.0,
        endSec: 11.2,
      },
      {
        id: 'c2-audio',
        label: 'RMS + ZCR Audio',
        detail: 'Active Q&A vs. High Noise',
        targetX: 0.24,
        targetY: 0.67,
        boxX: 0.35,
        boxY: 0.67,
        accent: 'amber',
        startSec: 9.5,
        endSec: 14.8,
      },
    ],
  },
  {
    id: 'guidance',
    index: 2,
    code: '03',
    title: 'AI Teaching Suggestions & Event Analytics',
    subtitle: 'Context-aware pedagogical prompts paired with chronological session logs',
    startSec: 30,
    durationSec: 15,
    features: [
      'Static Inactivity ≥8s → Quick Poll Prompt',
      'Engagement <55% → Visual Aid / Reset Alert',
      'Engagement >78% → Complex Concept Window',
      'Automated HH:MM:SS Classroom Event Timeline',
    ],
    captions: [
      {
        startSec: 0,
        endSec: 5,
        headline: 'Real-Time Pedagogical Decision Support',
        text: 'Non-enforcing teaching banners adapt dynamically when learners become passive or look away from instruction.',
      },
      {
        startSec: 5,
        endSec: 10.2,
        headline: 'Actionable Recovery & Peak Pacing',
        text: 'Detects attention drops below 55% to recommend visual aids, and signals peak cognitive readiness above 78%.',
      },
      {
        startSec: 10.2,
        endSec: 15,
        headline: 'Automated Session Dynamics & Timeline',
        text: 'Every arrival, attendance commit, inactivity alert, and attention drop is indexed in a filterable HH:MM:SS timeline.',
      },
    ],
    callouts: [
      {
        id: 'c3-banner',
        label: 'Live Teaching Prompt',
        detail: 'Context-aware instructor guidance',
        targetX: 0.33,
        targetY: 0.42,
        boxX: 0.05,
        boxY: 0.14,
        accent: 'amber',
        startSec: 0.8,
        endSec: 6.2,
      },
      {
        id: 'c3-peak',
        label: 'Peak Window (>78%)',
        detail: 'Optimal time for complex concepts',
        targetX: 0.33,
        targetY: 0.63,
        boxX: 0.34,
        boxY: 0.14,
        accent: 'emerald',
        startSec: 5.8,
        endSec: 10.8,
      },
      {
        id: 'c3-timeline',
        label: 'HH:MM:SS Event Log',
        detail: 'Filterable arrivals & alerts',
        targetX: 0.78,
        targetY: 0.46,
        boxX: 0.67,
        boxY: 0.14,
        accent: 'sky',
        startSec: 9.8,
        endSec: 14.8,
      },
    ],
  },
  {
    id: 'compliance',
    index: 3,
    code: '04',
    title: 'Safe-Leave Simulator & SHA-256 Audit Ledger',
    subtitle: '75% exam eligibility forecasting and tamper-proof cryptographic logs',
    startSec: 45,
    durationSec: 15,
    features: [
      'Self-Service 0–15 Missed Class Simulator',
      'Mandatory 75.0% Exam Eligibility Curve',
      'Hash-Chained SHA-256 Audit Ledger',
      'One-Click Integrity Verification & CSV Export',
    ],
    captions: [
      {
        startSec: 0,
        endSec: 5.5,
        headline: 'Student Safe-Leave & 75% Eligibility Simulator',
        text: 'Students model missing 0–15 upcoming classes to view their exact Safe Leave Buffer and projected compliance curve.',
      },
      {
        startSec: 5.5,
        endSec: 11,
        headline: 'Immutable SHA-256 Cryptographic Audit Ledger',
        text: 'Each verified PRESENT commit chains to the previous SHA-256 hash—verifiable offline in one click with CSV export.',
      },
      {
        startSec: 11,
        endSec: 15,
        headline: 'AttendAI — Privacy-Preserving Classroom Intelligence',
        text: '100% offline execution · Zero external APIs · Enterprise attendance, engagement, and auditability in one workspace.',
      },
    ],
    callouts: [
      {
        id: 'c4-sim',
        label: '75% Eligibility Rule',
        detail: 'Live Safe Zone vs. Warning check',
        targetX: 0.28,
        targetY: 0.45,
        boxX: 0.05,
        boxY: 0.14,
        accent: 'sky',
        startSec: 0.8,
        endSec: 6.2,
      },
      {
        id: 'c4-chain',
        label: 'SHA-256 Hash Chain',
        detail: 'Prev_Hash → SHA256_Token link',
        targetX: 0.74,
        targetY: 0.45,
        boxX: 0.65,
        boxY: 0.14,
        accent: 'emerald',
        startSec: 5.6,
        endSec: 11.4,
      },
      {
        id: 'c4-verify',
        label: '0 Tampering Verified',
        detail: 'Exportable offline CSV & ledger',
        targetX: 0.76,
        targetY: 0.66,
        boxX: 0.44,
        boxY: 0.14,
        accent: 'emerald',
        startSec: 10.2,
        endSec: 14.8,
      },
    ],
  },
];

export function formatTimecode(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const rem = clamped % 60;
  const whole = Math.floor(rem);
  const tenths = Math.floor((rem - whole) * 10);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenths}`;
}

export function getActiveChapter(
  chapters: DemoChapter[],
  globalSec: number
): { chapter: DemoChapter; localSec: number } {
  const clamped = Math.max(0, Math.min(TOTAL_DEMO_DURATION_SEC - 0.001, globalSec));
  for (const ch of chapters) {
    if (clamped >= ch.startSec && clamped < ch.startSec + ch.durationSec) {
      return { chapter: ch, localSec: clamped - ch.startSec };
    }
  }
  const last = chapters[chapters.length - 1];
  return { chapter: last, localSec: last.durationSec };
}
