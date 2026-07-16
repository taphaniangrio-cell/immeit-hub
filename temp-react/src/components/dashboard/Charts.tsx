function getColor(colorMap: Record<string, string> | string[] | undefined, label: string, idx: number) {
  if (!colorMap) return '#ddd';
  if (Array.isArray(colorMap)) return colorMap[idx] || '#ddd';
  return colorMap[label] || '#ddd';
}

export function GaugeChart({ value, max = 100, label, color = '#0A66C2' }: { value: number; max?: number; label: string; color?: string }) {
  const pct = Math.min(value / max, 1);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <svg width="130" height="80" viewBox="0 0 130 85" className="overflow-visible">
        <path d="M 15 65 A 44 44 0 0 1 115 65" fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round" />
        {pct > 0 && (
          <path d="M 15 65 A 44 44 0 0 1 115 65" fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
        )}
        <text x="65" y="48" textAnchor="middle" fontSize="28" fontWeight="800" fill="#374151">{Math.round(pct * 100)}%</text>
      </svg>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
    </div>
  );
}

export function BarChart({ data, colorMap }: { data: { label: string; count: number }[]; colorMap?: Record<string, string> }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-32 truncate shrink-0">{d.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(d.count / maxCount) * 100}%`, backgroundColor: colorMap?.[d.label] || '#0A66C2' }} />
          </div>
          <span className="text-xs text-gray-500 w-8 text-right shrink-0">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({ data, colorMap }: { data: { label: string; count: number }[]; colorMap?: Record<string, string> | string[] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  let acc = 0;
  const slices = data.map(d => {
    const start = (acc / total) * 360;
    acc += d.count;
    const end = (acc / total) * 360;
    return { ...d, start, end };
  });

  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const r = 40;
  const cx = 50, cy = 50;

  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 100 100">
        {slices.map(s => {
          const x1 = cx + r * Math.cos(toRad(s.start));
          const y1 = cy + r * Math.sin(toRad(s.start));
          const x2 = cx + r * Math.cos(toRad(s.end));
          const y2 = cy + r * Math.sin(toRad(s.end));
          const large = s.end - s.start > 180 ? 1 : 0;
          return (
            <path key={s.label} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`} fill={getColor(colorMap, s.label, slices.indexOf(s))} />
          );
        })}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
        <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold" fill="#374151">{total}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="central" fontSize="7" fill="#9CA3AF">total</text>
      </svg>
      <div className="w-full mt-1 space-y-1">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getColor(colorMap, d.label, i) }} />
            <span className="truncate flex-1">{d.label}</span>
            <span className="font-medium">{Math.round((d.count / total) * 100)}%</span>
            <span className="text-gray-400">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({ data }: { data: { month: string; count: number }[] }) {
  const w = 340, pad = 24, h = 110, labelH = 18;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const pw = w / Math.max(data.length - 1, 1);
  const yScale = (c: number) => pad + (h - pad * 2) * (1 - c / maxCount);

  const points = data.map((d, i) => `${i * pw},${yScale(d.count)}`).join(' ');

  return (
    <div>
      <svg width={w} height={h + labelH} className="w-full max-w-full">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A66C2" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0A66C2" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon fill="url(#areaGrad)" points={`0,${h} ${points} ${w},${h}`} />
        <polyline fill="none" stroke="#0A66C2" strokeWidth="2" points={points} />
        {data.map((d, i) => (
          <circle key={i} cx={i * pw} cy={yScale(d.count)} r="3" fill="#0A66C2" />
        ))}
        {data.map((d, i) => (
          <text key={`v${i}`} x={i * pw} y={yScale(d.count) - 7} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#374151">{d.count}</text>
        ))}
        {data.map((d, i) => (
          <text key={`l${i}`} x={i * pw} y={h + 12} textAnchor="middle" fontSize="9" fill="#9CA3AF">{d.month}</text>
        ))}
      </svg>
    </div>
  );
}
