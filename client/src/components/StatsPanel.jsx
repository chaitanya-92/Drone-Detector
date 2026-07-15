export default function StatsPanel({ stats }) {
  if (!stats) return null;
  const tiles = [
    { label: 'TOTAL', value: stats.drones, cls: '' },
    { label: 'ACTIVE', value: stats.byStatus.active, cls: 'tile-green' },
    { label: 'LOW BATT', value: stats.byStatus.returning, cls: 'tile-red' },
    { label: 'CHARGING', value: stats.byStatus.charging, cls: 'tile-amber' }
  ];
  return (
    <section className="panel">
      <div className="panel-title">■ STATISTICS</div>
      <div className="stat-grid">
        {tiles.map((t) => (
          <div key={t.label} className={`stat-tile ${t.cls}`}>
            <span className="stat-tile-label">{t.label}</span>
            <span className="stat-tile-value">{t.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
