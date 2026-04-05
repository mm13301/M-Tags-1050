Here's the combined, polished overview:

---

# 🏥 MedTags — Real-Time Hospital Asset Tracker

MedTags is a full-stack hospital equipment tracking system designed to help healthcare staff monitor, manage, and locate medical assets in real time. Built with BLE tags, ESP32 base stations, a Node.js backend, and a React dashboard, MedTags improves efficiency, reduces equipment loss, and supports better patient care by making critical hospital equipment easier to find when it matters most.

---

## 📖 Overview

Hospitals rely on a large number of mobile assets — IV pumps, wheelchairs, monitors, beds, and other medical devices — that are constantly moved between rooms, departments, and storage areas, making them difficult to locate when needed.

MedTags solves this by attaching small BLE tags to equipment. Strategically placed ESP32 base stations pick up tag broadcasts, report signal strength to a central server, and the server determines each asset's room in real time. Staff can see every asset's location, battery level, and availability on a live dashboard — no more searching.

MedTags helps hospitals:
- View equipment status and location in real time
- Manage all devices through a single unified dashboard
- Reduce time wasted searching for misplaced equipment
- Improve workflow, asset utilization, and staff responsiveness

---

## 🚀 Features

- **Real-time location tracking** — room-level accuracy via RSSI-based detection with EWMA smoothing and hysteresis to prevent flickering near room boundaries
- **Live floor map** — visual overlay of asset positions per floor
- **Battery monitoring** — alerts when a tag battery drops below 20%
- **Missing equipment alerts** — flags assets not seen for an extended period
- **Role-based dashboard**
  - *Biomedical Engineers* — full asset inventory, edit metadata, view statistics
  - *Clinical Staff* — search availability, find nearest device, mark in use / available
- **WebSocket push updates** — no polling; UI updates instantly when a tag is detected
- **REST API** — base stations and external tools interact via a simple JSON API

---

## 🏗️ System Architecture

MedTags uses a distributed architecture combining embedded hardware and a web-based system:

```
[nRF52840 BLE Tags]
        |  BLE advertisements (50 ms interval)
        v
[ESP32 Base Stations]  -->  POST /api/tag  -->  [Node.js / Express Server :3001]
                                                          |
                                                  JSON file database
                                                  (medtrack-db.json)
                                                          |
                                               WebSocket broadcast
                                                          |
                                            [React Frontend :5173]
                                        (Biomedical / Clinical views)
```

### 🔹 BLE Tracker (nRF52840)
Broadcasts BLE advertisement packets at configurable intervals with a payload containing tag ID, battery level, and status flags. Optimized for low power using sleep cycles and designed to run on coin cell batteries (CR2450).

### 🔹 ESP32 Base Stations
Continuously scan for BLE advertisements using NimBLE, filter by manufacturer ID, extract payload data, measure RSSI, and POST JSON detection data to the backend over WiFi.

### 🔹 Backend Server (Node.js + Express)
Processes incoming tag data via a REST API, applies RSSI filtering, moving average smoothing, and hysteresis-based gateway selection to determine the closest room and floor. Persists state to a lightweight JSON database and broadcasts live updates via WebSockets.

### 🔹 Web Dashboard
Displays real-time asset data over a persistent WebSocket connection, showing location (room/floor), signal strength (RSSI), battery level, and last-seen timestamp. Role-based views serve both biomedical engineers and clinical staff.

---

## ⚙️ How It Works

1. BLE trackers continuously broadcast signals
2. ESP32 base stations detect nearby trackers and measure signal strength
3. Base stations POST detection data to the backend server
4. Server processes RSSI, applies smoothing and hysteresis, and determines room location
5. Dashboard updates in real time via WebSocket

---

## 🧪 Technologies Used

| Layer | Technology |
|-------|------------|
| Frontend | React (Vite), WebSockets |
| Backend | Node.js, Express |
| Real-time | WebSockets |
| Hardware | ESP32, nRF52840 (BLE) |
| Networking | HTTP REST API |
| Data Storage | JSON file database |

---

## 🔬 Technical Details

**BLE Communication** — Uses advertisement packets (no pairing required) for low latency and power efficiency.

**RSSI-Based Positioning** — Location is estimated by comparing signal strength across multiple base stations. Key tunable parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `EWMA_ALPHA` | `0.25` | Smoothing factor (higher = faster response) |
| `HYSTERESIS_DB` | `8` | dBm margin required to switch rooms |
| `MIN_DETECTIONS` | `3` | Minimum readings before a gateway is eligible |
| `STALE_MS` | `30000` | Gateway reading expiry (ms) |
| `MIN_RSSI` | `-85` | Minimum accepted signal strength (dBm) |

**Power Optimization** — Sleep cycles on BLE trackers with low transmission intervals for long-term battery operation.

**Scalability** — Multiple base stations per floor; supports multi-room and multi-floor deployments.

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Arduino IDE | 2.x |
| ESP32 Arduino core | latest |
| Adafruit nRF52 Arduino core | latest |

### Backend
```bash
cd "Medtrack server/Medtrack-server-main/Medtrack-server-main"
npm install
npm start        # production
npm run dev      # development (nodemon auto-reload)
```
Server starts on **http://localhost:3001** (REST) and **ws://localhost:3001** (WebSocket).

### Frontend
```bash
cd Medtrack-main
npm install
npm run dev      # → http://localhost:5173
npm run build    # production build
```

### Demo Login

| Role | Username | Password |
|------|----------|----------|
| Biomedical Engineer | `biomed` | `biomed123` |
| Clinical Staff | `nurse` | `nurse123` |

---

## 🔧 Hardware Setup

### BLE Tag (nRF52840)
Flash `Final_Tracker.ino` via Arduino IDE with the Adafruit nRF52 core. Set a unique `TAG_ID` per tag before flashing.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TAG_ID` | `0xA1B2` | Unique 2-byte tag identifier |
| `ADV_INTERVAL_MS` | `50` | BLE advertising interval (ms) |
| `ADV_BURST_SEC` | `20` | Broadcast window duration (s) |
| `SLEEP_SEC` | `5` | Sleep between bursts (s) |

### Base Station (ESP32)
Edit these values in `Final_BaseStation.ino` before flashing. Deploy one unit per room or coverage zone.

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "http://<SERVER_IP>:3001/api/tag";
const String GATEWAY_ID   = "Room1";   // unique per station
const String FLOOR        = "1F";
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tag` | Base station submits a tag detection |
| `GET` | `/api/assets` | Returns all tracked assets |
| `PUT` | `/api/assets/:tag_id` | Update asset metadata |
| `GET` | `/api/assets/:tag_id/history` | Location history for an asset |
| `DELETE` | `/api/assets/:tag_id` | Remove an asset |
| `GET` | `/api/health` | Server health check |

**WebSocket Events**

| Event | Direction | Payload |
|-------|-----------|---------|
| `init` | Server → Client | Full asset list on connection |
| `tag_update` | Server → Client | Updated asset object |
| `tag_deleted` | Server → Client | `{ tag_id }` |

---

## 🎯 Use Cases

MedTags can track any mobile hospital asset, including:
- Wheelchairs and stretchers
- IV / infusion pumps
- Heart monitors and portable diagnostic devices
- Beds and other movable equipment

---

## 🔮 Future Improvements

- Interactive hospital floor map with live location overlay
- Notification system for missing or inactive equipment
- Search and filter tools for faster asset lookup
- Full database integration for equipment history and logs
- Enhanced hospital-themed UI/UX

---

## 👨‍💻 Team
Thatcher Usciski
Matthew Lovisa
Gurveer Singh
Antonio Montesano
Samihan Karpe
