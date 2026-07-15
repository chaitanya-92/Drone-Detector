import { api } from '../api.js';

export default function CompanyCard({ company, droneCount = 0, selected, onSelect }) {
  async function handleDelete(e) {
    e.stopPropagation();
    if (!confirm(`Remove ${company.name} and all of its drones?`)) return;
    try {
      await api.deleteCompany(company.id); // UI updates via WebSocket
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className={`company-row ${selected ? 'row-selected' : ''}`} onClick={onSelect}>
      <span className="swatch" style={{ background: company.color }} />
      <div className="company-info">
        <span className="company-name" style={{ color: company.color }}>
          {company.name}
        </span>
        <span className="row-meta">
          {droneCount} drones · {company.industry}
        </span>
      </div>
      <button className="btn btn-icon" onClick={handleDelete} title="Delete company">
        ✕
      </button>
    </div>
  );
}
