// REST API helpers. In dev, Vite proxies /api and /ws to the Node server on :4000.

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  getSnapshot: () => request('/snapshot'),
  getDatasets: () => request('/datasets'),
  loadDataset: (id) => request(`/datasets/${id}/load`, { method: 'POST' }),
  getCompanies: () => request('/companies'),
  addCompany: (data) => request('/companies', { method: 'POST', body: JSON.stringify(data) }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: 'DELETE' }),
  getCompanyDrones: (id) => request(`/companies/${id}/drones`),
  addDrone: (companyId, data) =>
    request(`/companies/${companyId}/drones`, { method: 'POST', body: JSON.stringify(data) }),
  deleteDrone: (id) => request(`/drones/${id}`, { method: 'DELETE' })
};
