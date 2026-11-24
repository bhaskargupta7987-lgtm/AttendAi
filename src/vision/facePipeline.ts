import {
  AudioState,
  BoundingBox,
  ClassroomEvent,
  DEFAULT_ROSTER,
  FaceDetection,
  FusionWeights,
  HeadPoseState,
  RosterEntry,
  SimulationScenario,
  TrackedParticipant,
} from '../types/attendai';

export const FRAME_WIDTH = 640;
export const FRAME_HEIGHT = 480;

interface NativeFaceDetector {
  detect(image: CanvasImageSource): Promise<
    Array<{
      boundingBox: DOMRectReadOnly;
      landmarks?: Array<{ type: string; locations: Array<{ x: number; y: number }> }>;
    }>
  >;
}

declare global {
  interface Window {
    FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => NativeFaceDetector;
  }
}

function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter === 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function nonMaxSuppression(detections: FaceDetection[], iouThresh = 0.35): FaceDetection[] {
  if (detections.length <= 1) return detections;
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: FaceDetection[] = [];
  for (const det of sorted) {
    if (kept.every((k) => computeIoU(det.bbox, k.bbox) < iouThresh)) {
      kept.push(det);
    }
  }
  return kept;
}

/**
 * Dual-space YCrCb + HSV skin & cranial region detector on 640x480 canvas pixels.
 * Downsamples to 160x120 for fast 30fps browser execution with morphological filtering,
 * fill-solidity check, aspect-ratio filtering, desk-height exclusion, and upper-face contrast.
 */
export class BrowserFaceDetector {
  private nativeDetector: NativeFaceDetector | null = null;
  private workCanvas: HTMLCanvasElement;
  private workCtx: CanvasRenderingContext2D;
  public activeEngineLabel = 'YCrCb + HSV Core Vision';

  constructor() {
    this.workCanvas = document.createElement('canvas');
    this.workCanvas.width = 160;
    this.workCanvas.height = 120;
    const ctx = this.workCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to initialize 2D vision context.');
    }
    this.workCtx = ctx;

