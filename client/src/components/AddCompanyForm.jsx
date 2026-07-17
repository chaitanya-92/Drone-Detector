// Two-step wizard: 1) register the company, 2) import its fleet dataset
// (paste/upload JSON or CSV, auto-generate N drones, or skip).

import { useRef, useState } from 'react';
import { api } from '../api.js';

const COLORS = ['#35c3e8', '#2dd482', '#f5a623', '#f04e4e', '#b07ce8', '#4dd0b1', '#f06292'];

export default function AddCompanyForm({ onDone, onCompanyCreated }) {
  const [step, setStep] = useState(1);
  const [company, setCompany] = useState(null);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('Delivery');
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Step 2 state
  const [mode, setMode] = useState('paste'); // paste | generate
  const [raw, setRaw] = useState('');
  const [count, setCount] = useState(5);
  const fileRef = useRef(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Name is required');
    setBusy(true);
    setError('');
    try {
      const created = await api.addCompany({ name, industry, color });
      setCompany(created);
      onCompanyCreated?.(created.id);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function parseFleet(text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Paste or upload fleet data first');
    // JSON: array of {name, model, lat, lng, battery, status}
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed) ? parsed : parsed.drones;
      if (!Array.isArray(list)) throw new Error('JSON must be an array of drones');
      return list;
    }
    // CSV: header row then name,model,lat,lng,battery,status
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const idx = (key) => header.indexOf(key);
    if (idx('name') === -1 && idx('lat') === -1) {
      throw new Error('CSV needs a header row (name,model,lat,lng,battery,status)');
    }
    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      const pick = (key) => (idx(key) >= 0 ? cells[idx(key)] : undefined);
      return {
        name: pick('name'),
        model: pick('model'),
        lat: pick('lat'),
        lng: pick('lng'),
        battery: pick('battery'),
        status: pick('status')
      };
    });
  }

  async function handleImport(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = mode === 'generate' ? { generate: count } : { drones: parseFleet(raw) };
      await api.importFleet(company.id, body); // drones appear via WebSocket
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result));
    reader.readAsText(file);
  }

  if (step === 2) {
    return (
      <form className="form" onSubmit={handleImport}>
        <p className="form-step">
          STEP 2/2 · IMPORT FLEET FOR <span style={{ color: company.color }}>{company.name}</span>
        </p>
        <div className="mode-row">
          <button
            type="button"
            className={`btn btn-mode ${mode === 'paste' ? 'btn-mode-on' : ''}`}
            onClick={() => setMode('paste')}
          >
            ▦ DATASET
          </button>
          <button
            type="button"
            className={`btn btn-mode ${mode === 'generate' ? 'btn-mode-on' : ''}`}
            onClick={() => setMode('generate')}
          >
            ⚙ GENERATE
          </button>
        </div>

        {mode === 'paste' ? (
          <>
            <textarea
              rows={6}
              placeholder={
                'Paste JSON or CSV…\n\nCSV example:\nname,model,lat,lng,battery\nFalcon-1,Skydio X10,40.71,-74.00,88\n\nJSON example:\n[{"name":"Falcon-1","lat":40.71,"lng":-74.0}]'
              }
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              ⬆ UPLOAD .JSON / .CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.txt"
              hidden
              onChange={handleFile}
            />
          </>
        ) : (
          <label className="gen-row">
            SPAWN
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
            DRONES NEAR HUB
          </label>
        )}

        {error && <p className="form-error">{error}</p>}
        <div className="mode-row">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'IMPORTING…' : '✓ IMPORT FLEET'}
          </button>
          <button type="button" className="btn" onClick={() => onDone?.()}>
            SKIP
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={handleCreate}>
      <p className="form-step">STEP 1/2 · COMPANY DETAILS</p>
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
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'REGISTERING…' : 'NEXT → FLEET DATA'}
      </button>
    </form>
  );
}
