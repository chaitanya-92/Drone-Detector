import { useMemo, useState } from 'react';
import { useFleet } from './hooks/useFleet.js';
import Header from './components/Header.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import CompanyList from './components/CompanyList.jsx';
import DroneList from './components/DroneList.jsx';
import MapView from './components/MapView.jsx';
import DroneDetail from './components/DroneDetail.jsx';
import SignalLog from './components/SignalLog.jsx';
import ControlBar from './components/ControlBar.jsx';

export default function App() {
  const fleet = useFleet();
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [selectedDroneId, setSelectedDroneId] = useState(null);

  const visibleDrones = useMemo(
    () =>
      selectedCompanyId
        ? fleet.droneList.filter((d) => d.companyId === selectedCompanyId)
        : fleet.droneList,
    [fleet.droneList, selectedCompanyId]
  );

  const droneCounts = useMemo(() => {
    const counts = {};
    fleet.droneList.forEach((d) => (counts[d.companyId] = (counts[d.companyId] || 0) + 1));
    return counts;
  }, [fleet.droneList]);

  const selectedDrone = selectedDroneId ? fleet.drones[selectedDroneId] : null;
  const companyById = useMemo(
    () => Object.fromEntries(fleet.companies.map((c) => [c.id, c])),
    [fleet.companies]
  );

  function selectCompany(id) {
    setSelectedCompanyId((prev) => (prev === id ? null : id));
    setSelectedDroneId(null);
  }

  return (
    <div className="app">
      <Header connected={fleet.connected} companies={fleet.companies.length} />
      <div className="layout">
        <section className="radar-wrap">
          <MapView
            drones={visibleDrones}
            companies={companyById}
            center={fleet.center}
            span={fleet.span}
            scanning={fleet.simulatorRunning}
            selectedDroneId={selectedDroneId}
            onSelectDrone={setSelectedDroneId}
          />
          {selectedDrone && (
            <DroneDetail
              drone={selectedDrone}
              company={companyById[selectedDrone.companyId]}
              center={fleet.center}
              onClose={() => setSelectedDroneId(null)}
            />
          )}
        </section>
        <aside className="col col-mid">
          <CompanyList
            companies={fleet.companies}
            droneCounts={droneCounts}
            selectedCompanyId={selectedCompanyId}
            onSelect={selectCompany}
          />
          <StatsPanel stats={fleet.stats} />
          <DroneList
            drones={visibleDrones}
            companies={companyById}
            center={fleet.center}
            selectedCompanyId={selectedCompanyId}
            selectedDroneId={selectedDroneId}
            onSelectDrone={setSelectedDroneId}
          />
        </aside>
        <aside className="col col-right">
          <SignalLog log={fleet.log} />
        </aside>
      </div>
      <ControlBar
        scanning={fleet.simulatorRunning}
        onToggleScanning={fleet.toggleSimulator}
        datasetId={fleet.datasetId}
        companies={fleet.companies}
        selectedCompanyId={selectedCompanyId}
        onClearLog={fleet.clearLog}
      />
    </div>
  );
}
