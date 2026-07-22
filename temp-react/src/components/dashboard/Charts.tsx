import { useId } from 'react';

function getColor(colorMap: Record<string, string> | string[] | undefined, label: string, idx: number) {
  if (!colorMap) return '#ddd';
  if (Array.isArray(colorMap)) return colorMap[idx] || '#ddd';
  return colorMap[label] || '#ddd';
}

export function GaugeChart({ value, max = 100, label, color = '#2563EB' }: { value: number; max?: number; label: string; color?: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const arcLen = Math.PI * 44;
  const offset = arcLen * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <svg width="130" height="120" viewBox="0 0 130 120">
        <path d="M 15 65 A 44 44 0 0 1 115 65" fill="none" stroke="#E2E8F0" strokeWidth="16" strokeLinecap="round" />
        {pct > 0 && (
          <path d="M 15 65 A 44 44 0 0 1 115 65" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={arcLen} strokeDashoffset={offset} />
        )}
        <text x="65" y="48" textAnchor="middle" fontSize="28" fontWeight="800" fill="#0F172A">{Math.round(pct * 100)}%</text>
      </svg>
      <span className="text-xs text-text-muted mt-1">{label}</span>
    </div>
  );
}

export function BarChart({ data, colorMap, onFilterClick }: { data: { label: string; count: number }[]; colorMap?: Record<string, string>; onFilterClick?: (label: string) => void }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map(d => (
        <div key={d.label} className={`flex items-center gap-2 ${onFilterClick ? 'cursor-pointer hover:opacity-80' : ''}`} onClick={() => onFilterClick?.(d.label)}>
          <span className="text-xs text-text-secondary w-20 md:w-32 truncate shrink-0">{d.label}</span>
          <div className="flex-1 bg-surface-hover rounded-full h-5 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(d.count / maxCount) * 100}%`, backgroundColor: colorMap?.[d.label] || '#2563EB' }} />
          </div>
          <span className="text-xs text-text-muted w-8 text-right shrink-0">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({ data, colorMap, onFilterClick }: { data: { label: string; count: number }[]; colorMap?: Record<string, string> | string[]; onFilterClick?: (label: string) => void }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  let acc = 0;
  const slices = data.map(d => {
    const start = total > 0 ? (acc / total) * 360 : 0;
    acc += d.count;
    const end = total > 0 ? (acc / total) * 360 : 0;
    return { ...d, start, end };
  });

  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const r = 40;
  const cx = 50, cy = 50;

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 100 100">
        {slices.map((s, i) => {
          const x1 = cx + r * Math.cos(toRad(s.start));
          const y1 = cy + r * Math.sin(toRad(s.start));
          const x2 = cx + r * Math.cos(toRad(s.end));
          const y2 = cy + r * Math.sin(toRad(s.end));
          const large = s.end - s.start > 180 ? 1 : 0;
          return (
            <path key={`${s.label}-${i}`} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={getColor(colorMap, s.label, i)} />
          );
        })}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
        <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold" fill="#0F172A">{total > 0 ? total : '—'}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central" fontSize="7" fill="#94A3B8">total</text>
      </svg>
      <div className="w-full mt-1 space-y-1">
        {data.map((d, i) => (
          <div key={`${d.label}-${i}`} className={`flex items-center gap-1.5 text-[10px] text-text-muted ${onFilterClick ? 'cursor-pointer hover:opacity-80' : ''}`} onClick={() => onFilterClick?.(d.label)}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getColor(colorMap, d.label, i) }} />
            <span className="truncate flex-1">{d.label}</span>
            <span className="font-medium text-text-secondary">{total > 0 ? Math.round((d.count / total) * 100) : 0}%</span>
            <span className="text-text-muted">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({ data, maxMonth, minMonth, average, selectedMonth, onMonthClick }: {
  data: { month: string; count: number; key?: string }[];
  maxMonth?: string;
  minMonth?: string;
  average?: number;
  selectedMonth?: string;
  onMonthClick?: (key: string) => void;
}) {
  const gradId = useId();
  const w = 340, pad = 24, h = 110, labelH = 18, edgePad = 30;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const innerW = w - edgePad * 2;
  const pw = innerW / Math.max(data.length - 1, 1);
  const yScale = (c: number) => pad + (h - pad * 2) * (1 - c / maxCount);

  const points = data.map((d, i) => `${edgePad + i * pw},${yScale(d.count)}`).join(' ');
  const svgW = w;

  return (
    <div>
      <svg viewBox={`0 0 ${svgW} ${h + labelH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon fill={`url(#${gradId})`} points={`${edgePad},${h} ${points} ${edgePad + innerW},${h}`} />
        {average != null && average > 0 && (
          <>
            <line x1={edgePad} y1={yScale(average)} x2={edgePad + innerW} y2={yScale(average)} stroke="#F59E0B" strokeWidth="1" strokeDasharray="4 3" />
            <text x={edgePad - 2} y={yScale(average) + 10} fontSize="7" fill="#F59E0B" fontWeight="600" textAnchor="end">{average}</text>
          </>
        )}
        <polyline fill="none" stroke="#2563EB" strokeWidth="2" points={points} />
        {data.map((d, i) => {
          const isMax = maxMonth && d.month === maxMonth;
          const isMin = minMonth && d.month === minMonth;
          const isSelected = selectedMonth && d.key === selectedMonth;
          const color = isSelected ? '#7C3AED' : isMax ? '#10B981' : isMin ? '#EF4444' : '#2563EB';
          const r = isSelected ? 5.5 : isMax || isMin ? 4.5 : 3;
          const handleClick = () => { if (onMonthClick && d.key) onMonthClick(d.key); };
          return (
            <g key={i} style={{ cursor: onMonthClick && d.key ? 'pointer' : undefined }} onClick={handleClick}>
              <circle cx={edgePad + i * pw} cy={yScale(d.count)} r={r + 4} fill="transparent" />
              <circle cx={edgePad + i * pw} cy={yScale(d.count)} r={r} fill={color} />
              {isSelected && <circle cx={edgePad + i * pw} cy={yScale(d.count)} r={r + 3} fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />}
            </g>
          );
        })}
        {data.map((d, i) => {
          const isMax = maxMonth && d.month === maxMonth;
          const isMin = minMonth && d.month === minMonth;
          const isSelected = selectedMonth && d.key === selectedMonth;
          const color = isSelected ? '#7C3AED' : isMax ? '#10B981' : isMin ? '#EF4444' : '#0F172A';
          const handleClick = () => { if (onMonthClick && d.key) onMonthClick(d.key); };
          return (
            <text key={`v${i}`} x={edgePad + i * pw} y={yScale(d.count) - 7} textAnchor="middle" fontSize="10" fontWeight="bold" fill={color}
              style={{ cursor: onMonthClick && d.key ? 'pointer' : undefined }} onClick={handleClick}>{d.count}</text>
          );
        })}
        {data.map((d, i) => {
          const isSelected = selectedMonth && d.key === selectedMonth;
          const handleClick = () => { if (onMonthClick && d.key) onMonthClick(d.key); };
          return (
            <text key={`l${i}`} x={edgePad + i * pw} y={h + 12} textAnchor="middle" fontSize="9"
              fill={isSelected ? '#7C3AED' : '#94A3B8'} fontWeight={isSelected ? '700' : '400'}
              style={{ cursor: onMonthClick && d.key ? 'pointer' : undefined }} onClick={handleClick}>{d.month}</text>
          );
        })}
      </svg>
    </div>
  );
}
