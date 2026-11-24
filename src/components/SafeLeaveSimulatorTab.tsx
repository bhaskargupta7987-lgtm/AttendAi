import React, { useMemo, useState } from 'react';
import { RosterEntry } from '../types/attendai';

interface Props {
  roster: RosterEntry[];
}

export const SafeLeaveSimulatorTab: React.FC<Props> = ({ roster }) => {
  const [selectedId, setSelectedId] = useState<string>(
    roster[0]?.studentId ?? 'STU-101'
  );
  const [totalConducted, setTotalConducted] = useState<number>(94);
  const [attendedClasses, setAttendedClasses] = useState<number>(87);
  const [plannedMisses, setPlannedMisses] = useState<number>(3);

  const selectedProfile = useMemo(() => {
    const found = roster.find((r) => r.studentId === selectedId) ?? roster[0];
    return found ? `${found.studentId} — ${found.name}` : 'STU-101 — Student';
  }, [roster, selectedId]);

  const clampedAttended = Math.min(attendedClasses, totalConducted);
  const currentPct = (clampedAttended / Math.max(1, totalConducted)) * 100;
  const projectedTotal = totalConducted + plannedMisses;
  const projectedPct = (clampedAttended / Math.max(1, projectedTotal)) * 100;

  // Max misses while staying >= 75%: attended / (total + x) >= 0.75
  const maxSafeTotal = Math.floor(clampedAttended / 0.75);
  const safeLeaveBuffer = Math.max(0, maxSafeTotal - totalConducted);
  const remainingAfterPlan = Math.max(0, safeLeaveBuffer - plannedMisses);

  const recoveryNeeded =
    projectedPct < 75
      ? Math.ceil((0.75 * projectedTotal - clampedAttended) / 0.25)
      : 0;

  const trajectory = useMemo(() => {
    const pts: Array<{ misses: number; pct: number }> = [];
    for (let m = 0; m <= 15; m++) {
      pts.push({
        misses: m,
        pct: (clampedAttended / Math.max(1, totalConducted + m)) * 100,
      });
    }
    return pts;
  }, [clampedAttended, totalConducted]);

  const minChartY = Math.max(
    40,
    Math.floor(Math.min(...trajectory.map((t) => t.pct), 70) - 5)
  );
  const maxChartY = 100;

  const svgW = 540;
  const svgH = 210;
  const padL = 40;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const xPx = (m: number) => padL + (m / 15) * plotW;
  const yPx = (pct: number) =>
    padT + ((maxChartY - Math.max(minChartY, Math.min(maxChartY, pct))) / (maxChartY - minChartY)) * plotH;

  const curvePath = trajectory
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xPx(pt.misses).toFixed(1)} ${yPx(pt.pct).toFixed(1)}`)
    .join(' ');
  const rule75Y = yPx(75);
  const isSafe = projectedPct >= 75;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Configuration Form */}
      <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Student Safe-Leave Calculator
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Self-service projection against the mandatory 75.0% exam eligibility rule.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="sim-student-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Student Profile
            </label>
            <select
              id="sim-student-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {roster.map((r, idx) => (
                <option key={`${r.studentId}-${idx}`} value={r.studentId}>
                  {r.studentId} — {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="sim-conducted"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Total Conducted
              </label>
              <input
                id="sim-conducted"
                type="number"
                min={1}
                max={500}
                value={totalConducted}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value) || 1);
                  setTotalConducted(val);
                  if (attendedClasses > val) setAttendedClasses(val);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label
                htmlFor="sim-attended"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Classes Attended
              </label>
              <input
                id="sim-attended"
                type="number"
                min={0}
                max={totalConducted}
                value={clampedAttended}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(totalConducted, Number(e.target.value) || 0));
                  setAttendedClasses(val);
                }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              <label htmlFor="sim-misses">Simulate Missing Upcoming Classes</label>
              <span className="font-mono tabular-nums text-sky-600 dark:text-sky-400">
                {plannedMisses} class(es)
              </span>
            </div>
            <input
              id="sim-misses"
              type="range"
              min={0}
              max={15}
              step={1}
              value={plannedMisses}
              onChange={(e) => setPlannedMisses(Number(e.target.value))}
              className="w-full accent-sky-600 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-400 mt-1">
              <span>0</span>
              <span>5</span>
              <span>10</span>
              <span>15</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Output & Trajectory */}
      <div className="lg:col-span-7 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Current Attendance
            </div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {currentPct.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Projected Attendance
            </div>
            <div
              className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                isSafe
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {projectedPct.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Safe Leave Buffer
            </div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {safeLeaveBuffer} class(es)
            </div>
          </div>
        </div>

        {/* Compliance Banner (hairline border, semantic surface tint) */}
        <div
          className={`rounded-xl border p-4 ${
            isSafe
              ? 'border-emerald-300/70 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/35 text-emerald-950 dark:text-emerald-100'
              : 'border-rose-300/70 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/35 text-rose-950 dark:text-rose-100'
          }`}
        >
          <div className="text-sm font-bold">
            {isSafe
              ? `Safe Zone — Exam Eligible (${selectedProfile})`
              : `Compliance Warning — Below 75% Rule (${selectedProfile})`}
          </div>
          <p className="mt-1 text-sm opacity-90">
            {isSafe ? (
              <>
                After missing <span className="font-mono font-semibold">{plannedMisses}</span> upcoming class(es),
                projected attendance is <span className="font-mono font-semibold">{projectedPct.toFixed(2)}%</span>.
                Remaining safe buffer: <span className="font-mono font-semibold">{remainingAfterPlan}</span> class(es).
              </>
            ) : (
              <>
                Missing <span className="font-mono font-semibold">{plannedMisses}</span> upcoming class(es) drops
                attendance to <span className="font-mono font-semibold">{projectedPct.toFixed(2)}%</span>. You must
                attend <span className="font-mono font-semibold">{recoveryNeeded}</span> consecutive classes afterward
                to restore 75.0% exam eligibility.
              </>
            )}
          </p>
        </div>

        {/* Trajectory Chart */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Attendance Trajectory vs. 75% Mandatory Threshold
            </h4>
            <span className="text-xs font-mono text-rose-600 dark:text-rose-400">
              --- 75.0% Minimum
            </span>
          </div>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto">
            {[minChartY, 75, 85, 100]
              .filter((v, idx, arr) => v >= minChartY && v <= 100 && arr.indexOf(v) === idx)
              .map((tick) => {
                const y = yPx(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={svgW - padR}
                      y2={y}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

            <line
              x1={padL}
              y1={rule75Y}
              x2={svgW - padR}
              y2={rule75Y}
              stroke="#F43F5E"
              strokeDasharray="6 4"
              strokeWidth="1.8"
            />

            <path
              d={curvePath}
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            {trajectory.map((pt) => (
              <circle
                key={pt.misses}
                cx={xPx(pt.misses)}
                cy={yPx(pt.pct)}
                r={pt.misses === plannedMisses ? 5.5 : 2.5}
                fill={
                  pt.misses === plannedMisses
                    ? isSafe
                      ? '#10B981'
                      : '#F43F5E'
                    : '#0EA5E9'
                }
              />
            ))}

            {[0, 3, 6, 9, 12, 15].map((m) => (
              <text
                key={m}
                x={xPx(m)}
                y={svgH - 8}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono tabular-nums"
              >
                {m}
              </text>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};