    if (typeof window !== 'undefined' && typeof window.FaceDetector === 'function') {
      try {
        this.nativeDetector = new window.FaceDetector({
          fastMode: true,
          maxDetectedFaces: 12,
        });
        this.activeEngineLabel = 'Browser ShapeDetector + YCrCb Core';
      } catch {
        this.nativeDetector = null;
      }
    }
  }

  public async detect(sourceCanvas: HTMLCanvasElement): Promise<FaceDetection[]> {
    // Tier 1: Native Browser FaceDetector API when supported
    if (this.nativeDetector) {
      try {
        const faces = await this.nativeDetector.detect(sourceCanvas);
        if (faces && faces.length > 0) {
          const dets: FaceDetection[] = faces
            .filter((f) => f.boundingBox.width >= 32 && f.boundingBox.height >= 32)
            .map((f) => {
              let poseHint: HeadPoseState | undefined;
              if (f.landmarks && f.landmarks.length >= 2) {
                const eyes = f.landmarks.filter((l) => l.type === 'eye');
                const nose = f.landmarks.find((l) => l.type === 'nose');
                if (eyes.length >= 2 && nose && eyes[0].locations[0] && eyes[1].locations[0] && nose.locations[0]) {
                  const eyeSpan = Math.abs(eyes[1].locations[0].x - eyes[0].locations[0].x);
                  const midEyeX = 0.5 * (eyes[0].locations[0].x + eyes[1].locations[0].x);
                  if (eyeSpan > 1) {
                    const yawRatio = Math.abs(nose.locations[0].x - midEyeX) / eyeSpan;
                    poseHint = yawRatio > 0.36 ? 'Looking Away' : 'Focused';
                  }
                }
              }
              return {
                bbox: {
                  x: Math.max(0, Math.round(f.boundingBox.x)),
                  y: Math.max(0, Math.round(f.boundingBox.y)),
                  w: Math.round(f.boundingBox.width),
                  h: Math.round(f.boundingBox.height),
                },
                confidence: 0.9,
                poseHint,
              };
            });
          return nonMaxSuppression(dets, 0.35);
        }
      } catch {
        // Fall through cleanly to Tier 2 YCrCb + HSV Core
      }
    }

    // Tier 2: Guaranteed YCrCb + HSV Core Vision Detector
    return this.detectCoreYCrCbHsv(sourceCanvas);
  }

  private detectCoreYCrCbHsv(sourceCanvas: HTMLCanvasElement): FaceDetection[] {
    const sw = 160;
    const sh = 120;
    const scaleX = FRAME_WIDTH / sw;
    const scaleY = FRAME_HEIGHT / sh;

    this.workCtx.drawImage(sourceCanvas, 0, 0, sw, sh);
    const img = this.workCtx.getImageData(0, 0, sw, sh);
    const data = img.data;
    const nPix = sw * sh;

    const mask = new Uint8Array(nPix);
    const gray = new Float32Array(nPix);

    for (let i = 0; i < nPix; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;

      // YCrCb conversion
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;

      const ycrcbOk = y >= 22 && cr >= 129 && cr <= 178 && cb >= 73 && cb <= 132;
      if (!ycrcbOk) continue;

      // HSV conversion
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const delta = maxC - minC;
      const v = maxC;
      const s = maxC === 0 ? 0 : (delta / maxC) * 255;

      let h = 0;
      if (delta > 0) {
        if (maxC === r) h = 30 * (((g - b) / delta) % 6);
        else if (maxC === g) h = 30 * ((b - r) / delta + 2);
        else h = 30 * ((r - g) / delta + 4);
        if (h < 0) h += 180;
      }

      const hsvOk =
        v >= 35 && s >= 16 && s <= 210 && ((h >= 0 && h <= 28) || (h >= 160 && h <= 180));
      if (hsvOk) {
        mask[i] = 1;
      }
    }

    // Morphological 3x3 Closing (Dilation -> Erosion) to fill eye/mouth gaps
    const dilated = new Uint8Array(nPix);
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        let any = 0;
        for (let dy = -1; dy <= 1 && !any; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (mask[(y + dy) * sw + (x + dx)]) {
              any = 1;
              break;
            }
          }
        }
        dilated[y * sw + x] = any;
      }
    }
    const closed = new Uint8Array(nPix);
    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        let all = 1;
        for (let dy = -1; dy <= 1 && all; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dilated[(y + dy) * sw + (x + dx)]) {
              all = 0;
              break;
            }
          }
        }
        closed[y * sw + x] = all;
      }
    }

    // Connected component labeling via BFS
    const visited = new Uint8Array(nPix);
    const queue = new Int32Array(nPix);
    const candidates: FaceDetection[] = [];

    for (let start = 0; start < nPix; start++) {
      if (!closed[start] || visited[start]) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;

      let minX = sw;
      let minY = sh;
      let maxX = 0;
      let maxY = 0;
      let area = 0;

      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % sw;
        const cy = (cur / sw) | 0;
        area++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [cur - 1, cur + 1, cur - sw, cur + sw];
        for (const nb of neighbors) {
          if (nb >= 0 && nb < nPix && !visited[nb] && closed[nb]) {
            const nx = nb % sw;
            if (Math.abs(nx - cx) <= 1) {
              visited[nb] = 1;
              queue[tail++] = nb;
            }
          }
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (area < 85 || area > 0.56 * nPix) continue;
      if (bw < 9 || bh < 10) continue;
      if (minY >= 0.72 * sh) continue;

      const ar = bw / bh;
      if (ar < 0.56 || ar > 1.48) continue;

      // Bounding fill solidity proxy (rejects thin open fingers/hands)
      const rectArea = bw * bh;
      const solidity = area / Math.max(1, rectArea);
      if (solidity <= 0.45) continue;

      // Upper-face grayscale standard deviation (> 8.0 for eye/brow texture contrast)
      const upperEnd = Math.min(sh, minY + Math.max(3, Math.floor(0.55 * bh)));
      let sumG = 0;
      let cntG = 0;
      for (let yy = minY; yy < upperEnd; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          sumG += gray[yy * sw + xx];
          cntG++;
        }
      }
      if (cntG === 0) continue;
      const meanG = sumG / cntG;
      let varSum = 0;
      for (let yy = minY; yy < upperEnd; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const d = gray[yy * sw + xx] - meanG;
          varSum += d * d;
        }
      }
      const stdG = Math.sqrt(varSum / cntG);
      if (stdG <= 8.0) continue;

      candidates.push({
        bbox: {
          x: Math.round(minX * scaleX),
          y: Math.round(minY * scaleY),
          w: Math.round(bw * scaleX),
          h: Math.round(bh * scaleY),
        },
        confidence: Math.min(0.95, 0.55 + 0.4 * solidity),
      });
    }

    return nonMaxSuppression(candidates, 0.35);
  }
}

