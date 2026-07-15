// REST API endpoints.

import { Router } from 'express';
import { DATASETS, getDataset } from './datasets.js';
import {
  store,
  createCompany,
  createDrone,
  deleteCompany,
  deleteDrone,
  getCompanies,
  getCompanyDrones,
  getDrones,
  getStats
} from './store.js';
import { loadDataset, snapshot, getCenter } from './simulator.js';

export function buildRouter(broadcast) {
  const router = Router();

  // 1. GET /api/datasets — list available datasets
  router.get('/datasets', (req, res) => {
    res.json({
      active: store.datasetId,
      datasets: DATASETS.map(({ id, name, description }) => ({ id, name, description }))
    });
  });

  // 2. POST /api/datasets/:id/load — switch dataset (resets fleet)
  router.post('/datasets/:id/load', (req, res) => {
    const dataset = loadDataset(req.params.id);
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });
    res.json({ ok: true, dataset: { id: dataset.id, name: dataset.name } });
  });

  // 3. GET /api/companies — all companies with drone counts
  router.get('/companies', (req, res) => {
    res.json(getCompanies());
  });

  // 4. POST /api/companies — register a company
  router.post('/companies', (req, res) => {
    const { name, industry, color } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Company name is required' });
    const company = createCompany({ name: name.trim(), industry, color });
    broadcast({ type: 'company:added', payload: { company, stats: getStats() } });
    res.status(201).json(company);
  });

  // 5. DELETE /api/companies/:id — remove company and its drones
  router.delete('/companies/:id', (req, res) => {
    const result = deleteCompany(req.params.id);
    if (!result) return res.status(404).json({ error: 'Company not found' });
    broadcast({
      type: 'company:removed',
      payload: { companyId: req.params.id, removedDrones: result.removedDrones, stats: getStats() }
    });
    res.json({ ok: true, removedDrones: result.removedDrones.length });
  });

  // 6. GET /api/companies/:id/drones — drones for one company
  router.get('/companies/:id/drones', (req, res) => {
    if (!store.companies.has(req.params.id)) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json(getCompanyDrones(req.params.id));
  });

  // 7. POST /api/companies/:id/drones — add a drone to a company
  router.post('/companies/:id/drones', (req, res) => {
    if (!store.companies.has(req.params.id)) {
      return res.status(404).json({ error: 'Company not found' });
    }
    const { name, model } = req.body || {};
    const drone = createDrone({ companyId: req.params.id, name, model, center: getCenter() });
    broadcast({ type: 'drone:added', payload: { drone, stats: getStats() } });
    res.status(201).json(drone);
  });

  // Extra: GET /api/drones — full fleet
  router.get('/drones', (req, res) => {
    res.json(getDrones());
  });

  // Extra: DELETE /api/drones/:id
  router.delete('/drones/:id', (req, res) => {
    const drone = deleteDrone(req.params.id);
    if (!drone) return res.status(404).json({ error: 'Drone not found' });
    broadcast({ type: 'drone:removed', payload: { droneId: drone.id, stats: getStats() } });
    res.json({ ok: true });
  });

  // Extra: GET /api/snapshot — full state (used on page load / reconnect)
  router.get('/snapshot', (req, res) => {
    res.json(snapshot());
  });

  return router;
}
