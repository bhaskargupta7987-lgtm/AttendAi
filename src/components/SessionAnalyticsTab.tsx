import React, { useMemo, useState } from 'react';
import {
  ClassroomEvent,
  EngagementSample,
  TrackedParticipant,
} from '../types/attendai';

interface Props {
  participants: TrackedParticipant[];
  history: EngagementSample[];
  events: ClassroomEvent[];
  peakEngagement: number;
  attentionDropCount: number;
  sessionStartTs: number;
}

export const SessionAnalyticsTab: React.FC<Props> = ({
  participants,
  history,
  events,
  peakEngagement,
  attentionDropCount,
  sessionStartTs,
}) => {
  const [eventFilter, setEventFilter] = useState<string>('All');

  const meanEngagement = useMemo(() => {
    if (history.length === 0) return 0;
    const sum = history.reduce((acc, h) => acc + h.engagement, 0);
    return sum / history.length;
  }, [history]);

  const durationFormatted = useMemo(() => {
    const totalSec = Math.max(0, Math.floor((Date.now() - sessionStartTs) / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [sessionStartTs, history.length]);

  const bands = useMemo(() => {
    let drop = 0;
    let steady = 0;
    let peak = 0;
    for (const sample of history) {
      if (sample.engagement < 55) drop++;
      else if (sample.engagement > 78) peak++;
      else steady++;
    }
    const maxVal = Math.max(1, drop, steady, peak);
    return [
      { label: 'Drop (<55%)', count: drop, pct: (drop / maxVal) * 100, color: 'bg-rose-500' },
      { label: 'Steady (55–78%)', count: steady, pct: (steady / maxVal) * 100, color: 'bg-sky-500' },
      { label: 'Peak (>78%)', count: peak, pct: (peak / maxVal) * 100, color: 'bg-emerald-500' },
    ];
  }, [history]);

  const filteredEvents = useMemo(() => {
    const rev = [...events].reverse();
    if (eventFilter === 'All') return rev;
    return rev.filter((e) => e.type === eventFilter);
  }, [events, eventFilter]);

  return (
    <div className="space-y-6">
      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Mean Session Engagement
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {meanEngagement.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Interaction Peak
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {peakEngagement.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Attention Drop Count (&lt;55%)
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
            {attentionDropCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Session Duration
          </div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {durationFormatted}
          </div>
        </div>
      </div>

      {/* Per-Participant Summary Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Per-Participant Session Summary
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {participants.length} participant(s) tracked
          </span>
        </div>
        {participants.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No participant telemetry recorded yet. Start the Camera Agent in Tab 1 to populate session analytics.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-4">Student ID</th>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Sustained (s)</th>
                  <th className="py-2.5 px-4 text-right">Avg Eng.</th>
                  <th className="py-2.5 px-4 text-right">Peak Eng.</th>
                  <th className="py-2.5 px-4 text-right">Inactivity (s)</th>
                  <th className="py-2.5 px-4">Latest Pose</th>
                  <th className="py-2.5 px-4">Verified At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {participants.map((p, idx) => {
                  const avgEng =
                    p.engagementSamples.length > 0
                      ? p.engagementSamples.reduce((a, b) => a + b, 0) /
                        p.engagementSamples.length
                      : p.engagementScore;
                  return (
                    <tr
                      key={`${p.studentId}-${p.trackId}-${idx}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {p.studentId}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {p.name}
                      </td>
                      <td className="py-2.5 px-4 text-xs font-semibold">
                        {p.markedPresent ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            PRESENT
                          </span>
                        ) : (
                          <span className="text-sky-600 dark:text-sky-400">
                            Tracking
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {p.sustainedSec.toFixed(1)}s
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {avgEng.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {p.peakEngagement.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {p.inactivityTotalSec.toFixed(1)}s
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 dark:text-slate-300">
                        {p.headPose}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {p.presentTimestamp || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom 2-Column Split: Automated Timeline + Band Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Automated Classroom Event Timeline
            </h3>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
              {['All', 'Arrival', 'Attendance Commit', 'Inactivity Alert', 'Attention Drop'].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEventFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                      eventFilter === cat
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>
          </div>
          <div className="p-4 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredEvents.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Classroom events (arrivals, attendance commits, inactivity alerts, attention drops) will appear here.
              </div>
            ) : (
              filteredEvents.map((ev) => (
                <div key={ev.id} className="py-2.5 flex items-baseline gap-3 text-sm">
                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {ev.time}
                  </span>
                  <span
                    className={`text-xs font-semibold shrink-0 w-32 ${
                      ev.type === 'Attendance Commit'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : ev.type === 'Attention Drop'
                        ? 'text-rose-600 dark:text-rose-400'
                        : ev.type === 'Inactivity Alert'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-sky-600 dark:text-sky-400'
                    }`}
                  >
                    {ev.type}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{ev.detail}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Session Engagement Band Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Distribution of 1-second multimodal engagement samples
            </p>
          </div>
          <div className="my-6 space-y-4">
            {bands.map((b) => (
              <div key={b.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {b.label}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {b.count} sample(s)
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-md ${b.color} transition-all duration-300`}
                    style={{ width: `${Math.max(b.count > 0 ? 4 : 0, b.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
            Total logged samples: <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">{history.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
