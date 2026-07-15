// ACTIVE TRACKS table — radar-style listing of every drone in view.

import { bearingFrom, rangeKm, STATUS_CODE } from '../utils/geo.js';

export default function DroneList({
  drones,
  companies,
  center,
  selectedCompanyId,
  selectedDroneId,
  onSelectDrone
}) {
  const sorted = [...drones].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="panel panel-grow">
      <div className="panel-title">
        ■ ACTIVE TRACKS ({drones.length})
        {selectedCompanyId && companies[selectedCompanyId] && (
          <span className="filter-tag">{companies[selectedCompanyId].name}</span>
        )}
      </div>
      <div className="table-wrap">
        <table className="tracks">
          <thead>
            <tr>
              <th>ID</th>
              <th>COMPANY</th>
              <th>BEARING</th>
              <th>RANGE</th>
              <th>BATT</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const company = companies[d.companyId];
              return (
                <tr
                  key={d.id}
                  className={d.id === selectedDroneId ? 'row-selected' : ''}
                  onClick={() => onSelectDrone(d.id === selectedDroneId ? null : d.id)}
                >
                  <td className="accent">{d.name}</td>
                  <td style={{ color: company?.color }}>{company?.name || '—'}</td>
                  <td>{center ? `${bearingFrom(center, d)}°` : '—'}</td>
                  <td>{center ? `${rangeKm(center, d).toFixed(2)}km` : '—'}</td>
                  <td className={d.battery < 20 ? 'text-red' : d.battery < 50 ? 'text-amber' : 'text-green'}>
                    {Math.round(d.battery)}%
                  </td>
                  <td>
                    <span className={`status status-${d.status}`}>{STATUS_CODE[d.status]}</span>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  NO ACTIVE TRACKS
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
