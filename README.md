# MedTags — Real-Time Hospital Asset Tracker

A full-stack system for tracking medical equipment across hospital floors using BLE (Bluetooth Low Energy) tags, ESP32 base stations, a Node.js backend, and a React dashboard.

---

## Overview

Hospital staff often waste significant time searching for equipment like infusion pumps, wheelchairs, and monitoring devices. MedTags solves this by attaching small BLE tags to equipment. Strategically placed ESP32 base stations pick up tag broadcasts, report signal strength to a central server, and the server determines each asset's room in real time. Staff can see every asset's location, battery level, and availability on a live dashboard.

---

## Features

- **Real-time location tracking** — room-level accuracy via RSSI-based detection with EWMA smoothing and hysteresis
- **Live floor map** — visual overlay of asset positions per floor
- **Battery monitoring** — alerts when a tag battery drops below 20%
- **Missing equipment alerts** — flags assets not seen for an extended period
- **Role-based dashboard**
  - *Biomedical Engineers* — full asset inventory, edit metadata, view statistics
  - *Clinical Staff* — search availability, find nearest device, mark in use / available
- **WebSocket push updates** — no polling; UI updates instantly when a tag is detected
- **REST API** — base stations and external tools interact via a simple JSON API

---

## System Architecture

```
[nRF52840 BLE Tags]
        |  BLE advertisements (50 ms interval)
        v
[ESP32 Base Stations]  -- POST /api/tag -->  [Node.js / Express Server :3001]
                                                      |
                                              JSON file database
                                              (medtrack-db.json)
                                                      |
                                           WebSocket broadcast
                                                      |
                                        [React Frontend :5173]
                                    (Biomedical / Clinical views)
```

---

## Repository Structure

```
Medtrack-main/
├── Medtrack-main/                        # React frontend (Vite)
│   ├── src/
│   │   └── main.jsx                      # App entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── Medtrack server/
│   └── Medtrack-server-main/
│       └── Medtrack-server-main/
│           ├── server.js                 # Express + WebSocket server
│           ├── hospital-asset-tracker.jsx  # Main React component
│           ├── medtrack-db.json          # JSON database
│           └── package.json
│
├── Final_BaseStation/
│   └── Final_BaseStation.ino             # ESP32 firmware (BLE scanner + WiFi uploader)
│
└── Final_Tracker/
    └── Final_Tracker.ino                 # nRF52840 firmware (BLE tag + battery monitor)
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Arduino IDE | 2.x (for firmware) |
| ESP32 Arduino core | latest |
| Adafruit nRF52 Arduino core | latest |

---

## Getting Started

### 1. Backend

```bash
cd "Medtrack server/Medtrack-server-main/Medtrack-server-main"
npm install
npm start          # production
# or
npm run dev        # development (nodemon auto-reload)
```

Server starts on **http://localhost:3001** (REST) and **ws://localhost:3001** (WebSocket).

### 2. Frontend

```bash
cd Medtrack-main
npm install
npm run dev        # dev server with hot reload → http://localhost:5173
npm run build      # production build
npm run preview    # preview production build
```

The Vite dev server is bound to `0.0.0.0`, so it is reachable from any device on the same LAN.

### 3. Demo Login

| Role | Username | Password |
|------|----------|----------|
| Biomedical Engineer | `biomed` | `biomed123` |
| Clinical Staff | `nurse` | `nurse123` |

---

## Hardware Setup

### BLE Tag (nRF52840 — `Final_Tracker.ino`)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TAG_ID` | `0xA1B2` | Unique 2-byte tag identifier |
| `COMPANY_ID` | `0x1234` | Manufacturer data filter |
| `ADV_INTERVAL_MS` | `50` | BLE advertising interval (ms) |
| `ADV_BURST_SEC` | `20` | Broadcast window duration (s) |
| `SLEEP_SEC` | `5` | Sleep between bursts (s) |

Battery voltage is read from the internal ADC and mapped to a percentage using a LiPo discharge curve (3.2 V – 4.2 V). The percentage is encoded in the BLE manufacturer data payload.

Flash `Final_Tracker.ino` to each nRF52840 tag via Arduino IDE with the Adafruit nRF52 core installed. Set a unique `TAG_ID` per tag before flashing.

### Base Station (ESP32 — `Final_BaseStation.ino`)

Each ESP32 continuously scans for BLE advertisements matching `COMPANY_ID` and POSTs detection data (tag ID, RSSI, battery, flags) to the server over WiFi.

Before flashing, edit these values in the sketch:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "http://<SERVER_IP>:3001/api/tag";
const String GATEWAY_ID   = "Room1";   // unique per station
const String FLOOR        = "1F";      // floor this station covers
```

Deploy one base station per room or coverage zone. Assign a distinct `GATEWAY_ID` and matching `FLOOR` to each unit.

---

## API Reference

### `POST /api/tag`
Base station submits a tag detection.
```json
{
  "tag_id": "A1B2",
  "gateway_id": "Room2",
  "rssi": -62,
  "battery": 85,
  "flags": 0
}
```

### `GET /api/assets`
Returns all tracked assets.

### `PUT /api/assets/:tag_id`
Update asset metadata (name, type, department, floor, room, status).

### `GET /api/assets/:tag_id/history`
Returns location history for a single asset.

### `DELETE /api/assets/:tag_id`
Remove an asset from tracking.

### `GET /api/health`
Server health check.

### WebSocket events

| Event | Direction | Payload |
|-------|-----------|---------|
| `init` | Server → Client | Full asset list on connection |
| `tag_update` | Server → Client | Updated asset object |
| `tag_deleted` | Server → Client | `{ tag_id }` |

---

## Location Algorithm

The server uses an RSSI-based room detection algorithm with the following tunable parameters in `server.js`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `EWMA_ALPHA` | `0.25` | Smoothing factor (higher = faster response) |
| `HYSTERESIS_DB` | `8` | dBm margin required to switch rooms |
| `MIN_DETECTIONS` | `3` | Minimum readings before a gateway is eligible |
| `STALE_MS` | `30000` | Gateway reading expiry (ms) |
| `MIN_RSSI` | `-85` | Minimum accepted signal strength (dBm) |

The asset is assigned to the gateway with the highest smoothed RSSI, provided it beats the current winner by `HYSTERESIS_DB` dBm. This prevents flickering when a tag sits near a room boundary.

---

## Database

Asset state is persisted to `medtrack-db.json` — a plain JSON file. No external database is required. The file is read on startup and written on every mutation.

```json
{
  "assets": {
    "A1B2": {
      "tag_id": "A1B2",
      "device_name": "Infusion Pump #1",
      "device_type": "Infusion Pump",
      "status": "Available",
      "battery": 85,
      "current_floor": "2F",
      "current_room": "Room2",
      "department": "ICU",
      "last_seen": "2025-02-15T10:30:00Z"
    }
  },
  "history": [],
  "gw_registry": {
    "Room1": { "floor": "1F" },
    "Room2": { "floor": "2F" }
  }
}
```

---

## License

This project was developed as a capstone project. See individual source files for authorship details.

