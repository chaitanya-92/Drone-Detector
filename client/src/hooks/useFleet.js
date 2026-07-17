// Central state hook: owns the WebSocket connection, all fleet state, and the signal log.

import { useCallback, useEffect, useReducer, useRef } from 'react';

// In dev, connect straight to the Node server (no Vite proxy in the middle —
// avoids noisy EPIPE proxy warnings on page refresh). In production, same host.
const WS_URL = import.meta.env.DEV
  ? `ws://${location.hostname}:4000/ws`
  : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
const LOG_MAX = 80;

const initialState = {
  connected: false,
  datasetId: null,
  center: null,
  span: 0.2,
  companies: [],
  drones: {},
  stats: null,
  simulatorRunning: true,
  log: []
};

function droneMap(list) {
  const map = {};
  list.forEach((d) => (map[d.id] = d));
  return map;
}

function now() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function addLog(state, text, level = 'info') {
  return [{ time: now(), text, level, key: Math.random() }, ...state.log].slice(0, LOG_MAX);
}

function reducer(state, action) {
  switch (action.type) {
    case 'connected':
      return { ...state, connected: true, log: addLog(state, 'Connected to server', 'ok') };
    case 'disconnected':
      return { ...state, connected: false, log: addLog(state, 'Connection lost — retrying', 'alert') };
    case 'log:clear':
      return { ...state, log: [] };
    case 'init':
    case 'dataset:loaded': {
      const p = action.payload;
      return {
        ...state,
        datasetId: p.datasetId,
        center: p.center,
        span: p.span,
        companies: p.companies,
        drones: droneMap(p.drones),
        stats: p.stats,
        simulatorRunning: p.simulatorRunning ?? state.simulatorRunning,
        log: addLog(
          state,
          `${action.type === 'init' ? 'Snapshot loaded' : 'Dataset loaded'}: ${p.datasetId} · ${p.companies.length} companies · ${p.drones.length} drones`,
          'ok'
        )
      };
    }
    case 'drones:update': {
      const drones = { ...state.drones };
      let log = state.log;
      action.payload.drones.forEach((d) => {
        const prev = drones[d.id];
        if (prev && prev.status !== 'returning' && d.status === 'returning') {
          log = [{ time: now(), text: `${d.name} low battery — returning to hub`, level: 'warn', key: Math.random() }, ...log].slice(0, LOG_MAX);
        }
        if (prev && prev.status === 'charging' && d.status === 'active') {
          log = [{ time: now(), text: `${d.name} recharged — airborne`, level: 'ok', key: Math.random() }, ...log].slice(0, LOG_MAX);
        }
        drones[d.id] = d;
      });
      return { ...state, drones, stats: action.payload.stats, log };
    }
    case 'fleet:imported': {
      const drones = { ...state.drones };
      action.payload.drones.forEach((d) => (drones[d.id] = d));
      const company = state.companies.find((c) => c.id === action.payload.companyId);
      return {
        ...state,
        drones,
        stats: action.payload.stats,
        log: addLog(
          state,
          `Fleet imported: ${action.payload.drones.length} drones → ${company?.name || 'Unknown'}`,
          'ok'
        )
      };
    }
    case 'drone:added': {
      const d = action.payload.drone;
      const company = state.companies.find((c) => c.id === d.companyId);
      return {
        ...state,
        drones: { ...state.drones, [d.id]: d },
        stats: action.payload.stats,
        log: addLog(state, `Drone deployed: ${d.name} (${company?.name || 'Unknown'})`, 'ok')
      };
    }
    case 'drone:removed': {
      const drones = { ...state.drones };
      const name = drones[action.payload.droneId]?.name || action.payload.droneId;
      delete drones[action.payload.droneId];
      return {
        ...state,
        drones,
        stats: action.payload.stats,
        log: addLog(state, `Drone removed: ${name}`, 'warn')
      };
    }
    case 'company:added':
      return {
        ...state,
        companies: [...state.companies, action.payload.company],
        stats: action.payload.stats,
        log: addLog(state, `Company registered: ${action.payload.company.name}`, 'ok')
      };
    case 'company:removed': {
      const drones = { ...state.drones };
      action.payload.removedDrones.forEach((id) => delete drones[id]);
      const name =
        state.companies.find((c) => c.id === action.payload.companyId)?.name ||
        action.payload.companyId;
      return {
        ...state,
        companies: state.companies.filter((c) => c.id !== action.payload.companyId),
        drones,
        stats: action.payload.stats,
        log: addLog(state, `Company removed: ${name} (${action.payload.removedDrones.length} drones)`, 'alert')
      };
    }
    case 'simulator:state':
      return {
        ...state,
        simulatorRunning: action.payload.running,
        log: addLog(state, `Simulator ${action.payload.running ? 'resumed — scanning' : 'paused'}`, 'info')
      };
    default:
      return state;
  }
}

export function useFleet() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let closed = false;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => dispatch({ type: 'connected' });
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          dispatch(msg);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        dispatch({ type: 'disconnected' });
        if (!closed) retryRef.current = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((type, payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const toggleSimulator = useCallback(() => send('simulator:toggle'), [send]);
  const clearLog = useCallback(() => dispatch({ type: 'log:clear' }), []);

  return { ...state, droneList: Object.values(state.drones), send, toggleSimulator, clearLog };
}
