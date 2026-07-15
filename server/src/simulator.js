// Auto-simulator: spawns fleets from a dataset and moves drones every tick.

import { getDataset } from './datasets.js';
import { store, clearAll, createCompany, createDrone, getDrones, getStats } from './store.js';

const TICK_MS = 1000;
let timer = null;
let broadcastFn = () => {};
let running = true;
let currentSpan = 0.2;
let currentCenter = { lat: 37.7749, lng: -122.4194 };

export function initSimulator(broadcast) {
  broadcastFn = broadcast;
  loadDataset('sf-delivery', { silent: true });
  timer = setInterval(tick, TICK_MS);
}

export function loadDataset(datasetId, { silent = false } = {}) {
  const dataset = getDataset(datasetId);
  if (!dataset) return null;

  clearAll();
  store.datasetId = dataset.id;
  currentSpan = dataset.span;
  currentCenter = dataset.center;

  dataset.companies.forEach((spec) => {
    const company = createCompany(spec);
    for (let i = 0; i < spec.drones; i++) {
      createDrone({ companyId: company.id, center: dataset.center });
    }
  });

  if (!silent) {
    broadcastFn({ type: 'dataset:loaded', payload: snapshot() });
  }
  return dataset;
}

export function snapshot() {
  return {
    datasetId: store.datasetId,
    center: currentCenter,
    span: currentSpan,
    companies: [...store.companies.values()],
    drones: getDrones(),
    stats: getStats(),
    simulatorRunning: running
  };
}

export function setRunning(value) {
  running = value;
  broadcastFn({ type: 'simulator:state', payload: { running } });
}

export function isRunning() {
  return running;
}

export function getCenter() {
  return currentCenter;
}

function tick() {
  if (!running) return;

  const updated = [];
  const now = new Date().toISOString();

  getDrones().forEach((d) => {
    switch (d.status) {
      case 'active': {
        moveDrone(d);
        d.battery = Math.max(0, +(d.battery - 0.15 - Math.random() * 0.2).toFixed(2));
        if (d.battery < 20) d.status = 'returning';
        else if (Math.random() < 0.01) d.status = 'idle';
        break;
      }
      case 'returning': {
        // Head back toward dataset center, faster battery drain
        d.heading = bearingTo(d, currentCenter);
        moveDrone(d, 1.4);
        d.battery = Math.max(0, +(d.battery - 0.25).toFixed(2));
        if (distanceDeg(d, currentCenter) < 0.005 || d.battery <= 5) {
          d.status = 'charging';
          d.speed = 0;
          d.altitude = 0;
        }
        break;
      }
      case 'charging': {
        d.battery = Math.min(100, +(d.battery + 2.5).toFixed(2));
        if (d.battery >= 95) {
          d.status = 'active';
          d.speed = 8 + Math.round(Math.random() * 12);
          d.altitude = 40 + Math.round(Math.random() * 120);
          d.heading = Math.round(Math.random() * 360);
        }
        break;
      }
      case 'idle': {
        d.battery = Math.max(0, +(d.battery - 0.03).toFixed(2));
        if (Math.random() < 0.15) d.status = 'active';
        break;
      }
    }
    d.lastUpdate = now;
    updated.push(d);
  });

  if (updated.length) {
    broadcastFn({ type: 'drones:update', payload: { drones: updated, stats: getStats() } });
  }
}

function moveDrone(d, speedFactor = 1) {
  // Convert m/s to rough degrees per tick (1 deg ~ 111km)
  const degPerTick = (d.speed * speedFactor * (TICK_MS / 1000)) / 111000;
  const rad = (d.heading * Math.PI) / 180;
  d.lat += Math.cos(rad) * degPerTick * 20; // 20x time-compression so movement is visible
  d.lng += Math.sin(rad) * degPerTick * 20;

  // Wander: small random heading changes
  d.heading = (d.heading + (Math.random() - 0.5) * 30 + 360) % 360;
  // Altitude drift
  d.altitude = Math.max(20, Math.min(200, d.altitude + Math.round((Math.random() - 0.5) * 10)));

  // Keep drones inside the dataset bounding box
  const half = currentSpan / 2;
  if (Math.abs(d.lat - currentCenter.lat) > half || Math.abs(d.lng - currentCenter.lng) > half) {
    d.heading = bearingTo(d, currentCenter);
  }

  d.lat = +d.lat.toFixed(6);
  d.lng = +d.lng.toFixed(6);
}

function bearingTo(from, to) {
  const angle = (Math.atan2(to.lng - from.lng, to.lat - from.lat) * 180) / Math.PI;
  return Math.round((angle + 360) % 360);
}

function distanceDeg(a, b) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

export function stopSimulator() {
  if (timer) clearInterval(timer);
}
