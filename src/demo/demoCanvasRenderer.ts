import {
  DEMO_VIDEO_HEIGHT,
  DEMO_VIDEO_WIDTH,
  DemoCallout,
  DemoChapter,
  formatTimecode,
  getActiveChapter,
  TOTAL_DEMO_DURATION_SEC,
} from './demoStoryboard';

interface Palette {
  canvasBg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  gridLine: string;
  sky: string;
  emerald: string;
  amber: string;
  rose: string;
}

const DARK_PALETTE: Palette = {
  canvasBg: '#0B1120',
  surface: '#111827',
  surfaceAlt: '#162033',
  border: '#253248',
  textPrimary: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  gridLine: '#1E293B',
  sky: '#38BDF8',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
};

const LIGHT_PALETTE: Palette = {
  canvasBg: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#CBD5E1',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  gridLine: '#E2E8F0',
  sky: '#0284C7',
  emerald: '#059669',
  amber: '#D97706',
  rose: '#E11D48',
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 12,
  fill?: string,
  stroke?: string
): void {
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = fill ?? p.surface;
  ctx.fill();
  ctx.strokeStyle = stroke ?? p.border;
  ctx.lineWidth = 1.25;
  ctx.stroke();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = words[i];
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, curY);
  }
  return curY;
}

function drawChromeBar(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  chapter: DemoChapter,
  globalSec: number
): void {
  ctx.fillStyle = p.surface;
  ctx.fillRect(0, 0, DEMO_VIDEO_WIDTH, 58);
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 58);
  ctx.lineTo(DEMO_VIDEO_WIDTH, 58);
  ctx.stroke();

  // Brand + Chapter breadcrumb
  ctx.font = '800 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('AttendAI', 28, 35);

  ctx.font = '500 13px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = p.textMuted;
  ctx.fillText(`  /  ${chapter.code}. ${chapter.title}`, 112, 35);

  // Right-side chapter progress indicator (unboxed monospace metadata)
  ctx.textAlign = 'right';
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillStyle = p.sky;
  ctx.fillText(
    `100% OFFLINE  ·  ${formatTimecode(globalSec)} / 01:00.0`,
    DEMO_VIDEO_WIDTH - 28,
    34
  );
  ctx.textAlign = 'left';

  // Top thin global timeline progress bar
  const progressW = (clamp01(globalSec / TOTAL_DEMO_DURATION_SEC) * DEMO_VIDEO_WIDTH);
  ctx.fillStyle = p.sky;
  ctx.fillRect(0, 56, progressW, 2.5);
}

