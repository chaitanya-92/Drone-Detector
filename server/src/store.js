// In-memory data store for companies and drones.

let nextCompanyId = 1;
let nextDroneId = 1;

export const store = {
  datasetId: null,
  companies: new Map(), // id -> company
  drones: new Map() // id -> drone
};

const DRONE_MODELS = [
  'DJI Matrice 350',
  'Skydio X10',
  'Parrot Anafi AI',
  'Wing Hummingbird',
  'Zipline P2',
  'Autel Dragonfish'
];

export const DRONE_STATUSES = ['active', 'idle', 'returning', 'charging'];

export function createCompany({ name, industry = 'General', color = '#4fc3f7' }) {
  const id = `c${nextCompanyId++}`;
  const company = {
    id,
    name,
    industry,
    color,
    createdAt: new Date().toISOString()
  };
  store.companies.set(id, company);
  return company;
}

export function createDrone({ companyId, name, model, lat, lng, center }) {
  const id = `d${nextDroneId++}`;
  const base = center || { lat: lat ?? 0, lng: lng ?? 0 };
  const drone = {
    id,
    companyId,
    name: name || `Drone-${String(nextDroneId - 1).padStart(3, '0')}`,
    model: model || DRONE_MODELS[Math.floor(Math.random() * DRONE_MODELS.length)],
    status: 'active',
    battery: 60 + Math.round(Math.random() * 40),
    lat: lat ?? base.lat + (Math.random() - 0.5) * 0.1,
    lng: lng ?? base.lng + (Math.random() - 0.5) * 0.1,
    altitude: 40 + Math.round(Math.random() * 120), // meters
    speed: 8 + Math.round(Math.random() * 12), // m/s
    heading: Math.round(Math.random() * 360), // degrees
    lastUpdate: new Date().toISOString()
  };
  store.drones.set(id, drone);
  return drone;
}

export function getCompanies() {
  return [...store.companies.values()].map((c) => ({
    ...c,
    droneCount: getCompanyDrones(c.id).length
  }));
}

export function getCompanyDrones(companyId) {
  return [...store.drones.values()].filter((d) => d.companyId === companyId);
}

export function getDrones() {
  return [...store.drones.values()];
}

export function deleteCompany(id) {
  const company = store.companies.get(id);
  if (!company) return null;
  const removedDrones = getCompanyDrones(id).map((d) => d.id);
  removedDrones.forEach((droneId) => store.drones.delete(droneId));
  store.companies.delete(id);
  return { company, removedDrones };
}

export function deleteDrone(id) {
  const drone = store.drones.get(id);
  if (!drone) return null;
  store.drones.delete(id);
  return drone;
}

export function clearAll() {
  store.companies.clear();
  store.drones.clear();
}

export function getStats() {
  const drones = getDrones();
  const byStatus = { active: 0, idle: 0, returning: 0, charging: 0 };
  let batterySum = 0;
  drones.forEach((d) => {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    batterySum += d.battery;
  });
  return {
    companies: store.companies.size,
    drones: drones.length,
    byStatus,
    avgBattery: drones.length ? Math.round(batterySum / drones.length) : 0
  };
}
