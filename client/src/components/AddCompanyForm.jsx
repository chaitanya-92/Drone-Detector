import { useState } from 'react';
import { api } from '../api.js';

const COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#9575cd', '#4db6ac', '#f06292'];

export default function AddCompanyForm({ onDone }) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('Delivery');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required');
    setSaving(true);
    setError('');
    try {
      await api.addCompany({ name, industry, color }); // appears via WebSocket
      setName('');
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <input
        placeholder="Company name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <select value={industry} onChange={(e) => setIndustry(e.target.value)}>
        {['Delivery', 'Medical', 'Security', 'Logistics', 'Agriculture', 'Surveying', 'Other'].map(
          (opt) => (
            <option key={opt}>{opt}</option>
          )
        )}
      </select>
      <div className="color-row">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-swatch ${c === color ? 'color-selected' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary" disabled={saving}>
        {saving ? 'Adding…' : 'Register Company'}
      </button>
    </form>
  );
}