// ---------------------------------------------------------------------------
// Chapter 1: Automated Attendance & Sustained Presence (00:00 - 00:15)
// ---------------------------------------------------------------------------
function drawChapter1Attendance(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  localSec: number
): void {
  const vx = 42;
  const vy = 84;
  const vw = 680;
  const vh = 468;

  // Left: Classroom Vision Viewport Card
  drawCard(ctx, p, vx, vy, vw, vh, 14);
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillStyle = p.textMuted;
  ctx.fillText('LIVE CLASSROOM MONITOR · 640×480 EMA VISION ENGINE', vx + 18, vy + 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = p.emerald;
  ctx.fillText('29.8 FPS · 3 TRACKED', vx + vw - 18, vy + 28);
  ctx.textAlign = 'left';

  // Classroom scene inside viewport
  const fx = vx + 18;
  const fy = vy + 42;
  const fw = vw - 36;
  const fh = vh - 60;
  ctx.save();
  roundRectPath(ctx, fx, fy, fw, fh, 10);
  ctx.clip();

  const bgGrad = ctx.createLinearGradient(fx, fy, fx, fy + fh);
  bgGrad.addColorStop(0, '#182234');
  bgGrad.addColorStop(0.72, '#223047');
  bgGrad.addColorStop(1, '#111827');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(fx, fy, fw, fh);

  // Subtle lecture board & desk plane
  ctx.fillStyle = '#293850';
  ctx.fillRect(fx + 44, fy + 26, fw - 88, 122);
  ctx.strokeStyle = '#3B4E6B';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(fx + 44, fy + 26, fw - 88, 122);

  ctx.fillStyle = '#2E2626';
  ctx.fillRect(fx, fy + fh - 84, fw, 84);

  const students = [
    {
      id: 'STU-101',
      name: 'Aarav',
      fullName: 'Aarav Sharma',
      cx: fx + 135,
      cy: fy + 180,
      skin: '#D9A17C',
      shirt: '#2E5A88',
      startOffset: 0.4,
      eng: 94,
    },
    {
      id: 'STU-102',
      name: 'Diya',
      fullName: 'Diya Patel',
      cx: fx + 322,
      cy: fy + 168,
      skin: '#E0AC88',
      shirt: '#346858',
      startOffset: 1.5,
      eng: 91,
    },
    {
      id: 'STU-103',
      name: 'Rohan',
      fullName: 'Rohan Verma',
      cx: fx + 510,
      cy: fy + 182,
      skin: '#CE926B',
      shirt: '#544675',
      startOffset: 3.0,
      eng: 86,
    },
  ];

  const threshold = 8.0;

  students.forEach((st, i) => {
    const dx = Math.sin(localSec * 1.5 + i * 1.9) * 4.5;
    const dy = Math.cos(localSec * 1.1 + i * 1.4) * 2.5;
    const cx = st.cx + dx;
    const cy = st.cy + dy;

    // Shoulders
    ctx.fillStyle = st.shirt;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 92, 62, 56, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Neck & Head
    ctx.fillStyle = '#B87C58';
    ctx.fillRect(cx - 11, cy + 28, 22, 22);
    ctx.fillStyle = st.skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 32, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair & Eyes
    ctx.fillStyle = '#1B1917';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 22, 33, 21, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 11, cy - 5, 3, 0, Math.PI * 2);
    ctx.arc(cx + 11, cy - 5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Sustained presence calculation
    const sustained = Math.max(0, localSec - st.startOffset);
    const verified = sustained >= threshold;
    const pct = Math.min(1, sustained / threshold);
    const color = verified ? '#10B981' : '#38BDF8';

    // EMA Bounding Box
    const bx = cx - 44;
    const by = cy - 48;
    const bw = 88;
    const bh = 96;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx, by, bw, bh);

    // Header bar
    ctx.fillStyle = color;
    ctx.fillRect(bx, by - 20, 114, 20);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${st.id} ${st.name}`, bx + 5, by - 6);

    // Sustained Progress Bar on box bottom
    const barY = by + bh + 6;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(bx, barY, 114, 7);
    ctx.fillStyle = color;
    ctx.fillRect(bx, barY, Math.round(114 * pct), 7);

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.fillText(
      verified ? `PRESENT · ${st.eng}%` : `${sustained.toFixed(1)}s / 8s`,
      bx,
      barY + 21
    );
  });

  // Top HUD strip inside camera canvas
  ctx.fillStyle = 'rgba(15, 23, 42, 0.76)';
  ctx.fillRect(fx, fy, fw, 32);
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText('AttendAI · YCrCb + HSV Core · EMA Alpha 0.35', fx + 12, fy + 20);
  ctx.restore();

  // Right Column: Live Behavioral Roster + Offline CSV Commit Panel
  const rx = 746;
  const rw = 492;
  drawCard(ctx, p, rx, vy, rw, 314, 14);
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('Live Behavioral Roster', rx + 20, vy + 32);
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = p.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText('Threshold: 8.0s', rx + rw - 20, vy + 32);
  ctx.textAlign = 'left';

  // Table header divider
  ctx.strokeStyle = p.border;
  ctx.beginPath();
  ctx.moveTo(rx + 18, vy + 46);
  ctx.lineTo(rx + rw - 18, vy + 46);
  ctx.stroke();

  students.forEach((st, idx) => {
    const rowY = vy + 68 + idx * 78;
    const sustained = Math.max(0, localSec - st.startOffset);
    const verified = sustained >= threshold;
    const pct = Math.min(1, sustained / threshold);

    ctx.font = '700 14px "DM Sans", sans-serif';
    ctx.fillStyle = p.textPrimary;
    ctx.fillText(st.fullName, rx + 20, rowY + 10);

    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = p.textMuted;
    ctx.fillText(`${st.id} · Focused · 0.0s inactive`, rx + 20, rowY + 28);

    ctx.textAlign = 'right';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillStyle = verified ? p.emerald : p.sky;
    ctx.fillText(
      verified ? 'PRESENT' : `${sustained.toFixed(1)}s / 8.0s`,
      rx + rw - 20,
      rowY + 12
    );
    ctx.textAlign = 'left';

    // Progress Track
    const trackX = rx + 20;
    const trackW = rw - 40;
    roundRectPath(ctx, trackX, rowY + 38, trackW, 8, 4);
    ctx.fillStyle = p.gridLine;
    ctx.fill();

    if (pct > 0) {
      roundRectPath(ctx, trackX, rowY + 38, Math.max(8, trackW * pct), 8, 4);
      ctx.fillStyle = verified ? p.emerald : p.sky;
      ctx.fill();
    }
  });

  // Bottom Right: Offline CSV Auto-Commit Status Card
  const cy = vy + 334;
  const verifiedCount = students.filter((s) => localSec - s.startOffset >= threshold).length;
  drawCard(
    ctx,
    p,
    rx,
    cy,
    rw,
    134,
    14,
    verifiedCount > 0 ? (p === DARK_PALETTE ? '#092720' : '#ECFDF5') : p.surface,
    verifiedCount > 0 ? p.emerald : p.border
  );

  ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = verifiedCount > 0 ? p.emerald : p.textPrimary;
  ctx.fillText(
    verifiedCount > 0
      ? `Offline CSV Auto-Commit Active (${verifiedCount}/3 Verified)`
      : 'Monitoring Sustained Presence...',
    rx + 20,
    cy + 34
  );

  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = p.textSecondary;
  ctx.fillText('attendance_session_logs.csv', rx + 20, cy + 62);
  ctx.fillStyle = p.textMuted;
  ctx.fillText(
    verifiedCount > 0
      ? `Last commit: STU-10${verifiedCount} · PRESENT · SHA-256 signed`
      : 'Waiting for continuous 8.0s presence before logging',
    rx + 20,
    cy + 86
  );
  ctx.fillText('Zero raw video frames saved to disk', rx + 20, cy + 108);
}

// ---------------------------------------------------------------------------
// Chapter 2: Multimodal Engagement & Session Dynamics (00:15 - 00:30)
// ---------------------------------------------------------------------------
function drawChapter2Engagement(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  localSec: number
): void {
  // Left Column: 3 Multimodal Signal Gauges + Fusion Formula
  const lx = 42;
  const ly = 84;
  const lw = 470;
  const lh = 468;
  drawCard(ctx, p, lx, ly, lw, lh, 14);

  ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('Multimodal Signal Fusion Engine', lx + 22, ly + 34);
  ctx.font = '500 12px "DM Sans", sans-serif';
  ctx.fillStyle = p.textMuted;
  ctx.fillText('Normalized sidebar weights drive real-time class engagement', lx + 22, ly + 54);

  // Dynamic values over the 15s chapter
  const isDropPhase = localSec >= 5.2 && localSec <= 9.8;
  const isPeakPhase = localSec > 9.8;

  const poseScore = isDropPhase ? 52 : isPeakPhase ? 96 : 89;
  const motionScore = isDropPhase ? 60 : isPeakPhase ? 94 : 92;
  const audioScore = isDropPhase ? 35 : isPeakPhase ? 100 : 72;
  const fusedScore = poseScore * 0.5 + motionScore * 0.25 + audioScore * 0.25;

  const signals = [
    {
      label: 'Head Pose Analysis',
      weight: '50%',
      state: isDropPhase ? 'Looking Away' : 'Focused',
      score: poseScore,
      color: isDropPhase ? p.amber : p.emerald,
    },
    {
      label: 'Movement & Static Inactivity',
      weight: '25%',
      state: isDropPhase ? 'Static (8.4s)' : 'Attentive Micro-Motion',
      score: motionScore,
      color: isDropPhase ? p.amber : p.sky,
    },
    {
      label: 'Audio RMS + ZCR Classification',
      weight: '25%',
      state: isDropPhase
        ? 'High Noise / Disturbance'
        : isPeakPhase
        ? 'Active Speech / Q&A'
        : 'Silence / Passive',
      score: audioScore,
      color: isDropPhase ? p.rose : isPeakPhase ? p.emerald : p.sky,
    },
  ];

  signals.forEach((sig, i) => {
    const sy = ly + 82 + i * 94;
    drawCard(ctx, p, lx + 20, sy, lw - 40, 80, 10, p.surfaceAlt);

    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = p.textPrimary;
    ctx.fillText(`${sig.label} (${sig.weight})`, lx + 36, sy + 26);

    ctx.textAlign = 'right';
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillStyle = sig.color;
    ctx.fillText(`${sig.score} pts`, lx + lw - 36, sy + 26);
    ctx.textAlign = 'left';

    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = p.textMuted;
    ctx.fillText(sig.state, lx + 36, sy + 46);

    roundRectPath(ctx, lx + 36, sy + 56, lw - 72, 8, 4);
    ctx.fillStyle = p.gridLine;
    ctx.fill();
    roundRectPath(ctx, lx + 36, sy + 56, ((lw - 72) * sig.score) / 100, 8, 4);
    ctx.fillStyle = sig.color;
    ctx.fill();
  });

  // Live Audio Waveform Visualizer Strip at bottom of left card
  const wy = ly + 378;
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = p.textMuted;
  ctx.fillText(
    `RMS: ${isDropPhase ? '0.162' : isPeakPhase ? '0.048' : '0.008'}  ·  ZCR: ${
      isDropPhase ? '0.238' : isPeakPhase ? '0.086' : '0.024'
    }`,
    lx + 22,
    wy + 10
  );

  const barCount = 36;
  for (let b = 0; b < barCount; b++) {
    const ampBase = isDropPhase ? 0.92 : isPeakPhase ? 0.62 : 0.18;
    const wave =
      Math.abs(Math.sin(localSec * (isDropPhase ? 12 : 6) + b * 0.55)) * ampBase + 0.08;
    const bh = Math.round(wave * 44);
    const bx = lx + 22 + b * 11.8;
    ctx.fillStyle = isDropPhase ? p.rose : isPeakPhase ? p.emerald : p.sky;
    roundRectPath(ctx, bx, wy + 68 - bh, 7, bh, 3);
    ctx.fill();
  }

  // Right Column: Live Session Engagement Trend Chart + Live Fused Score Card
  const rx = 536;
  const rw = 702;

  // Top Metric Row (3 KPIs)
  const kpiW = (rw - 28) / 3;
  const kpis = [
    {
      label: 'Live Class Engagement',
      val: `${fusedScore.toFixed(1)}%`,
      color: fusedScore < 55 ? p.rose : fusedScore > 78 ? p.emerald : p.sky,
    },
    { label: 'Interaction Peak', val: '96.5%', color: p.emerald },
    {
      label: 'Audio State',
      val: isDropPhase ? 'High Noise' : isPeakPhase ? 'Active Q&A' : 'Passive',
      color: isDropPhase ? p.rose : isPeakPhase ? p.emerald : p.textPrimary,
    },
  ];
  kpis.forEach((k, idx) => {
    const kx = rx + idx * (kpiW + 14);
    drawCard(ctx, p, kx, ly, kpiW, 86, 12);
    ctx.font = '500 12px "DM Sans", sans-serif';
    ctx.fillStyle = p.textMuted;
    ctx.fillText(k.label, kx + 18, ly + 28);
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillStyle = k.color;
    ctx.fillText(k.val, kx + 18, ly + 64);
  });

  // Main Animated Engagement Trend Chart
  const cy = ly + 104;
  const ch = 364;
  drawCard(ctx, p, rx, cy, rw, ch, 14);
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('Session Engagement Trend (Live Multimodal Score)', rx + 22, cy + 32);

  const px = rx + 58;
  const py = cy + 56;
  const pw = rw - 88;
  const ph = ch - 96;

  // Grid & Y labels
  [0, 25, 50, 75, 100].forEach((tick) => {
    const ty = py + ((100 - tick) / 100) * ph;
    ctx.strokeStyle = p.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, ty);
    ctx.lineTo(px + pw, ty);
    ctx.stroke();

    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = p.textMuted;
    ctx.textAlign = 'right';
    ctx.fillText(`${tick}%`, px - 10, ty + 4);
    ctx.textAlign = 'left';
  });

  // 78% Peak & 55% Drop dashed rules
  const drawRule = (val: number, col: string, lbl: string) => {
    const ry = py + ((100 - val) / 100) * ph;
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(px, ry);
    ctx.lineTo(px + pw, ry);
    ctx.stroke();
    ctx.restore();
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = col;
    ctx.textAlign = 'right';
    ctx.fillText(lbl, px + pw, ry - 6);
    ctx.textAlign = 'left';
  };
  drawRule(78, p.emerald, 'Peak Window (78%)');
  drawRule(55, p.rose, 'Attention Drop (55%)');

  // Generate smooth series up to current localSec
  const totalPts = 42;
  const visiblePts = Math.max(2, Math.floor(clamp01(localSec / 14.5) * totalPts));
  const series: number[] = [];
  for (let i = 0; i < visiblePts; i++) {
    const u = i / (totalPts - 1);
    let val = 82 + Math.sin(u * 9) * 4;
    if (u > 0.32 && u < 0.65) {
      const dip = Math.sin(((u - 0.32) / 0.33) * Math.PI);
      val -= dip * 36; // Drops cleanly below 55%
    } else if (u >= 0.65) {
      const rise = easeOutCubic((u - 0.65) / 0.35);
      val = 66 + rise * 28 + Math.sin(u * 18) * 2;
    }
    series.push(Math.max(20, Math.min(98, val)));
  }

  // Area + Line
  ctx.beginPath();
  series.forEach((v, i) => {
    const x = px + (i / (totalPts - 1)) * pw;
    const y = py + ((100 - v) / 100) * ph;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = p.sky;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const lastX = px + ((series.length - 1) / (totalPts - 1)) * pw;
  ctx.lineTo(lastX, py + ph);
  ctx.lineTo(px, py + ph);
  ctx.closePath();
  const areaGrad = ctx.createLinearGradient(0, py, 0, py + ph);
  areaGrad.addColorStop(0, 'rgba(56, 189, 248, 0.28)');
  areaGrad.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Leading point highlight
  const leadVal = series[series.length - 1];
  const leadY = py + ((100 - leadVal) / 100) * ph;
  ctx.beginPath();
  ctx.arc(lastX, leadY, 6, 0, Math.PI * 2);
  ctx.fillStyle = leadVal < 55 ? p.rose : leadVal > 78 ? p.emerald : p.sky;
  ctx.fill();
  ctx.strokeStyle = p.surface;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Chapter 3: AI Teaching Suggestions & Event Analytics (00:30 - 00:45)
// ---------------------------------------------------------------------------
function drawChapter3Guidance(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  localSec: number
): void {
  const lx = 42;
  const ly = 84;
  const lw = 610;

  // Active suggestion cycles cleanly across 3 real classroom triggers
  const activeIdx = localSec < 5.0 ? 0 : localSec < 9.8 ? 1 : 2;

  const suggestions = [
    {
      trigger: 'Inactivity ≥ 8.0s',
      title: 'Passive / Static Learners Detected (9.2s Inactivity)',
      body: 'Learners have remained static beyond threshold. Launch a 1-question live poll or think-pair-share prompt.',
      accent: p.amber,
      bgDark: '#2A1E0A',
      bgLight: '#FFFBEB',
    },
    {
      trigger: 'Engagement < 55% · Looking Away',
      title: 'Attention Drop Alert — Visual Focus Declining (48.4%)',
      body: '2 of 3 learners are looking away. Introduce a visual diagram or worked example to re-anchor focus.',
      accent: p.rose,
      bgDark: '#2C1118',
      bgLight: '#FFF1F2',
    },
    {
      trigger: 'Engagement > 78% · Active Q&A',
      title: 'Peak Engagement Window (91.6%) — Optimal Cognitive Readiness',
      body: 'Class attention and Q&A participation are peaking. Ideal window to introduce complex derivations or challenge problems.',
      accent: p.emerald,
      bgDark: '#092720',
      bgLight: '#ECFDF5',
    },
  ];

  // Left Stack: 3 Pedagogical Decision Support Cards (Active one highlighted)
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('Context-Aware Pedagogical Decision Support', lx, ly + 18);

  suggestions.forEach((s, idx) => {
    const sy = ly + 36 + idx * 144;
    const isActive = idx === activeIdx;
    const fill = isActive
      ? p === DARK_PALETTE
        ? s.bgDark
        : s.bgLight
      : p.surface;
    drawCard(ctx, p, lx, sy, lw, 128, 12, fill, isActive ? s.accent : p.border);

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = isActive ? s.accent : p.textMuted;
    ctx.fillText(
      `${isActive ? 'ACTIVE TRIGGER  ·  ' : ''}${s.trigger}`,
      lx + 20,
      sy + 28
    );

    ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = p.textPrimary;
    ctx.fillText(s.title, lx + 20, sy + 56);

    ctx.font = '400 13px "DM Sans", sans-serif';
    ctx.fillStyle = p.textSecondary;
    drawWrappedText(ctx, s.body, lx + 20, sy + 82, lw - 40, 19);
  });

  // Right Column: Session Analytics KPIs + Automated Event Timeline
  const rx = 678;
  const rw = 560;

  const stats = [
    { label: 'Mean Engagement', val: '81.4%', color: p.sky },
    { label: 'Peak Score', val: '94.2%', color: p.emerald },
    { label: 'Attention Drops', val: '1', color: p.rose },
  ];
  const sw = (rw - 24) / 3;
  stats.forEach((st, idx) => {
    const sx = rx + idx * (sw + 12);
    drawCard(ctx, p, sx, ly + 36, sw, 82, 12);
    ctx.font = '500 11px "DM Sans", sans-serif';
    ctx.fillStyle = p.textMuted;
    ctx.fillText(st.label, sx + 14, ly + 62);
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillStyle = st.color;
    ctx.fillText(st.val, sx + 14, ly + 98);
  });

  // Automated Classroom Event Timeline
  const ty = ly + 134;
  drawCard(ctx, p, rx, ty, rw, 318, 14);
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('Automated Classroom Event Timeline', rx + 20, ty + 32);

  const timelineEvents = [
    { time: '09:14:02', type: 'Arrival', detail: 'Aarav Sharma (STU-101) entered frame', col: p.sky, appearAt: 0.2 },
    { time: '09:14:10', type: 'Attendance Commit', detail: 'STU-101 verified PRESENT (8.0s)', col: p.emerald, appearAt: 1.4 },
    { time: '09:14:13', type: 'Attendance Commit', detail: 'STU-102 verified PRESENT (8.1s)', col: p.emerald, appearAt: 2.6 },
    { time: '09:14:24', type: 'Inactivity Alert', detail: 'STU-103 static for >= 8s', col: p.amber, appearAt: 4.0 },
    { time: '09:14:31', type: 'Attention Drop', detail: 'Class engagement dropped to 48.4%', col: p.rose, appearAt: 6.2 },
    { time: '09:14:44', type: 'Attendance Commit', detail: 'Peak Q&A recovery · 91.6% score', col: p.emerald, appearAt: 9.8 },
  ];

  timelineEvents.forEach((ev, idx) => {
    const alpha = easeOutCubic((localSec - ev.appearAt) / 0.7);
    if (alpha <= 0) return;
    const ey = ty + 62 + idx * 41;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (idx > 0) {
      ctx.strokeStyle = p.gridLine;
      ctx.beginPath();
      ctx.moveTo(rx + 20, ey - 16);
      ctx.lineTo(rx + rw - 20, ey - 16);
      ctx.stroke();
    }
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = p.textMuted;
    ctx.fillText(ev.time, rx + 20, ey + 4);

    ctx.font = '700 11px "DM Sans", sans-serif';
    ctx.fillStyle = ev.col;
    ctx.fillText(ev.type, rx + 96, ey + 4);

    ctx.font = '400 12px "DM Sans", sans-serif';
    ctx.fillStyle = p.textSecondary;
    ctx.fillText(ev.detail, rx + 228, ey + 4);
    ctx.restore();
  });
}

// ---------------------------------------------------------------------------
// Chapter 4: Student Safe-Leave Simulator & SHA-256 Audit Ledger (00:45 - 01:00)
// ---------------------------------------------------------------------------
function drawChapter4Compliance(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  localSec: number
): void {
  const lx = 42;
  const ly = 84;
  const lw = 580;
  const lh = 468;

  // Left Panel: Student Safe-Leave Simulator
  drawCard(ctx, p, lx, ly, lw, lh, 14);
  ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('Student Safe-Leave & 75% Eligibility Simulator', lx + 22, ly + 34);
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = p.textMuted;
  ctx.fillText('STU-101 Aarav Sharma  ·  87 / 94 Classes Conducted', lx + 22, ly + 56);

  // Animate missed classes from 0 -> 14 and settle around 4
  const simMisses =
    localSec < 7.5
      ? Math.round((localSec / 7.5) * 14)
      : Math.max(4, Math.round(14 - ((localSec - 7.5) / 3.0) * 10));
  const totalConducted = 94;
  const attended = 87;
  const projectedPct = (attended / (totalConducted + simMisses)) * 100;
  const isSafe = projectedPct >= 75.0;

  // 3 compact stat tiles
  const statW = (lw - 64) / 3;
  const simStats = [
    { label: 'Current', val: '92.55%', col: p.textPrimary },
    {
      label: `Projected (-${simMisses})`,
      val: `${projectedPct.toFixed(1)}%`,
      col: isSafe ? p.emerald : p.rose,
    },
    { label: 'Safe Buffer', val: '22 cls', col: p.sky },
  ];
  simStats.forEach((s, idx) => {
    const sx = lx + 22 + idx * (statW + 10);
    drawCard(ctx, p, sx, ly + 74, statW, 72, 10, p.surfaceAlt);
    ctx.font = '500 11px "DM Sans", sans-serif';
    ctx.fillStyle = p.textMuted;
    ctx.fillText(s.label, sx + 14, ly + 98);
    ctx.font = '700 20px "JetBrains Mono", monospace';
    ctx.fillStyle = s.col;
    ctx.fillText(s.val, sx + 14, ly + 128);
  });

  // Compliance status bar
  drawCard(
    ctx,
    p,
    lx + 22,
    ly + 162,
    lw - 44,
    66,
    10,
    isSafe
      ? p === DARK_PALETTE
        ? '#092720'
        : '#ECFDF5'
      : p === DARK_PALETTE
      ? '#2C1118'
      : '#FFF1F2',
    isSafe ? p.emerald : p.rose
  );
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = isSafe ? p.emerald : p.rose;
  ctx.fillText(
    isSafe ? 'Safe Zone — Above 75.0% Exam Eligibility Rule' : 'Compliance Warning — Below 75.0% Threshold',
    lx + 38,
    ly + 188
  );
  ctx.font = '500 12px "DM Sans", sans-serif';
  ctx.fillStyle = p.textSecondary;
  ctx.fillText(
    `Simulating ${simMisses} upcoming missed class(es) · Projected: ${projectedPct.toFixed(2)}%`,
    lx + 38,
    ly + 211
  );

  // Trajectory Curve inside Simulator
  const gx = lx + 56;
  const gy = ly + 258;
  const gw = lw - 88;
  const gh = 172;

  // 75% dashed line
  const minY = 65;
  const maxY = 100;
  const yOf = (pct: number) => gy + ((maxY - pct) / (maxY - minY)) * gh;
  const xOf = (m: number) => gx + (m / 15) * gw;

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = p.rose;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(gx, yOf(75));
  ctx.lineTo(gx + gw, yOf(75));
  ctx.stroke();
  ctx.restore();
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = p.rose;
  ctx.fillText('75% Rule', gx + gw - 58, yOf(75) - 6);

  ctx.beginPath();
  for (let m = 0; m <= 15; m++) {
    const pct = (attended / (totalConducted + m)) * 100;
    if (m === 0) ctx.moveTo(xOf(m), yOf(pct));
    else ctx.lineTo(xOf(m), yOf(pct));
  }
  ctx.strokeStyle = p.sky;
  ctx.lineWidth = 2.8;
  ctx.stroke();

  // Active simulated point
  ctx.beginPath();
  ctx.arc(xOf(simMisses), yOf(projectedPct), 7, 0, Math.PI * 2);
  ctx.fillStyle = isSafe ? p.emerald : p.rose;
  ctx.fill();
  ctx.strokeStyle = p.surface;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = p.textMuted;
  ctx.fillText('0 misses', gx, gy + gh + 22);
  ctx.textAlign = 'right';
  ctx.fillText('15 misses', gx + gw, gy + gh + 22);
  ctx.textAlign = 'left';

  // Right Panel: Immutable SHA-256 Cryptographic Audit Ledger
  const rx = 646;
  const rw = 592;
  drawCard(ctx, p, rx, ly, rw, lh, 14);
  ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = p.textPrimary;
  ctx.fillText('Immutable SHA-256 Cryptographic Audit Ledger', rx + 22, ly + 34);
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = p.textMuted;
  ctx.fillText('attendance_audit_ledger.csv  ·  Hash-Chained Commits', rx + 22, ly + 56);

  const commits = [
    {
      idx: '#01',
      student: 'STU-101 · Aarav Sharma',
      prev: '000000000000…',
      hash: '8f4c2e9a71b0d5f3…',
      appearAt: 1.5,
    },
    {
      idx: '#02',
      student: 'STU-102 · Diya Patel',
      prev: '8f4c2e9a71b0…',
      hash: '3d91b7c40e28a116…',
      appearAt: 4.0,
    },
    {
      idx: '#03',
      student: 'STU-103 · Rohan Verma',
      prev: '3d91b7c40e28…',
      hash: 'c7a065f912be84d0…',
      appearAt: 6.5,
    },
  ];

  commits.forEach((c, i) => {
    const cy = ly + 82 + i * 96;
    const alpha = easeOutCubic((localSec - c.appearAt) / 0.65);
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, alpha);
    drawCard(
      ctx,
      p,
      rx + 22,
      cy,
      rw - 44,
      80,
      10,
      p.surfaceAlt,
      alpha > 0.8 ? p.emerald : p.border
    );

    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillStyle = p.sky;
    ctx.fillText(c.idx, rx + 36, cy + 28);

    ctx.font = '700 14px "DM Sans", sans-serif';
    ctx.fillStyle = p.textPrimary;
    ctx.fillText(c.student, rx + 76, cy + 28);

    ctx.textAlign = 'right';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillStyle = p.emerald;
    ctx.fillText('PRESENT · VERIFIED', rx + rw - 36, cy + 28);
    ctx.textAlign = 'left';

    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = p.textMuted;
    ctx.fillText(`Prev: ${c.prev}   →   SHA-256: ${c.hash}`, rx + 36, cy + 56);
    ctx.restore();
  });

  // Integrity verification confirmation banner
  const verifyAlpha = easeOutCubic((localSec - 8.5) / 0.8);
  const vy = ly + 378;
  drawCard(
    ctx,
    p,
    rx + 22,
    vy,
    rw - 44,
    70,
    10,
    verifyAlpha > 0.4 ? (p === DARK_PALETTE ? '#092720' : '#ECFDF5') : p.surfaceAlt,
    verifyAlpha > 0.4 ? p.emerald : p.border
  );
  ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = verifyAlpha > 0.4 ? p.emerald : p.textSecondary;
  ctx.fillText(
    verifyAlpha > 0.4
      ? 'SHA-256 Chain Verified · 3 Immutable Commits · 0 Tampering'
      : 'Ready for Offline Cryptographic Integrity Verification',
    rx + 38,
    vy + 31
  );
  ctx.font = '500 12px "DM Sans", sans-serif';
  ctx.fillStyle = p.textMuted;
  ctx.fillText(
    '100% Offline Web Crypto Digest · Exportable attendance_session_logs.csv & ledger',
    rx + 38,
    vy + 53
  );
}

// ---------------------------------------------------------------------------
// Spotlight Callouts & Measured Contrast Lower-Third Caption Scrim
// ---------------------------------------------------------------------------
function drawSpotlightCallout(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  callout: DemoCallout,
  localSec: number
): void {
  if (localSec < callout.startSec || localSec > callout.endSec) return;

  const fadeIn = easeOutCubic((localSec - callout.startSec) / 0.35);
  const fadeOut = easeOutCubic((callout.endSec - localSec) / 0.35);
  const alpha = Math.min(fadeIn, fadeOut);
  if (alpha <= 0.01) return;

  const accentMap = {
    sky: p.sky,
    emerald: p.emerald,
    amber: p.amber,
    rose: p.rose,
  };
  const accent = accentMap[callout.accent];

  const tx = callout.targetX * DEMO_VIDEO_WIDTH;
  const ty = callout.targetY * DEMO_VIDEO_HEIGHT;
  const bx = callout.boxX * DEMO_VIDEO_WIDTH;
  const by = callout.boxY * DEMO_VIDEO_HEIGHT;
  const bw = 248;
  const bh = 54;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Subtle focus target ring
  const pulse = 1 + Math.sin(localSec * 5) * 0.12;
  ctx.beginPath();
  ctx.arc(tx, ty, 13 * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(tx, ty, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  // Connector leader line
  const anchorX = bx + bw / 2;
  const anchorY = by + bh;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  // Callout label box (dark elevated slate for high legibility)
  roundRectPath(ctx, bx, by, bw, bh, 10);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(callout.label, bx + 12, by + 22);

  ctx.font = '500 11px "DM Sans", sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(callout.detail, bx + 12, by + 40);

  ctx.restore();
}

function drawCaptionScrim(
  ctx: CanvasRenderingContext2D,
  chapter: DemoChapter,
  localSec: number
): void {
  const cue =
    chapter.captions.find(
      (c) => localSec >= c.startSec && localSec <= c.endSec
    ) ?? chapter.captions[chapter.captions.length - 1];
  if (!cue) return;

  // Measured lower-third contrast scrim (>= 4.5:1 contrast)
  const scrimH = 148;
  const scrimY = DEMO_VIDEO_HEIGHT - scrimH;
  const grad = ctx.createLinearGradient(0, scrimY, 0, DEMO_VIDEO_HEIGHT);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.0)');
  grad.addColorStop(0.28, 'rgba(2, 6, 23, 0.78)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0.96)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, scrimY, DEMO_VIDEO_WIDTH, scrimH);

  // Clean hairline rule above caption bar
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(42, DEMO_VIDEO_HEIGHT - 102);
  ctx.lineTo(DEMO_VIDEO_WIDTH - 42, DEMO_VIDEO_HEIGHT - 102);
  ctx.stroke();

  // Headline + Caption Copy
  ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(
    `${chapter.code} · ${cue.headline}`,
    42,
    DEMO_VIDEO_HEIGHT - 74
  );

  ctx.font = '500 18px "DM Sans", system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  drawWrappedText(
    ctx,
    cue.text,
    42,
    DEMO_VIDEO_HEIGHT - 44,
    DEMO_VIDEO_WIDTH - 240,
    24
  );

  // Chapter pill-free step readout on bottom right
  ctx.textAlign = 'right';
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    `CHAPTER ${chapter.index + 1} / 4`,
    DEMO_VIDEO_WIDTH - 42,
    DEMO_VIDEO_HEIGHT - 74
  );
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(
    `${formatTimecode(chapter.startSec + localSec)} / 01:00.0`,
    DEMO_VIDEO_WIDTH - 42,
    DEMO_VIDEO_HEIGHT - 48
  );
  ctx.textAlign = 'left';
}

export interface RenderDemoFrameOptions {
  ctx: CanvasRenderingContext2D;
  chapters: DemoChapter[];
  globalSec: number;
  darkTheme: boolean;
  showCaptions: boolean;
  showCallouts: boolean;
}

export function renderDemoFrame(opts: RenderDemoFrameOptions): void {
  const { ctx, chapters, globalSec, darkTheme, showCaptions, showCallouts } = opts;
  const p = darkTheme ? DARK_PALETTE : LIGHT_PALETTE;
  const { chapter, localSec } = getActiveChapter(chapters, globalSec);

  // 1. Canvas Background
  ctx.fillStyle = p.canvasBg;
  ctx.fillRect(0, 0, DEMO_VIDEO_WIDTH, DEMO_VIDEO_HEIGHT);

  // 2. Top Chrome Bar
  drawChromeBar(ctx, p, chapter, globalSec);

  // 3. Subtle chapter cross-fade envelope
  const fadeAlpha = Math.min(
    easeOutCubic(localSec / 0.35),
    easeOutCubic((chapter.durationSec - localSec) / 0.25)
  );
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, fadeAlpha);

  if (chapter.id === 'attendance') {
    drawChapter1Attendance(ctx, p, localSec);
  } else if (chapter.id === 'engagement') {
    drawChapter2Engagement(ctx, p, localSec);
  } else if (chapter.id === 'guidance') {
    drawChapter3Guidance(ctx, p, localSec);
  } else {
    drawChapter4Compliance(ctx, p, localSec);
  }
  ctx.restore();

  // 4. Timed Spotlight Callouts
  if (showCallouts) {
    for (const callout of chapter.callouts) {
      drawSpotlightCallout(ctx, p, callout, localSec);
    }
  }

  // 5. Lower-Third Captions with Measured Contrast Scrim
  if (showCaptions) {
    drawCaptionScrim(ctx, chapter, localSec);
  }
}
