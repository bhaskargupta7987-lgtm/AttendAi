import React, { useState } from 'react';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { AttendanceRecord, AuditLedgerEntry } from '../types/attendai';
import {
  exportRecordsToCsv,
  verifyAuditLedgerChain,
} from '../utils/cryptoLedger';

interface Props {
  attendanceLogs: AttendanceRecord[];
  auditLedger: AuditLedgerEntry[];
  onClearAttendanceLogs: () => void;
}

export const AuditLogsTab: React.FC<Props> = ({
  attendanceLogs,
  auditLedger,
  onClearAttendanceLogs,
}) => {
  const [verifyStatus, setVerifyStatus] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  const handleVerifyChain = async () => {
    const res = await verifyAuditLedgerChain(auditLedger);
    setVerifyStatus(res);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Left Panel: Offline Attendance Session Logs */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Offline Attendance Session Logs
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              attendance_session_logs.csv · {attendanceLogs.length} record(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRecordsToCsv(
                  attendanceLogs,
                  [
                    'Student_ID',
                    'Name',
                    'Timestamp',
                    'Sustained_Sec',
                    'Avg_Engagement_Pct',
                    'Status',
                    'SHA256_Token',
                  ],
                  'attendance_session_logs.csv'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setVerifyStatus(null);
                onClearAttendanceLogs();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/30 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 whitespace-nowrap shrink-0 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Logs
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          {attendanceLogs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No verified attendance records committed yet. Verified students appear here automatically once their sustained presence threshold is met.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-3">Student ID</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Sustained</th>
                  <th className="py-2.5 px-3 text-right">Avg Eng</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">SHA-256 Token</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {attendanceLogs.map((row, idx) => (
                  <tr
                    key={`${row.Student_ID}-${row.Timestamp}-${idx}`}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200">
                      {row.Student_ID}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.Name}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {row.Timestamp}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.Sustained_Sec.toFixed(1)}s
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {row.Avg_Engagement_Pct.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 font-semibold text-emerald-600 dark:text-emerald-400">
                      {row.Status}
                    </td>
                    <td
                      className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400"
                      title={row.SHA256_Token}
                    >
                      {row.SHA256_Token.slice(0, 14)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right Panel: Immutable SHA-256 Audit Ledger */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Immutable SHA-256 Cryptographic Audit Ledger
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              attendance_audit_ledger.csv · {auditLedger.length} hash-chained commit(s)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRecordsToCsv(
                  auditLedger,
                  [
                    'Ledger_Index',
                    'Timestamp',
                    'Student_ID',
                    'Name',
                    'Sustained_Sec',
                    'Avg_Engagement_Pct',
                    'Prev_Hash',
                    'SHA256_Token',
                  ],
                  'attendance_audit_ledger.csv'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export Ledger CSV
            </button>
            <button
              type="button"
              onClick={handleVerifyChain}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Verify SHA-256 Chain
            </button>
          </div>
        </div>

        {verifyStatus && (
          <div
            className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
              verifyStatus.valid
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                : 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200'
            }`}
          >
            {verifyStatus.message}
          </div>
        )}

        <div className="overflow-x-auto max-h-96">
          {auditLedger.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Immutable hash-chained commits will be appended here when attendance is verified.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 font-semibold text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Student</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Prev Hash</th>
                  <th className="py-2.5 px-3">SHA-256 Token</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {auditLedger.map((entry) => (
                  <tr
                    key={entry.Ledger_Index}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {entry.Ledger_Index}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {entry.Student_ID} · {entry.Name}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {entry.Timestamp}
                    </td>
                    <td
                      className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400"
                      title={entry.Prev_Hash}
                    >
                      {entry.Prev_Hash.slice(0, 12)}…
                    </td>
                    <td
                      className="py-2 px-3 font-mono text-sky-700 dark:text-sky-400"
                      title={entry.SHA256_Token}
                    >
                      {entry.SHA256_Token.slice(0, 14)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
