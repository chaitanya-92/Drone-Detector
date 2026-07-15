import { useState } from 'react';
import { api } from '../api.js';

const MODELS = [
  'DJI Matrice 350',
  'Skydio X10',
  'Parrot Anafi AI',
  'Wing Hummingbird',
  'Zipline P2',
  'Autel Dragonfish'
];

export default function AddDroneForm({ companyId, onDone }) {
  const [name, setName] = useState('');
  const [model, setModel] = useState(MODELS[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.addDrone(companyId, { name: name.trim() || undefined, model });
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
        placeholder="Drone name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <select value={model} onChange={(e) => setModel(e.target.value)}>
        {MODELS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary" disabled={saving}>
        {saving ? 'Deploying…' : 'Deploy Drone'}
      </button>
    </form>
  );
}
