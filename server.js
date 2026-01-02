import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer();
const wss = new WebSocketServer({ server });

const rooms = new Map();

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, new Map());
  return rooms.get(name);
}

function clamp(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

function broadcast(room, data) {
  const msg = JSON.stringify(data);
  for (const c of wss.clients) {
    if (c.readyState === 1 && c.room === room) c.send(msg);
  }
}

wss.on("connection", (ws) => {
  ws.room = null;
  ws.id = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "join") {
      ws.room = msg.room;
      ws.id = msg.id;

      const r = getRoom(ws.room);
      r.set(ws.id, { x: 0, y: 0, z: 0, ry: 0 });
      return;
    }

    if (!ws.room || !ws.id) return;

    if (msg.type === "move") {
      const p = getRoom(ws.room).get(ws.id);
      if (!p) return;

      p.x = clamp(msg.x, -500, 500);
      p.y = clamp(msg.y, -50, 50);
      p.z = clamp(msg.z, -500, 500);
      p.ry = clamp(msg.ry, -Math.PI * 4, Math.PI * 4);
    }
  });

  ws.on("close", () => {
    if (ws.room && ws.id) {
      getRoom(ws.room).delete(ws.id);
      broadcast(ws.room, { type: "left", id: ws.id });
    }
  });
});

setInterval(() => {
  for (const [room, players] of rooms.entries()) {
    broadcast(room, { type: "state", players: Object.fromEntries(players) });
  }
}, 100);

// IMPORTANT: Heroku port
server.listen(process.env.PORT || 8080);
