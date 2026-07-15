// Drone Fleet Tracking — backend entry point.
// Express REST API + WebSocket live updates + auto-simulator.

import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { buildRouter } from './routes.js';
import { initSimulator, snapshot, setRunning, isRunning, loadDataset } from './simulator.js';

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Broadcast a message to every connected client.
function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

wss.on('connection', (ws) => {
  // Server -> Client: full state on connect
  ws.send(JSON.stringify({ type: 'init', payload: snapshot() }));

  // Client -> Server events
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case 'simulator:pause':
        setRunning(false);
        break;
      case 'simulator:resume':
        setRunning(true);
        break;
      case 'simulator:toggle':
        setRunning(!isRunning());
        break;
      case 'dataset:load':
        if (msg.payload?.datasetId) loadDataset(msg.payload.datasetId);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', payload: { time: Date.now() } }));
        break;
    }
  });
});

app.use('/api', buildRouter(broadcast));

app.get('/', (req, res) => {
  res.json({ name: 'Drone Fleet Tracking API', status: 'ok', ws: '/ws' });
});

initSimulator(broadcast);

server.listen(PORT, () => {
  console.log(`✅ Drone Fleet server running at http://localhost:${PORT}`);
  console.log(`   WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
