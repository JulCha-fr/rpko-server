// Serveur relais de Rock, Paper, KO!
// - Un joueur crée un salon : il reçoit un code de 4 lettres.
// - L'autre rejoint avec ce code : les deux reçoivent la même graine (hasard partagé) et leur numéro.
// - Ensuite le serveur ne fait que transmettre les messages de l'un à l'autre.
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans I ni O (confusion avec 1 et 0)
const rooms = new Map(); // code -> { players: [ws, ws|null], created: ms }

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`Rock, Paper, KO! relais en ligne. Salons : ${rooms.size}\n`);
});
const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function newCode() {
  for (;;) {
    let c = "";
    for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}

function leave(ws) {
  const code = ws.room;
  if (!code || !rooms.has(code)) return;
  const room = rooms.get(code);
  for (const p of room.players) if (p && p !== ws) { send(p, { t: "left" }); p.room = null; }
  rooms.delete(code);
  ws.room = null;
}

wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => (ws.alive = true));
  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === "create") {
      leave(ws);
      const code = newCode();
      rooms.set(code, { players: [ws, null], created: Date.now() });
      ws.room = code;
      send(ws, { t: "created", code });
    } else if (m.t === "join") {
      const code = String(m.code || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.players[1]) { send(ws, { t: "error", why: room ? "full" : "unknown" }); return; }
      leave(ws);
      room.players[1] = ws;
      ws.room = code;
      const seed = Math.floor(Math.random() * 2147483647);
      send(room.players[0], { t: "start", you: 0, seed, code });
      send(room.players[1], { t: "start", you: 1, seed, code });
    } else if (m.t === "msg") {
      const room = rooms.get(ws.room);
      if (!room) return;
      for (const p of room.players) if (p && p !== ws) send(p, { t: "msg", data: m.data });
    } else if (m.t === "leave") {
      leave(ws);
    } else if (m.t === "ping") {
      send(ws, { t: "pong" });
    }
  });
  ws.on("close", () => leave(ws));
});

// Garde les connexions en vie et nettoie les joueurs disparus et les vieux salons vides.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { leave(ws); ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) if (!room.players[1] && now - room.created > 30 * 60 * 1000) rooms.delete(code);
}, 25000);

server.listen(PORT, () => console.log(`Relais Rock, Paper, KO! sur le port ${PORT}`));
