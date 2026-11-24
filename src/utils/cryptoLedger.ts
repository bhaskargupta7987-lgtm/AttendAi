import { AttendanceRecord, AuditLedgerEntry } from '../types/attendai';

export const GENESIS_HASH = '0'.repeat(64);
const ATTENDANCE_STORAGE_KEY = 'attendai_session_logs_v1';
const AUDIT_STORAGE_KEY = 'attendai_audit_ledger_v1';

/**
 * Pure Web Crypto SHA-256 digest returning 64-char lowercase hex string.
 */
export async function sha256Hex(message: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic 64-char hex FNV/mixing digest if SubtleCrypto unavailable
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < message.length; i++) {
    const ch = message.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b);
  }
  const part = ((h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')).repeat(4);
  return part.slice(0, 64);
}

export function buildCanonicalPayload(params: {
  studentId: string;
  name: string;
  timestamp: string;
  sustainedSec: number;
  avgEngagement: number;
  prevHash: string;
}): string {
  return [
    params.studentId,
    params.name,
    params.timestamp,
    params.sustainedSec.toFixed(2),
    params.avgEngagement.toFixed(2),
    params.prevHash,
    'AttendAI-Offline-V1',
  ].join('|');
}

export function loadAttendanceLogs(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadAuditLedger(): AuditLedgerEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAttendanceLogs(logs: AttendanceRecord[]): void {
  try {
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // Ignore storage quota issues
  }
}

export function saveAuditLedger(ledger: AuditLedgerEntry[]): void {
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // Ignore storage quota issues
  }
}

export async function appendVerifiedAttendance(params: {
  studentId: string;
  name: string;
  timestamp: string;
  sustainedSec: number;
  avgEngagement: number;
  currentLogs: AttendanceRecord[];
  currentLedger: AuditLedgerEntry[];
}): Promise<{
  record: AttendanceRecord;
  ledgerEntry: AuditLedgerEntry;
  nextLogs: AttendanceRecord[];
  nextLedger: AuditLedgerEntry[];
}> {
  const prevHash =
    params.currentLedger.length > 0
      ? params.currentLedger[params.currentLedger.length - 1].SHA256_Token
      : GENESIS_HASH;
  const nextIndex = params.currentLedger.length + 1;

  const payload = buildCanonicalPayload({
    studentId: params.studentId,
    name: params.name,
    timestamp: params.timestamp,
    sustainedSec: params.sustainedSec,
    avgEngagement: params.avgEngagement,
    prevHash,
  });
  const token = await sha256Hex(payload);

  const record: AttendanceRecord = {
    Student_ID: params.studentId,
    Name: params.name,
    Timestamp: params.timestamp,
    Sustained_Sec: Number(params.sustainedSec.toFixed(2)),
    Avg_Engagement_Pct: Number(params.avgEngagement.toFixed(1)),
    Status: 'PRESENT',
    SHA256_Token: token,
  };

  const ledgerEntry: AuditLedgerEntry = {
    Ledger_Index: nextIndex,
    Timestamp: params.timestamp,
    Student_ID: params.studentId,
    Name: params.name,
    Sustained_Sec: Number(params.sustainedSec.toFixed(2)),
    Avg_Engagement_Pct: Number(params.avgEngagement.toFixed(1)),
    Prev_Hash: prevHash,
    SHA256_Token: token,
  };

  const nextLogs = [...params.currentLogs, record];
  const nextLedger = [...params.currentLedger, ledgerEntry];
  saveAttendanceLogs(nextLogs);
  saveAuditLedger(nextLedger);

  return { record, ledgerEntry, nextLogs, nextLedger };
}

export async function verifyAuditLedgerChain(
  ledger: AuditLedgerEntry[]
): Promise<{ valid: boolean; message: string }> {
  if (ledger.length === 0) {
    return {
      valid: true,
      message: 'Ledger has 0 commits. Ready for tamper-proof attendance verification.',
    };
  }

  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < ledger.length; i++) {
    const row = ledger[i];
    if (row.Prev_Hash !== expectedPrev) {
      return {
        valid: false,
        message: `Chain break detected at Ledger Index ${row.Ledger_Index} (row ${i + 1}).`,
      };
    }
    const recomputed = await sha256Hex(
      buildCanonicalPayload({
        studentId: row.Student_ID,
        name: row.Name,
        timestamp: row.Timestamp,
        sustainedSec: row.Sustained_Sec,
        avgEngagement: row.Avg_Engagement_Pct,
        prevHash: row.Prev_Hash,
      })
    );
    if (recomputed !== row.SHA256_Token) {
      return {
        valid: false,
        message: `SHA-256 payload mismatch at Ledger Index ${row.Ledger_Index} (row ${i + 1}).`,
      };
    }
    expectedPrev = recomputed;
  }

  return {
    valid: true,
    message: `Verified ${ledger.length} immutable commit(s) with 0 tampering detected.`,
  };
}

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportRecordsToCsv<T extends object>(
  rows: T[],
  headers: (keyof T)[],
  filename: string
): void {
  const lines = [headers.map((h) => String(h)).join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => escapeCsvCell((row[h] as string | number) ?? ''))
        .join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
