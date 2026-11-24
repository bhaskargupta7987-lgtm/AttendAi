import React, { useState } from 'react';
import { EngagementSample } from '../types/attendai';

interface Props {
  data: EngagementSample[];
}

export const EngagementTrendChart: React.FC<Props> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 560;
  const height = 220;
  const padL = 38;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const points = data.slice(-90);
  const yToPx = (val: number) => padT + ((100 - Math.max(0, Math.min(100, val))) / 100) * plotH;
  const xToPx = (idx: number, total: number) =>
    total <= 1 ? padL + plotW / 2 : padL + (idx / (total - 1)) * plotW;

  const linePath =
    points.length > 0
      ? points
          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(i, points.length).toFixed(1)} ${yToPx(pt.engagement).toFixed(1)}`)
          .join(' ')
      : '';

  const areaPath =
    points.length > 1
      ? `${linePath} L ${xToPx(points.length - 1, points.length).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xToPx(0, points.length).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  const dropY = yToPx(55);
  const peakY = yToPx(78);
  const hovered = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Session Engagement Trend
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live multimodal score · Thresholds at 55% drop &amp; 78% peak
          </p>
        </div>
        {hovered ? (
          <div className="text-xs font-mono tabular-nums text-sky-600 dark:text-sky-400">
            {hovered.time} · {hovered.engagement.toFixed(1)}%
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t-2 border-dashed border-emerald-500" />
              78% Peak
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 border-t-2 border-dashed border-rose-500" />
              55% Drop
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          role="img"
          aria-label="Session engagement trend chart"
        >
          <defs>
            <linearGradient id="attendaiEngArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map((tick) => {
            const y = yToPx(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
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
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Peak 78% rule */}
          <line
            x1={padL}
            y1={peakY}
            x2={width - padR}
            y2={peakY}
            stroke="#10B981"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />
          {/* Attention Drop 55% rule */}
          <line
            x1={padL}
            y1={dropY}
            x2={width - padR}
            y2={dropY}
            stroke="#F43F5E"
            strokeDasharray="5 4"
            strokeWidth="1.5"
          />

          {areaPath && <path d={areaPath} fill="url(#attendaiEngArea)" />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="#0EA5E9"
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {points.map((pt, i) => {
            const cx = xToPx(i, points.length);
            const cy = yToPx(pt.engagement);
            const isHovered = hoverIdx === i;
            return (
              <g key={`${pt.step}-${i}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 5 : 2.2}
                  fill={
                    pt.engagement < 55
                      ? '#F43F5E'
                      : pt.engagement > 78
                      ? '#10B981'
                      : '#0EA5E9'
                  }
                  className="transition-transform duration-150"
                />
                <rect
                  x={cx - Math.max(4, plotW / Math.max(2, points.length * 2))}
                  y={padT}
                  width={Math.max(8, plotW / Math.max(1, points.length))}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              </g>
            );
          })}

          {points.length === 0 && (
            <text
              x={padL + plotW / 2}
              y={padT + plotH / 2}
              textAnchor="middle"
              className="fill-slate-400 dark:fill-slate-500 text-xs"
            >
              Start Camera Agent to stream live engagement samples
            </text>
          )}
        </svg>
      </div>
    </div>
  );
};
