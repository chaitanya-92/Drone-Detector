export default function BatteryBar({ level }) {
  const pct = Math.max(0, Math.min(100, level));
  const cls = pct > 50 ? 'battery-high' : pct > 20 ? 'battery-mid' : 'battery-low';
  return (
    <div className="battery" title={`Battery ${pct}%`}>
      <div className={`battery-fill ${cls}`} style={{ width: `${pct}%` }} />
      <span className="battery-label">{Math.round(pct)}%</span>
    </div>
  );
}
