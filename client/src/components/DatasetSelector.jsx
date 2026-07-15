import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function DatasetSelector({ activeId }) {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getDatasets().then((res) => setDatasets(res.datasets)).catch(() => {});
  }, []);

  async function handleChange(e) {
    const id = e.target.value;
    if (!id || id === activeId) return;
    setLoading(true);
    try {
      await api.loadDataset(id); // new state arrives via WebSocket 'dataset:loaded'
    } finally {
      setLoading(false);
    }
  }

  return (
    <label className="dataset-selector">
      <span>▦ LOAD DATA</span>
      <select value={activeId || ''} onChange={handleChange} disabled={loading}>
        {datasets.map((d) => (
          <option key={d.id} value={d.id} title={d.description}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  );
}