/**
 * Renders a realistic multi-student offline classroom simulation canvas (640x480)
 * tuned so the real YCrCb+HSV vision detector locates and tracks every student cleanly.
 */
export function renderDemoClassroomScene(
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  scenario: SimulationScenario
): void {
  // Cool architectural classroom background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, FRAME_HEIGHT);
  bgGrad.addColorStop(0, '#1B2538');
  bgGrad.addColorStop(0.68, '#243147');
  bgGrad.addColorStop(1, '#141B29');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);

  // Subtle whiteboard / wall panel
  ctx.fillStyle = '#2B3A52';
  ctx.fillRect(48, 44, FRAME_WIDTH - 96, 150);
  ctx.strokeStyle = '#3E506E';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 44, FRAME_WIDTH - 96, 150);

  // Classroom desk strip in lower 25%
  ctx.fillStyle = '#3B2F2F';
  ctx.fillRect(0, 365, FRAME_WIDTH, 115);

  if (scenario === 'empty') {
    return;
  }

  const seats = [
    { baseX: 145, baseY: 185, scale: 1.0, phase: 0.0, skin: '#D9A17C', hair: '#1E1B18', shirt: '#2E5A88' },
    { baseX: 320, baseY: 175, scale: 0.96, phase: 1.7, skin: '#E0AC88', hair: '#2D201A', shirt: '#3B6E5C' },
    { baseX: 495, baseY: 188, scale: 1.02, phase: 3.1, skin: '#CE926B', hair: '#171717', shirt: '#5C4B7D' },
  ];

  seats.forEach((seat, idx) => {
    let dx = 0;
    let dy = 0;
    let turnOffset = 0;

    if (scenario === 'static') {
      // Strictly motionless to trigger >=8s static inactivity alert
      dx = 0;
      dy = 0;
    } else if (scenario === 'distracted') {
      dx = Math.sin(timeSec * 1.4 + seat.phase) * 7;
      dy = Math.cos(timeSec * 0.9 + seat.phase) * 3;
      turnOffset = idx !== 1 ? (idx === 0 ? -13 : 13) : 0;
    } else if (scenario === 'peak') {
      dx = Math.sin(timeSec * 2.1 + seat.phase) * 5;
      dy = Math.cos(timeSec * 2.8 + seat.phase) * 3;
      turnOffset = 0;
    } else {
      // Balanced: student 3 briefly glances aside periodically
      dx = Math.sin(timeSec * 1.5 + seat.phase) * 5;
      dy = Math.cos(timeSec * 1.1 + seat.phase) * 2.5;
      turnOffset = idx === 2 && Math.sin(timeSec * 0.45) > 0.35 ? 11 : 0;
    }

    const cx = seat.baseX + dx;
    const cy = seat.baseY + dy;
    const headRx = 34 * seat.scale;
    const headRy = 42 * seat.scale;

    // Shoulders / torso
    ctx.fillStyle = seat.shirt;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 92, 66 * seat.scale, 58 * seat.scale, 0, Math.PI, 2 * Math.PI);
    ctx.fill();

    // Neck
    ctx.fillStyle = '#B87C58';
    ctx.fillRect(cx - 12, cy + 28, 24, 24);

    // Cranial oval (warm YCrCb/HSV skin range)
    ctx.fillStyle = seat.skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, headRx, headRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair crown
    ctx.fillStyle = seat.hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy - headRy * 0.56, headRx * 1.02, headRy * 0.54, 0, Math.PI, 2 * Math.PI);
    ctx.fill();

    // Strong brow + eye contrast for upper-face std > 10.0 & asymmetric shadow when looking away
    const eyeY = cy - 6;
    const eyeSep = 13 * seat.scale;
    ctx.fillStyle = '#1C1917';
    ctx.fillRect(cx - eyeSep - 7 + turnOffset * 0.5, eyeY - 9, 13, 3.5);
    ctx.fillRect(cx + eyeSep - 6 + turnOffset * 0.5, eyeY - 9, 13, 3.5);

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(cx - eyeSep + turnOffset * 0.55, eyeY, 3.5, 0, Math.PI * 2);
    ctx.arc(cx + eyeSep + turnOffset * 0.55, eyeY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Subtle cheek shading when turned away to simulate profile asymmetry
    if (Math.abs(turnOffset) > 6) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      if (turnOffset < 0) {
        ctx.ellipse(cx + headRx * 0.42, cy, headRx * 0.5, headRy * 0.85, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(cx - headRx * 0.42, cy, headRx * 0.5, headRy * 0.85, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Mouth line
    ctx.strokeStyle = '#6B3E2E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + turnOffset * 0.4, cy + 16, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  });
}

export class ClassroomTracker {
  private roster: RosterEntry[];
  private emaAlpha = 0.35;
  private maxMatchDist = 95;
  private occlusionGraceSec = 1.4;
  private nextTrackNum = 1;

  public tracks = new Map<number, TrackedParticipant>();
  public retiredTracks = new Map<string, TrackedParticipant>();
  public events: ClassroomEvent[] = [];

  constructor(roster: RosterEntry[]) {
    this.roster = roster.length > 0 ? roster : [...DEFAULT_ROSTER];
  }

  public updateRoster(roster: RosterEntry[]): void {
    this.roster = roster.length > 0 ? roster : [...DEFAULT_ROSTER];
    for (const [tid, tr] of this.tracks.entries()) {
      const iden = this.assignIdentity(tid);
      tr.studentId = iden.studentId;
      tr.name = iden.name;
    }
  }

  private assignIdentity(trackNum: number): RosterEntry {
    const idx = trackNum - 1;
    if (idx < this.roster.length) {
      return this.roster[idx];
    }
    return {
      studentId: `STU-${101 + idx}`,
      name: `Participant ${trackNum}`,
    };
  }

  public logEvent(type: ClassroomEvent['type'], detail: string): void {
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
    this.events.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: timeStr,
      type,
      detail,
    });
    if (this.events.length > 250) {
      this.events = this.events.slice(-250);
    }
  }

  public step(params: {
    detections: FaceDetection[];
    frameCanvas: HTMLCanvasElement;
    frameCtx: CanvasRenderingContext2D;
    dt: number;
    presenceThresholdSec: number;
    inactivityThresholdSec: number;
    audioState: AudioState;
    audioScore: number;
    weights: FusionWeights;
    onAttendanceCommit: (participant: TrackedParticipant) => void;
  }): TrackedParticipant[] {
    const now = performance.now() / 1000;
    const dtClamped = Math.max(0.01, Math.min(params.dt, 0.5));
    const { detections, frameCtx, weights } = params;

    const imgData = frameCtx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT).data;

    const detCentroids = detections.map((d) => ({
      x: d.bbox.x + 0.5 * d.bbox.w,
      y: d.bbox.y + 0.5 * d.bbox.h,
    }));

    const unmatchedTracks = new Set<number>(this.tracks.keys());
    const unmatchedDets = new Set<number>(detections.map((_, i) => i));
    const matchedPairs: Array<{ tid: number; did: number }> = [];

    if (unmatchedTracks.size > 0 && unmatchedDets.size > 0) {
      const distances: Array<{ dist: number; tid: number; did: number }> = [];
      for (const tid of unmatchedTracks) {
        const tc = this.tracks.get(tid)!.centroid;
        for (const did of unmatchedDets) {
          const dc = detCentroids[did];
          const dist = Math.hypot(tc.x - dc.x, tc.y - dc.y);
          if (dist <= this.maxMatchDist) {
            distances.push({ dist, tid, did });
          }
        }
      }
      distances.sort((a, b) => a.dist - b.dist);
      for (const pair of distances) {
        if (unmatchedTracks.has(pair.tid) && unmatchedDets.has(pair.did)) {
          matchedPairs.push({ tid: pair.tid, did: pair.did });
          unmatchedTracks.delete(pair.tid);
          unmatchedDets.delete(pair.did);
        }
      }
    }

    // Update matched tracks
    for (const { tid, did } of matchedPairs) {
      const tr = this.tracks.get(tid)!;
      const det = detections[did];
      const dc = detCentroids[did];

      tr.prevCentroid = { ...tr.centroid };
      const a = this.emaAlpha;
      tr.bbox = {
        x: a * det.bbox.x + (1 - a) * tr.bbox.x,
        y: a * det.bbox.y + (1 - a) * tr.bbox.y,
        w: a * det.bbox.w + (1 - a) * tr.bbox.w,
        h: a * det.bbox.h + (1 - a) * tr.bbox.h,
      };
      tr.centroid = {
        x: a * dc.x + (1 - a) * tr.centroid.x,
        y: a * dc.y + (1 - a) * tr.centroid.y,
      };
      tr.lastSeenTs = now;
      tr.missedFrames = 0;
      tr.sustainedSec += dtClamped;

      // 1. Head Pose
      const pose = this.analyzeHeadPose(det, tr.bbox, imgData);
      tr.headPose = pose.label;
      tr.poseScore = pose.score;

      // 2. Movement & Inactivity Duration
      const disp = Math.hypot(
        tr.centroid.x - tr.prevCentroid.x,
        tr.centroid.y - tr.prevCentroid.y
      );
      const speedPxSec = disp / dtClamped;

      if (speedPxSec < 12.0) {
        tr.staticStreakSec += dtClamped;
        tr.inactivityTotalSec += dtClamped;
        if (tr.staticStreakSec >= params.inactivityThresholdSec) {
          tr.movementState = 'Static (Inactive)';
          const excess = Math.min(
            1.0,
            (tr.staticStreakSec - params.inactivityThresholdSec) / 10.0
          );
          tr.movementScore = 72.0 - 22.0 * excess;
          if (!tr.inactivityAlertLogged) {
            tr.inactivityAlertLogged = true;
            this.logEvent(
              'Inactivity Alert',
              `${tr.name} (${tr.studentId}) static for >= ${params.inactivityThresholdSec.toFixed(0)}s`
            );
          }
        } else {
          tr.movementState = 'Attentive';
          tr.movementScore = 96.0;
        }
      } else if (speedPxSec <= 165.0) {
        tr.staticStreakSec = Math.max(0, tr.staticStreakSec - 2.0 * dtClamped);
        tr.inactivityAlertLogged = false;
        tr.movementState = 'Attentive';
        tr.movementScore = 96.0;
      } else {
        tr.staticStreakSec = 0;
        tr.inactivityAlertLogged = false;
        tr.movementState = 'Restless';
        tr.movementScore = 42.0;
      }

      // 3. Multimodal Signal Fusion
      const fused =
        weights.pose * tr.poseScore +
        weights.movement * tr.movementScore +
        weights.audio * params.audioScore;
      tr.engagementScore = Math.max(0, Math.min(100, fused));
      tr.engagementSamples.push(tr.engagementScore);
      if (tr.engagementSamples.length > 3600) {
        tr.engagementSamples = tr.engagementSamples.slice(-3600);
      }
      if (tr.engagementScore > tr.peakEngagement) {
        tr.peakEngagement = tr.engagementScore;
      }

      // 4. Sustained Presence Attendance Commit
      if (!tr.markedPresent && tr.sustainedSec >= params.presenceThresholdSec) {
        tr.markedPresent = true;
        tr.presentTimestamp = new Date()
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19);
        this.logEvent(
          'Attendance Commit',
          `${tr.name} (${tr.studentId}) verified PRESENT after ${tr.sustainedSec.toFixed(1)}s`
        );
        params.onAttendanceCommit(tr);
      }

      this.retiredTracks.set(tr.studentId, tr);
    }

    // Create new tracks for unmatched detections
    for (const did of unmatchedDets) {
      const det = detections[did];
      const dc = detCentroids[did];
      const tid = this.nextTrackNum++;
      const iden = this.assignIdentity(tid);
      const prior = this.retiredTracks.get(iden.studentId);

      const pose = this.analyzeHeadPose(det, det.bbox, imgData);
      const initEng = Math.max(
        0,
        Math.min(
          100,
          weights.pose * pose.score +
            weights.movement * 96.0 +
            weights.audio * params.audioScore
        )
      );

      const tr: TrackedParticipant = {
        trackId: tid,
        studentId: iden.studentId,
        name: iden.name,
        bbox: { ...det.bbox },
        centroid: { ...dc },
        prevCentroid: { ...dc },
        firstSeenTs: now,
        lastSeenTs: now,
        sustainedSec: 0,
        markedPresent: prior?.markedPresent ?? false,
        presentTimestamp: prior?.presentTimestamp ?? null,
        sha256Token: prior?.sha256Token ?? '',
        headPose: pose.label,
        poseScore: pose.score,
        movementState: 'Attentive',
        movementScore: 96.0,
        staticStreakSec: 0,
        inactivityTotalSec: 0,
        engagementScore: initEng,
        engagementSamples: [initEng],
        peakEngagement: initEng,
        missedFrames: 0,
        inactivityAlertLogged: false,
      };
      this.tracks.set(tid, tr);
      this.retiredTracks.set(tr.studentId, tr);
      this.logEvent('Arrival', `${iden.name} (${iden.studentId}) entered classroom frame`);
    }

    // Retire missing tracks only after occlusion grace window
    for (const tid of unmatchedTracks) {
      const tr = this.tracks.get(tid)!;
      tr.missedFrames += 1;
      if (now - tr.lastSeenTs > this.occlusionGraceSec) {
        this.retiredTracks.set(tr.studentId, tr);
        this.tracks.delete(tid);
      }
    }

    return Array.from(this.tracks.values());
  }

  private analyzeHeadPose(
    det: FaceDetection,
    bbox: BoundingBox,
    imgData: Uint8ClampedArray
  ): { label: HeadPoseState; score: number } {
    if (det.poseHint) {
      return det.poseHint === 'Looking Away'
        ? { label: 'Looking Away', score: 45 }
        : { label: 'Focused', score: 98 };
    }

    const normCx = (bbox.x + 0.5 * bbox.w) / FRAME_WIDTH;
    const normCy = (bbox.y + 0.5 * bbox.h) / FRAME_HEIGHT;
    const ar = bbox.w / Math.max(1, bbox.h);

    if (normCx < 0.08 || normCx > 0.92 || normCy < 0.06 || normCy > 0.9) {
      return { label: 'Looking Away', score: 45 };
    }
    if (ar < 0.68 || ar > 1.28) {
      return { label: 'Looking Away', score: 45 };
    }

    // Bilateral facial luminance symmetry check
    const x1 = Math.max(0, Math.round(bbox.x));
    const y1 = Math.max(0, Math.round(bbox.y));
    const x2 = Math.min(FRAME_WIDTH, Math.round(bbox.x + bbox.w));
    const y2 = Math.min(FRAME_HEIGHT, Math.round(bbox.y + bbox.h));
    if (x2 - x1 >= 24 && y2 - y1 >= 24) {
      const mid = Math.floor((x1 + x2) / 2);
      let leftSum = 0;
      let leftCnt = 0;
      let rightSum = 0;
      let rightCnt = 0;
      for (let y = y1; y < y2; y += 2) {
        for (let x = x1; x < x2; x += 2) {
          const i = (y * FRAME_WIDTH + x) * 4;
          const lum = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
          if (x < mid) {
            leftSum += lum;
            leftCnt++;
          } else {
            rightSum += lum;
            rightCnt++;
          }
        }
      }
      const leftMean = leftCnt > 0 ? leftSum / leftCnt : 0;
      const rightMean = rightCnt > 0 ? rightSum / rightCnt : 0;
      const denom = Math.max(1, 0.5 * (leftMean + rightMean));
      if (Math.abs(leftMean - rightMean) / denom > 0.26) {
        return { label: 'Looking Away', score: 45 };
      }
    }

    return { label: 'Focused', score: 98 };
  }
}

