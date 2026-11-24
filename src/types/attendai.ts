export type VideoInputSource = 'webcam' | 'video' | 'simulation';
export type AudioInputMode = 'microphone' | 'simulated' | 'muted';
export type SimulationScenario = 'balanced' | 'peak' | 'distracted' | 'static' | 'empty';

export type HeadPoseState = 'Focused' | 'Looking Away';
export type MovementState = 'Attentive' | 'Static (Inactive)' | 'Restless';
export type AudioState =
  | 'Silence / Passive'
  | 'Active Speech / Q&A'
  | 'High Noise / Disturbance';

export interface RosterEntry {
  studentId: string;
  name: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceDetection {
  bbox: BoundingBox;
  confidence: number;
  poseHint?: HeadPoseState;
}

export interface TrackedParticipant {
  trackId: number;
  studentId: string;
  name: string;
  bbox: BoundingBox;
  centroid: { x: number; y: number };
  prevCentroid: { x: number; y: number };
  firstSeenTs: number;
  lastSeenTs: number;
  sustainedSec: number;
  markedPresent: boolean;
  presentTimestamp: string | null;
  sha256Token: string;
  headPose: HeadPoseState;
  poseScore: number;
  movementState: MovementState;
  movementScore: number;
  staticStreakSec: number;
  inactivityTotalSec: number;
  engagementScore: number;
  engagementSamples: number[];
  peakEngagement: number;
  missedFrames: number;
  inactivityAlertLogged: boolean;
}

export interface AttendanceRecord {
  Student_ID: string;
  Name: string;
  Timestamp: string;
  Sustained_Sec: number;
  Avg_Engagement_Pct: number;
  Status: 'PRESENT';
  SHA256_Token: string;
}

export interface AuditLedgerEntry {
  Ledger_Index: number;
  Timestamp: string;
  Student_ID: string;
  Name: string;
  Sustained_Sec: number;
  Avg_Engagement_Pct: number;
  Prev_Hash: string;
  SHA256_Token: string;
}

export interface EngagementSample {
  step: number;
  time: string;
  engagement: number;
}

export type ClassroomEventType =
  | 'Arrival'
  | 'Attendance Commit'
  | 'Inactivity Alert'
  | 'Attention Drop';

export interface ClassroomEvent {
  id: string;
  time: string;
  type: ClassroomEventType;
  detail: string;
}

export interface TeachingSuggestion {
  level: 'info' | 'warn' | 'alert' | 'success';
  title: string;
  body: string;
  actionLabel: string;
}

export interface FusionWeights {
  pose: number;
  movement: number;
  audio: number;
}

export const DEFAULT_ROSTER: RosterEntry[] = [
  { studentId: 'STU-101', name: 'Aarav Sharma' },
  { studentId: 'STU-102', name: 'Diya Patel' },
  { studentId: 'STU-103', name: 'Rohan Verma' },
  { studentId: 'STU-104', name: 'Ananya Iyer' },
  { studentId: 'STU-105', name: 'Kabir Mehta' },
  { studentId: 'STU-106', name: 'Meera Nair' },
  { studentId: 'STU-107', name: 'Vikram Rao' },
  { studentId: 'STU-108', name: 'Ishita Joshi' },
  { studentId: 'STU-109', name: 'Siddharth Gupta' },
  { studentId: 'STU-110', name: 'Priya Kulkarni' },
];
