// Radar view: concentric rings + rotating sweep, drones plotted by bearing/range from the hub.

import { bearingFrom, rangeKm } from '../utils/geo.js';

const SIZE = 840;
const C = SIZE / 2;
const MAX_R = C - 40;
const RINGS = [0.25, 0.5, 0.75, 1];

export default function MapView({ drones, companies, center, span, scanning, selectedDroneId, onSelectDrone }) {
  if (!center) {
    return (
      <div className="radar radar-loading">
        <p>AWAITING FLEET DATA…</p>
      </div>
    );
  }

  const maxRangeKm = (span / 2) * 111; // radar edge in km

  function project(d) {
    const bearing = (bearingFrom(center, d) * Math.PI) / 180;
    const r = Math.min((rangeKm(center, d) / maxRangeKm) * MAX_R, MAX_R);
    return { x: C + Math.sin(bearing) * r, y: C - Math.cos(bearing) * r };
  }

  return (
    <div className="radar">
      <div className="panel-title radar-title">● RF RADAR · OMNI 360°</div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" onClick={() => onSelectDrone(null)}>
        <defs>
          <radialGradient id="sweepGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
            gradientTransform={`translate(${C} ${C})`}>
            <stop offset="0%" stopColor="rgba(45, 212, 130, 0.35)" />
            <stop offset="100%" stopColor="rgba(45, 212, 130, 0)" />
          </radialGradient>
        </defs>

        {/* Rings */}
        {RINGS.map((f) => (
          <circle key={f} cx={C} cy={C} r={MAX_R * f} className="radar-ring" />
        ))}
        {/* Crosshairs */}
        <line x1={C} y1={C - MAX_R} x2={C} y2={C + MAX_R} className="radar-ring" />
        <line x1={C - MAX_R} y1={C} x2={C + MAX_R} y2={C} className="radar-ring" />
        {/* Range labels */}
        {RINGS.map((f) => (
          <text key={`t${f}`} x={C + 6} y={C - MAX_R * f + 14} className="radar-range-label">
            {(maxRangeKm * f).toFixed(1)}km
          </text>
        ))}

        {/* Rotating sweep */}
        <g className={`radar-sweep ${scanning ? '' : 'sweep-paused'}`} style={{ transformOrigin: `${C}px ${C}px` }}>
          <path
            d={`M ${C} ${C} L ${C} ${C - MAX_R} A ${MAX_R} ${MAX_R} 0 0 1 ${
              C + MAX_R * Math.sin(0.35)
            } ${C - MAX_R * Math.cos(0.35)} Z`}
            fill="url(#sweepGrad)"
          />
        </g>

        {/* Hub */}
        <circle cx={C} cy={C} r={3} className="hub-dot" />

        {/* Drones */}
        {drones.map((d) => {
          const { x, y } = project(d);
          const color = companies[d.companyId]?.color || '#7de3a0';
          const selected = d.id === selectedDroneId;
          return (
            <g
              key={d.id}
              transform={`translate(${x}, ${y})`}
              className={`blip ${selected ? 'blip-selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectDrone(d.id);
              }}
            >
              {selected && <circle r={14} className="blip-halo" />}
              <circle r={9} fill={color} opacity="0.25" />
              <circle r={4.5} fill={color} className="blip-core" />
              <text y={22} textAnchor="middle" className="blip-label">
                {d.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="radar-legend">
        {Object.values(companies).map((c) => (
          <span key={c.id} className="legend-item">
            <span className="swatch" style={{ background: c.color }} />
            {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}
