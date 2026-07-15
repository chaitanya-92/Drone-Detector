import BatteryBar from './BatteryBar.jsx';
import { bearingFrom, rangeKm, STATUS_CODE } from '../utils/geo.js';

export default function DroneDetail({ drone, company, center, onClose }) {
  const rows = [
    ['COMPANY', company?.name || '—'],
    ['MODEL', drone.model],
    ['STATUS', STATUS_CODE[drone.status]],
    ['BEARING', center ? `${bearingFrom(center, drone)}°` : '—'],
    ['RANGE', center ? `${rangeKm(center, drone).toFixed(2)} km` : '—'],
    ['LAT', drone.lat.toFixed(6)],
    ['LNG', drone.lng.toFixed(6)],
    ['ALT', `${drone.altitude} m`],
    ['SPEED', `${drone.speed} m/s`],
    ['LAST PING', new Date(drone.lastUpdate).toLocaleTimeString('en-GB', { hour12: false })]
  ];

  return (
    <div className="drone-detail">
      <div className="drone-detail-header">
        <h3>
          <span className="swatch" style={{ background: company?.color || '#7de3a0' }} />
          {drone.name}
        </h3>
        <button className="btn btn-icon" onClick={onClose}>
          ✕
        </button>
      </div>
      <BatteryBar level={drone.battery} />
      <table className="detail-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
