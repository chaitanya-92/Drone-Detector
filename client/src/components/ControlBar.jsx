import { api } from '../api.js';
import DatasetSelector from './DatasetSelector.jsx';

export default function ControlBar({
  scanning,
  onToggleScanning,
  datasetId,
  companies,
  selectedCompanyId,
  onClearLog
}) {
  async function handleTestDrone() {
    const targetId =
      selectedCompanyId || companies[Math.floor(Math.random() * companies.length)]?.id;
    if (!targetId) return alert('Register a company first.');
    try {
      await api.addDrone(targetId, {});
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <footer className="controlbar">
      <button className={`btn btn-ctl ${scanning ? 'btn-scanning' : ''}`} onClick={onToggleScanning}>
        {scanning ? '● SCANNING' : '‖ PAUSED'}
      </button>
      <button className="btn btn-ctl" onClick={handleTestDrone}>
        + TEST DRONE
      </button>
      <DatasetSelector activeId={datasetId} />
      <button className="btn btn-ctl" onClick={onClearLog}>
        ✕ CLEAR LOG
      </button>
    </footer>
  );
}
