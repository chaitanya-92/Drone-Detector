import { useState } from 'react';
import CompanyCard from './CompanyCard.jsx';
import AddCompanyForm from './AddCompanyForm.jsx';

export default function CompanyList({
  companies,
  droneCounts = {},
  selectedCompanyId,
  onSelect,
  onCompanyCreated
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="panel">
      <div className="panel-title">🏢 COMPANIES ({companies.length})</div>
      <div className="panel-body">
        {companies.length === 0 && <p className="empty">NO COMPANIES REGISTERED</p>}
        {companies.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            droneCount={droneCounts[company.id] || 0}
            selected={company.id === selectedCompanyId}
            onSelect={() => onSelect(company.id)}
          />
        ))}
      </div>
      {showForm && (
        <AddCompanyForm onDone={() => setShowForm(false)} onCompanyCreated={onCompanyCreated} />
      )}
      <button className="btn btn-wide" onClick={() => setShowForm((v) => !v)}>
        {showForm ? '✕ CANCEL' : '+ ADD COMPANY'}
      </button>
    </section>
  );
}
