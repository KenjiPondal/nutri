/** Circular dial. value/max -> arc fill. Children render in the center. */
export default function Ring({ value, max = 100, color, size = 120, stroke = 8, children, label, track = 'var(--track)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className="ring" style={{ width: size }}>
      <div className="ring-dial" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
        </svg>
        <div className="ring-center">{children}</div>
      </div>
      {label && <div className="ring-label">{label}</div>}
    </div>
  );
}
