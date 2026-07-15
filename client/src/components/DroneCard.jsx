import { api } from '../api.js';
import BatteryBar from './BatteryBar.jsx';

export default function DroneCard({ drone, company, selected, onSelect }) {
  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Remove ${drone.name}?`)) return;
    try {
      await api.deleteDrone(drone.id); // UI updates via WebSocket
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div
      className={`card drone-card ${selected ? 'card-selected' : ''}`}
      onClick={onSelect}
      style={{ borderLeftColor: company?.color || '#888' }}
    >
      <div className="card-main">
        <div className="drone-card-top">
          <span className="drone-name">{drone.name}</span>
          <span className={`status status-${drone.status}`}>{drone.status}</span>
        </div>
        <span className="drone-meta">
          {company?.name || 'Unknown'} · {drone.model}
        </span>
        <BatteryBar level={drone.battery} />
      </div>
      <button className="btn btn-icon btn-danger" onClick={handleDelete} title="Delete drone">
        🗑
      </button>
    </div>
  );
}