export function drawHudOverlay(params: {
  ctx: CanvasRenderingContext2D;
  tracks: TrackedParticipant[];
  presenceThresholdSec: number;
  inactivityThresholdSec: number;
  classEngagement: number;
  audioState: AudioState;
  fps: number;
  engineLabel: string;
}): void {
  const {
    ctx,
    tracks,
    presenceThresholdSec,
    inactivityThresholdSec,
    classEngagement,
    audioState,
    fps,
    engineLabel,
  } = params;

  // Top translucent telemetry bar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(0, 0, FRAME_WIDTH, 34);
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(
    `AttendAI · ${engineLabel.split('+')[0].trim()} · Faces: ${tracks.length}`,
    12,
    21
  );
  ctx.fillStyle = '#38BDF8';
  ctx.textAlign = 'right';
  ctx.fillText(
    `Eng: ${classEngagement.toFixed(0)}% · ${audioState.split('/')[0].trim()} · ${fps.toFixed(1)} FPS`,
    FRAME_WIDTH - 12,
    21
  );
  ctx.textAlign = 'left';

  for (const tr of tracks) {
    const x = Math.max(2, Math.min(FRAME_WIDTH - 12, Math.round(tr.bbox.x)));
    const y = Math.max(38, Math.min(FRAME_HEIGHT - 12, Math.round(tr.bbox.y)));
    const w = Math.max(16, Math.min(FRAME_WIDTH - x - 2, Math.round(tr.bbox.w)));
    const h = Math.max(16, Math.min(FRAME_HEIGHT - y - 2, Math.round(tr.bbox.h)));

    let strokeCol = '#38BDF8';
    let statusTxt = `⏳ ${tr.sustainedSec.toFixed(1)}s / ${presenceThresholdSec.toFixed(0)}s`;

    if (tr.markedPresent) {
      strokeCol = '#10B981';
      statusTxt = `✅ PRESENT · ${tr.engagementScore.toFixed(0)}%`;
    } else if (
      tr.staticStreakSec >= inactivityThresholdSec ||
      tr.headPose === 'Looking Away'
    ) {
      strokeCol = '#F59E0B';
      statusTxt = `⏳ ${tr.sustainedSec.toFixed(1)}s / ${presenceThresholdSec.toFixed(0)}s · ${tr.headPose}`;
    }

    // Bounding box
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    // Header tag above box
    const headerW = Math.max(w, 136);
    const labelY = Math.max(56, y - 4);
    ctx.fillStyle = strokeCol;
    ctx.fillRect(x, labelY - 18, Math.min(FRAME_WIDTH - x, headerW), 18);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${tr.studentId} ${tr.name.split(' ')[0]}`, x + 5, labelY - 5);

    // Sustained presence progress bar at bottom of box
    const progress = tr.markedPresent
      ? 1
      : Math.min(1, tr.sustainedSec / Math.max(1, presenceThresholdSec));
    const barW = Math.max(w, 124);
    const barY = Math.min(FRAME_HEIGHT - 26, y + h + 4);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x, barY, Math.min(FRAME_WIDTH - x - 2, barW), 7);
    ctx.fillStyle = strokeCol;
    ctx.fillRect(
      x,
      barY,
      Math.round(Math.min(FRAME_WIDTH - x - 2, barW) * progress),
      7
    );

    // Timer / Verified text below bar
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = strokeCol;
    ctx.fillText(statusTxt, x, Math.min(FRAME_HEIGHT - 6, barY + 19));
  }
}
