# Drone Fleet Tracker

Real-time drone fleet tracking dashboard. Multiple companies register drone fleets; an auto-simulator moves every drone each second and pushes live position updates to the browser over WebSocket.

**Stack:** React 18 (Vite) · Node.js · Express · ws (WebSocket)

## Quick start

Requires Node.js 18+.

```bash
# Terminal 1 — backend (http://localhost:4000)
cd server
npm install
npm start

# Terminal 2 — frontend (http://localhost:5173)
cd client
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` and `/ws` to the backend, so no CORS or URL config is needed.

## Project structure

```
server/
  src/
    index.js       Express app + WebSocket server + client event handling
    routes.js      REST API endpoints
    simulator.js   Auto-simulator (spawning, movement, battery, status)
    store.js       In-memory data store (companies, drones, stats)
    datasets.js    5 predefined datasets
client/
  src/
    App.jsx                 Root layout + selection state
    api.js                  REST helpers
    hooks/useFleet.js       WebSocket connection + reducer (all fleet state)
    components/
      Header.jsx            Title bar, dataset selector, sim pause/resume
      ConnectionStatus.jsx  Live/reconnecting indicator
      DatasetSelector.jsx   Dataset dropdown
      StatsPanel.jsx        Fleet-wide stat tiles
      CompanyList.jsx       Company panel (+ add form toggle)
      CompanyCard.jsx       One company row (select / delete)
      AddCompanyForm.jsx    Register a company (name, industry, color)
      DroneList.jsx         Drone panel, filtered by selected company
      DroneCard.jsx         One drone row (status, battery, delete)
      AddDroneForm.jsx      Deploy a drone to the selected company
      BatteryBar.jsx        Battery gauge
      MapView.jsx           SVG live map (offline, no tile service)
      DroneDetail.jsx       Telemetry popup for the selected drone
```

## Data models

**Company** — `id, name, industry, color, createdAt`
**Drone** — `id, companyId, name, model, status (active|idle|returning|charging), battery, lat, lng, altitude (m), speed (m/s), heading (°), lastUpdate`

## REST API (base `http://localhost:4000/api`)

| # | Method | Path | Description |
|---|--------|------|-------------|
| 1 | GET | `/datasets` | List the 5 datasets + which is active |
| 2 | POST | `/datasets/:id/load` | Switch dataset (resets fleet, broadcast to all clients) |
| 3 | GET | `/companies` | All companies with drone counts |
| 4 | POST | `/companies` | Register a company `{name, industry, color}` |
| 5 | DELETE | `/companies/:id` | Remove a company and all its drones |
| 6 | GET | `/companies/:id/drones` | Drones belonging to one company |
| 7 | POST | `/companies/:id/drones` | Deploy a drone `{name?, model?}` |
| + | GET | `/drones` | Full fleet |
| + | DELETE | `/drones/:id` | Remove a drone |
| + | GET | `/snapshot` | Full state (used on page load) |

## WebSocket events (`ws://localhost:4000/ws`)

**Server → Client**

| Event | Payload |
|-------|---------|
| `init` | Full snapshot on connect (dataset, companies, drones, stats) |
| `drones:update` | Updated drones + stats, every 1s tick |
| `drone:added` / `drone:removed` | Single drone change + stats |
| `company:added` / `company:removed` | Company change (+ removed drone ids) + stats |
| `dataset:loaded` | Full snapshot after a dataset switch |
| `simulator:state` | `{running}` after pause/resume |
| `pong` | Reply to `ping` |

**Client → Server**

| Event | Effect |
|-------|--------|
| `simulator:pause` / `simulator:resume` / `simulator:toggle` | Control the simulator |
| `dataset:load` `{datasetId}` | Switch dataset |
| `ping` | Health check |

## Auto-simulator

On startup (and on every dataset switch) the simulator spawns each dataset's companies and drone fleets, then ticks every second: active drones wander with random heading drift and drain battery; below 20% they head back to the hub (`returning`), land and `charge`, then relaunch at 95%. Drones occasionally go `idle`. Movement is time-compressed ~20x so it's clearly visible on the map. All updates broadcast to every connected client.

## Datasets (5)

San Francisco — Delivery Ops · New York — Emergency Response · London — Security Patrol · Tokyo — Warehouse Logistics · Mumbai — Agri & Land Survey. Each has its own map center, bounds, and 3 companies (12–17 drones total).

## Using the dashboard

Pick a dataset in the header. Click a company to filter the map and drone list to its fleet (click again to clear); with a company selected, "+ Add" deploys a new drone to it. Click any drone (map marker or list card) for its telemetry popup. Pause/resume the simulator from the header. The green "Live" pill shows WebSocket health; the client auto-reconnects every 2s if the server drops.

## Production build / deployment

```bash
cd client && npm run build   # outputs client/dist
```

Serve `client/dist` behind any static host and reverse-proxy `/api` and `/ws` to the Node server (set `PORT` env var to change the server port from 4000). Data is in-memory by design — restarting the server resets to the default dataset.
