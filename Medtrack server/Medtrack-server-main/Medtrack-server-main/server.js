const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");

function getLanIp() {
  const nets = os.networkInterfaces();
  const all = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        all.push({ name, address: net.address });
      }
    }
  }
  if (all.length === 0) return "localhost";
  // Prefer Wi-Fi adapter, fall back to first
  const wifi = all.find(a => /wi.fi|wlan|wireless/i.test(a.name));
  const chosen = wifi || all[0];
  if (all.length > 1) {
    console.log(`\n⚠️  Multiple network adapters found — using "${chosen.name}" (${chosen.address})`);
    all.forEach(a => console.log(`   ${a.name === chosen.name ? "✔" : "  "} ${a.name}: ${a.address}`));
  }
  return chosen.address;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// ─── JSON File Database ───────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, "medtrack-db.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = { assets: {}, history: [], gw_registry: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (!data.gw_registry) data.gw_registry = {};
  return data;
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let db = loadDB();
console.log(`✅ Database ready (medtrack-db.json) — ${Object.keys(db.assets).length} assets loaded`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function getAllAssets() {
  return Object.values(db.assets).sort((a, b) =>
    new Date(b.last_seen) - new Date(a.last_seen)
  );
}

// ─── Stability tuning ─────────────────────────────────────────────────────────
// EWMA_ALPHA   : smoothing factor. 0.2 = slow/stable, 0.5 = fast/responsive.
// HYSTERESIS_DB: challenger must beat current room by this many dBm to switch.
// MIN_DETECTIONS: gateway must see the tag this many times before it can "win".
// STALE_MS     : drop a gateway reading after this long with no update.
// MIN_RSSI     : ignore any reading weaker than this — prevents a distant base
//               station from claiming a tag it barely catches.
const EWMA_ALPHA     = 0.25;
const HYSTERESIS_DB  = 8;
const MIN_DETECTIONS = 3;
const STALE_MS       = 30000;
const MIN_RSSI       = -85;   // dBm — readings weaker than this are discarded

// ─── POST /api/tag — Base station sends tag detection ─────────────────────────
// Body: { tag_id, gateway_id, rssi, battery, flags }
app.post("/api/tag", (req, res) => {
  const { tag_id, gateway_id, rssi, battery, flags, floor } = req.body;
  if (!tag_id) return res.status(400).json({ error: "tag_id is required" });

  // Register / update this gateway's known floor
  if (gateway_id && floor) {
    db.gw_registry[gateway_id] = { floor };
  }

  const now = new Date().toISOString();
  const nowMs = Date.now();
  const existing = db.assets[tag_id] || {};

  // ── RSSI map: smoothed per-gateway readings ──────────────────────────────────
  // Each entry: { smoothed, raw, ts, count }
  //   smoothed  — EWMA-filtered RSSI (used for room decisions)
  //   raw       — latest raw reading (shown in UI for debugging)
  //   ts        — last update time (for staleness pruning)
  //   count     — total detections from this gateway (for MIN_DETECTIONS guard)
  const rssi_map = { ...(existing.rssi_map || {}) };

  if (gateway_id && rssi != null) {
    if (rssi < MIN_RSSI) {
      // Signal too weak — discard entirely, don't update this gateway's entry
      console.log(`[SKIP] ${tag_id} | GW: ${gateway_id} | RSSI ${rssi} dBm below threshold (${MIN_RSSI})`);
    } else {
      const prev = rssi_map[gateway_id];
      const smoothed = prev
        ? EWMA_ALPHA * rssi + (1 - EWMA_ALPHA) * prev.smoothed
        : rssi;  // seed with first raw reading
      rssi_map[gateway_id] = {
        smoothed: Math.round(smoothed * 10) / 10,
        raw:      rssi,
        ts:       nowMs,
        count:    (prev?.count ?? 0) + 1,
      };
    }
  }

  // Prune stale gateways
  for (const gw of Object.keys(rssi_map)) {
    if (nowMs - rssi_map[gw].ts > STALE_MS) delete rssi_map[gw];
  }

  // ── Best gateway selection ───────────────────────────────────────────────────
  // Rules (applied in order):
  //   1. A gateway must have MIN_DETECTIONS readings to be eligible.
  //   2. If the current best is still fresh and eligible, a challenger must
  //      beat it by HYSTERESIS_DB dBm (smoothed) to trigger a room switch.
  //   3. If current best has gone stale/ineligible, pick the eligible gateway
  //      with the highest smoothed RSSI outright.
  const eligible = Object.entries(rssi_map)
    .filter(([, v]) => v.count >= MIN_DETECTIONS)
    .sort((a, b) => b[1].smoothed - a[1].smoothed);

  let best_gateway = existing.best_gateway || null;

  if (eligible.length > 0) {
    const [topGw, topVal] = eligible[0];
    const currentStillEligible = best_gateway && rssi_map[best_gateway]?.count >= MIN_DETECTIONS;

    if (!currentStillEligible) {
      // Current best dropped out — switch immediately to top eligible
      best_gateway = topGw;
    } else if (topGw !== best_gateway) {
      const currentSmoothed = rssi_map[best_gateway].smoothed;
      // Only switch if challenger clears the hysteresis margin
      if (topVal.smoothed - currentSmoothed >= HYSTERESIS_DB) {
        best_gateway = topGw;
      }
      // else: keep current room despite slightly worse signal
    }
    // else: top is already the current best, no change needed
  }

  // Derive live location from best_gateway's registered floor
  const gwInfo = best_gateway ? (db.gw_registry[best_gateway] || {}) : {};
  const current_floor = gwInfo.floor || null;
  const current_room  = best_gateway || null;   // gateway_id IS the room label

  // Upsert — preserve manually set metadata (name, type, dept, status)
  // current_floor / current_room always reflect live gateway position
  db.assets[tag_id] = {
    ...existing,
    tag_id,
    battery:       battery      ?? existing.battery      ?? null,
    gateway_id:    gateway_id   ?? existing.gateway_id   ?? null,
    rssi:          rssi         ?? existing.rssi         ?? null,
    flags:         flags        ?? existing.flags        ?? null,
    rssi_map,
    best_gateway,
    current_floor,
    current_room,
    last_seen:     now,
    received_at:   nowMs,
  };

  // History log
  db.history.push({ tag_id, gateway_id, rssi, battery, flags, timestamp: now });
  if (db.history.length > 2000) db.history = db.history.slice(-2000);

  saveDB(db);

  const entry = db.assets[tag_id];

  const allRssi = Object.entries(rssi_map)
    .map(([gw, v]) => `${gw}:${v.smoothed}(${v.raw})x${v.count}`)
    .join("  ");
  console.log(`[TAG] ${tag_id} | GW: ${gateway_id} | Raw: ${rssi} | Best: ${best_gateway} | [${allRssi}]`);

  broadcast({ type: "tag_update", data: entry });
  res.json({ ok: true, entry });
});

// ─── GET /api/assets ──────────────────────────────────────────────────────────
app.get("/api/assets", (req, res) => {
  res.json(getAllAssets());
});

// ─── PUT /api/assets/:tag_id — update metadata from dashboard ─────────────────
app.put("/api/assets/:tag_id", (req, res) => {
  const { tag_id } = req.params;
  if (!db.assets[tag_id]) return res.status(404).json({ error: "Asset not found" });

  const { device_name, device_type, department, floor, room, status, in_use_since } = req.body;

  db.assets[tag_id] = {
    ...db.assets[tag_id],
    ...(device_name  !== undefined && { device_name }),
    ...(device_type  !== undefined && { device_type }),
    ...(department   !== undefined && { department }),
    ...(floor        !== undefined && { floor }),
    ...(room         !== undefined && { room }),
    ...(status       !== undefined && { status }),
    ...(in_use_since !== undefined && { in_use_since }),
  };

  saveDB(db);

  const updated = db.assets[tag_id];
  broadcast({ type: "tag_update", data: updated });
  res.json({ ok: true, entry: updated });
});

// ─── GET /api/assets/:tag_id/history ─────────────────────────────────────────
app.get("/api/assets/:tag_id/history", (req, res) => {
  const history = db.history
    .filter(h => h.tag_id === req.params.tag_id)
    .slice(-50)
    .reverse();
  res.json(history);
});

// ─── DELETE /api/assets/:tag_id ───────────────────────────────────────────────
app.delete("/api/assets/:tag_id", (req, res) => {
  const { tag_id } = req.params;
  delete db.assets[tag_id];
  db.history = db.history.filter(h => h.tag_id !== tag_id);
  saveDB(db);
  broadcast({ type: "tag_deleted", tag_id });
  res.json({ ok: true });
});

// ─── GET /api/health ──────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", assets: Object.keys(db.assets).length });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  console.log("[WS] Browser connected");
  ws.send(JSON.stringify({ type: "init", data: getAllAssets() }));
  ws.on("close", () => console.log("[WS] Browser disconnected"));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = 3001;
server.listen(PORT, "0.0.0.0", () => {
  const lanIp = getLanIp();
  console.log(`\n🏥 MedTags Server running`);
  console.log(`   Local → http://localhost:${PORT}`);
  console.log(`   LAN   → http://${lanIp}:${PORT}  ← use this IP in ESP32`);
  console.log(`   WS    → ws://localhost:${PORT}`);
  console.log(`   POST tags → http://${lanIp}:${PORT}/api/tag\n`);
  console.log(`   Expected payload: { tag_id, gateway_id, rssi, battery, flags }\n`);
});
