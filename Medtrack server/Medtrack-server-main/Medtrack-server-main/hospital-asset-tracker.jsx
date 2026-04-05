import { useState, useEffect } from "react";

const SERVER_HOST = window.location.hostname;
const SERVER_URL  = `http://${SERVER_HOST}:3001`;
const WS_URL      = `ws://${SERVER_HOST}:3001`;

// ─── Mock Data ────────────────────────────────────────────────────────────────
const ASSET_TYPES = ["Infusion Pump","Syringe Pump","Vital Sign Monitor","Wheelchair","Stretcher","Bed","Ultrasound Machine","ECG Machine"];
const FLOORS = ["1F – Emergency","2F – ICU","3F – Surgery","4F – Cardiology","5F – Oncology","6F – Maternity"];
const DEPARTMENTS = ["Emergency","ICU","Surgery","Cardiology","Oncology","Maternity","Radiology","General Ward"];
const STATUSES = ["Available","In Use","Unknown"];

const ICONS = {
  "Infusion Pump": "💉",
  "Syringe Pump": "🩸",
  "Vital Sign Monitor": "📈",
  "Wheelchair": "♿",
  "Stretcher": "🛏",
  "Bed": "🛌",
  "Ultrasound Machine": "🔊",
  "ECG Machine": "❤️",
};

function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function generateAssets(n = 1) {
  return Array.from({ length: n }, (_, i) => {
    const type = rnd(ASSET_TYPES);
    const status = rnd(STATUSES);
    const floor = rnd(FLOORS);
    const dept = rnd(DEPARTMENTS);
    const battery = rndInt(5, 100);
    const moving = Math.random() > 0.7;
    const minsAgo = rndInt(0, 120);
    const lastSeen = new Date(Date.now() - minsAgo * 60000);

    const historyPoints = Array.from({ length: 10 }, (_, j) => ({
      location: `${rnd(FLOORS)} – Room ${rndInt(101, 420)}`,
      timestamp: new Date(Date.now() - (j + 1) * rndInt(15, 90) * 60000),
      duration: `${rndInt(5, 180)} min`,
    }));

    return {
      id: `MED-${String(i + 1).padStart(4, "0")}`,
      type,
      status,
      floor,
      department: dept,
      room: `Room ${rndInt(101, 420)}`,
      battery,
      moving,
      lastSeen,
      minsAgo,
      history: historyPoints,
      alert: battery < 20 || minsAgo > 90,
      alertMsg: battery < 20 ? "Low battery" : minsAgo > 90 ? "Not detected >90 min" : null,
    };
  });
}

const ASSETS = generateAssets(1);

// ─── Utility ─────────────────────────────────────────────────────────────────
function timeAgo(date) {
  const diff = Math.round((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

function BatteryBar({ pct }) {
  const color = pct < 20 ? "#dc2626" : pct < 50 ? "#d97706" : "#16a34a";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:40, height:10, background:"#e2e8f0", borderRadius:3, overflow:"hidden", border:"1px solid #cbd5e1" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, transition:"width .3s" }} />
      </div>
      <span style={{ fontSize:11, color, fontWeight:600 }}>{pct}%</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    "Available": { bg:"#f0fdf4", color:"#15803d", border:"#86efac" },
    "In Use":    { bg:"#eff6ff", color:"#1d4ed8", border:"#93c5fd" },
    "Unknown":   { bg:"#f8fafc", color:"#64748b", border:"#e2e8f0" },
  };
  const s = styles[status] || styles["Unknown"];
  return (
    <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.05em", padding:"2px 8px", borderRadius:20,
      background:s.bg, color:s.color, border:`1px solid ${s.border}`, textTransform:"uppercase" }}>
      {status}
    </span>
  );
}

// ─── Modal field (must live outside AssetModal so React never remounts it) ────
const modalInputStyle = {
  width:"100%", background:"#ffffff", border:"1px solid #dbeafe", color:"#0f172a",
  borderRadius:8, padding:"8px 12px", fontSize:13, outline:"none", boxSizing:"border-box"
};

function Field({ label, field, opts, form, setForm }) {
  return (
    <div>
      <div style={{ color:"#64748b", fontSize:11, fontWeight:600, marginBottom:4 }}>{label}</div>
      {opts ? (
        <select value={form[field]} onChange={e => setForm(f => ({...f, [field]: e.target.value}))}
          style={{...modalInputStyle, cursor:"pointer"}}>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input value={form[field]} onChange={e => setForm(f => ({...f, [field]: e.target.value}))}
          style={modalInputStyle} />
      )}
    </div>
  );
}

// ─── Asset Detail Modal ───────────────────────────────────────────────────────
function AssetModal({ asset, onClose, onDelete, onUpdate, isBiomed }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  // Only re-initialize the form when a *different* asset is opened.
  // Watching asset.id (not the full object) prevents WebSocket updates to the
  // same asset from resetting the form mid-edit.
  useEffect(() => {
    if (asset) setForm({
      device_name: asset.device_name || "",
      device_type: asset.type || "",
      department:  asset.department || "",
      floor:       asset.floor || "",
      room:        asset.room || "",
      status:      asset.status || "Unknown",
    });
    setEditing(false);
  }, [asset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!asset) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/assets/${asset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_name: form.device_name,
          device_type: form.device_type,
          department:  form.department,
          floor:       form.floor,
          room:        form.room,
          status:      form.status,
        }),
      });
      const data = await res.json();
      if (data.ok) { onUpdate(data.entry); setEditing(false); }
    } catch(e) { alert("Could not reach server"); }
    setSaving(false);
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", backdropFilter:"blur(4px)",
      zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#ffffff", border:"1px solid #1e40af", borderRadius:16, maxWidth:560, width:"100%",
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 25px 80px rgba(0,0,255,.15)" }}>

        {/* Header */}
        <div style={{ padding:"24px 24px 16px", borderBottom:"1px solid #bfdbfe", position:"sticky", top:0, background:"#ffffff", zIndex:1 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                <span style={{ fontSize:28 }}>{ICONS[asset.type] || "🏷"}</span>
                <div>
                  <div style={{ color:"#0f172a", fontWeight:700, fontSize:18, fontFamily:"'DM Mono', monospace" }}>{asset.id}</div>
                  <div style={{ color:"#64748b", fontSize:13 }}>{asset.device_name || asset.type || "Unassigned"}</div>
                </div>
              </div>
              <StatusBadge status={asset.status} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {isBiomed && (
                <button onClick={() => setEditing(x => !x)} style={{
                  background: editing ? "#1e40af" : "#1e293b", border:`1px solid ${editing ? "#3b82f6" : "#334155"}`,
                  color: editing ? "#93c5fd" : "#94a3b8", borderRadius:8, padding:"6px 12px", fontSize:12, cursor:"pointer" }}>
                  ✏️ {editing ? "Cancel" : "Edit"}
                </button>
              )}
              <button onClick={onClose} style={{ background:"#eff6ff", border:"none", color:"#94a3b8",
                width:32, height:32, borderRadius:8, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        {editing && isBiomed ? (
          <div style={{ padding:"16px 24px" }}>
            <div style={{ color:"#94a3b8", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>
              Edit Asset Details
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              <div style={{ gridColumn:"span 2" }}>
                <Field label="Device Name" field="device_name" form={form} setForm={setForm} />
              </div>
              <Field label="Device Type" field="device_type" opts={["", ...ASSET_TYPES]} form={form} setForm={setForm} />
              <Field label="Status" field="status" opts={STATUSES} form={form} setForm={setForm} />
              <Field label="Floor" field="floor" opts={["", ...FLOORS]} form={form} setForm={setForm} />
              <Field label="Room" field="room" form={form} setForm={setForm} />
              <div style={{ gridColumn:"span 2" }}>
                <Field label="Department" field="department" opts={["", ...DEPARTMENTS]} form={form} setForm={setForm} />
              </div>
            </div>
            <button onClick={handleSave} disabled={saving} style={{
              width:"100%", background:"#2563eb", color:"#fff", border:"none",
              borderRadius:8, padding:"10px", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              {saving ? "Saving..." : "💾 Save Changes"}
            </button>
          </div>
        ) : (
          <>
            {/* Info grid */}
            <div style={{ padding:"16px 24px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {[
                ["📡 Detected In", asset.current_room || asset.gateway_id || "Not detected"],
                ["🏢 Floor", asset.current_floor || asset.floor || "Unknown"],
                ["📶 RSSI", asset.rssi != null ? `${asset.rssi} dBm` : "—"],
                ["🏷 Flags", asset.flags != null ? `0x${asset.flags.toString(16).toUpperCase().padStart(2,"0")}` : "—"],
                ["🏥 Department", asset.department || "Unassigned"],
                ["⏱ Last Seen", timeAgo(asset.lastSeen)],
                ["📡 Movement", asset.moving ? "🟢 Moving" : "⚫ Stationary"],
              ].map(([label, val]) => (
                <div key={label} style={{ background:"#eff6ff", borderRadius:10, padding:"10px 14px" }}>
                  <div style={{ color:"#64748b", fontSize:11, marginBottom:4, fontWeight:600 }}>{label}</div>
                  <div style={{ color:"#1e293b", fontSize:13, fontWeight:500 }}>{val}</div>
                </div>
              ))}
              <div style={{ background:"#eff6ff", borderRadius:10, padding:"10px 14px", gridColumn:"span 2" }}>
                <div style={{ color:"#64748b", fontSize:11, marginBottom:6, fontWeight:600 }}>🔋 Tag Battery</div>
                <BatteryBar pct={asset.battery} />
              </div>
            </div>

            {/* Alert */}
            {asset.alert && (
              <div style={{ margin:"0 24px 16px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 14px" }}>
                <span style={{ color:"#fca5a5", fontSize:13, fontWeight:600 }}>⚠ {asset.alertMsg}</span>
              </div>
            )}
          </>
        )}

        {/* Delete button */}
        {isBiomed && !editing && (
          <div style={{ padding:"0 24px 24px" }}>
            <button onClick={() => { onDelete(asset.id); onClose(); }} style={{
              width:"100%", background:"#fef2f2", border:"1px solid #fca5a5", color:"#fca5a5",
              borderRadius:8, padding:"10px", fontSize:14, fontWeight:700, cursor:"pointer" }}>
              🗑 Delete Asset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────
function AssetCard({ asset, onClick }) {
  return (
    <div onClick={() => onClick(asset)} style={{
      background:"#ffffff", border:`1px solid ${asset.alert ? "#7f1d1d" : "#1e293b"}`,
      borderRadius:12, padding:"14px 16px", cursor:"pointer", transition:"all .15s",
      position:"relative", overflow:"hidden" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = asset.alert ? "#dc2626" : "#2563eb"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = asset.alert ? "#7f1d1d" : "#1e293b"; e.currentTarget.style.transform = "translateY(0)"; }}>

      {asset.moving && (
        <div style={{ position:"absolute", top:10, right:10, width:8, height:8, borderRadius:"50%", background:"#22c55e",
          boxShadow:"0 0 0 3px rgba(34,197,94,.2)", animation:"pulse 2s infinite" }} />
      )}

      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
        <span style={{ fontSize:22 }}>{ICONS[asset.type]}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
            <span style={{ color:"#0f172a", fontWeight:700, fontSize:13, fontFamily:"'DM Mono', monospace" }}>{asset.id}</span>
            <StatusBadge status={asset.status} />
          </div>
          <div style={{ color:"#64748b", fontSize:12, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{asset.type}</div>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ color: asset.current_floor ? "#93c5fd" : "#475569", fontSize:12 }}>
            📍 {asset.current_floor
              ? `${asset.current_floor} · ${asset.current_room}`
              : (asset.floor !== "Unknown" ? asset.floor.split("–")[0].trim() : "Not yet detected")}
          </span>
          <span style={{ color:"#475569", fontSize:12 }}>⏱ {timeAgo(asset.lastSeen)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ color:"#475569", fontSize:12 }}>
            {asset.current_room || asset.room}
          </span>
          <BatteryBar pct={asset.battery} />
        </div>
      </div>

      {asset.alert && (
        <div style={{ marginTop:8, padding:"4px 8px", background:"#fef2f2", borderRadius:6 }}>
          <span style={{ color:"#fca5a5", fontSize:11, fontWeight:600 }}>⚠ {asset.alertMsg}</span>
        </div>
      )}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ assets }) {
  const avail = assets.filter(a => a.status === "Available").length;
  const inUse = assets.filter(a => a.status === "In Use").length;
  const alerts = assets.filter(a => a.alert).length;
  const moving = assets.filter(a => a.moving).length;

  const stats = [
    { label:"Total", value: assets.length, color:"#94a3b8" },
    { label:"Available", value: avail, color:"#4ade80" },
    { label:"In Use", value: inUse, color:"#60a5fa" },
    { label:"Alerts", value: alerts, color:"#f87171" },
    { label:"Moving", value: moving, color:"#a78bfa" },
  ];

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:8, marginBottom:16 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background:"#ffffff", border:"1px solid #bfdbfe", borderRadius:10,
          padding:"10px 12px", textAlign:"center" }}>
          <div style={{ color:s.color, fontSize:20, fontWeight:800, fontFamily:"'DM Mono', monospace" }}>{s.value}</div>
          <div style={{ color:"#475569", fontSize:11, marginTop:2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Biomedical View ──────────────────────────────────────────────────────────
function BiomédicalView({ onSelectAsset, assets, onDelete }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterFloor, setFilterFloor] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const filtered = assets.filter(a => {
    if (alertsOnly && !a.alert) return false;
    if (filterType !== "All" && a.type !== filterType) return false;
    if (filterFloor !== "All" && !a.floor.includes(filterFloor.split("–")[0].trim())) return false;
    if (filterStatus !== "All" && a.status !== filterStatus) return false;
    if (search && !a.id.toLowerCase().includes(search.toLowerCase()) &&
        !a.type.toLowerCase().includes(search.toLowerCase()) &&
        !a.room.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const Select = ({ val, onChange, opts, placeholder }) => (
    <select value={val} onChange={e => onChange(e.target.value)} style={{
      background:"#eff6ff", border:"1px solid #dbeafe", color:"#1e293b", borderRadius:8,
      padding:"8px 12px", fontSize:13, outline:"none", cursor:"pointer", flex:1 }}>
      <option value="All">{placeholder}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div>
      <StatsBar assets={assets} />

      {/* Filters */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search ID, type, room..."
          style={{ background:"#eff6ff", border:"1px solid #dbeafe", color:"#1e293b", borderRadius:8,
            padding:"8px 12px", fontSize:13, outline:"none", flex:"2 1 180px", minWidth:0 }} />
        <Select val={filterType} onChange={setFilterType} opts={ASSET_TYPES} placeholder="All Types" />
        <Select val={filterFloor} onChange={setFilterFloor} opts={["1F","2F","3F","4F","5F","6F"]} placeholder="All Floors" />
        <Select val={filterStatus} onChange={setFilterStatus} opts={STATUSES} placeholder="All Statuses" />
        <button onClick={() => setAlertsOnly(x => !x)} style={{
          background: alertsOnly ? "#7f1d1d" : "#1e293b", border:`1px solid ${alertsOnly ? "#dc2626" : "#334155"}`,
          color: alertsOnly ? "#fca5a5" : "#94a3b8", borderRadius:8, padding:"8px 14px", fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>
          ⚠ Alerts {alertsOnly ? "ON" : "OFF"}
        </button>
      </div>

      <div style={{ color:"#475569", fontSize:12, marginBottom:12 }}>
        Showing {filtered.length} of {assets.length} assets · Last refresh: just now
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:10 }}>
        {filtered.map(a => (
          <div key={a.id} style={{ position:"relative" }}>
            <AssetCard asset={a} onClick={onSelectAsset} />
            <button onClick={e => { e.stopPropagation(); onDelete(a.id); }} style={{
              position:"absolute", top:8, right:8, background:"#fef2f2", border:"1px solid #fca5a5",
              color:"#fca5a5", borderRadius:6, width:26, height:26, fontSize:13, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", zIndex:2 }}
              title="Delete asset">🗑</button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn:"1/-1", textAlign:"center", color:"#475569", padding:48 }}>
            No assets match your filters
          </div>
        )}
      </div>
    </div>
  );
}

function useElapsed(since) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [since]);
  if (!since) return null;
  const secs = Math.floor((Date.now() - new Date(since)) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2,"0")}s`;
  return `${s}s`;
}

// ─── Nurse Asset Card (with status toggle) ────────────────────────────────────
function NurseAssetCard({ asset, onClick, onStatusChange }) {
  const [busy, setBusy] = useState(false);
  const elapsed = useElapsed(asset.status === "In Use" ? asset.in_use_since : null);

  async function toggle(e) {
    e.stopPropagation();
    const next = asset.status === "In Use" ? "Available" : "In Use";
    setBusy(true);
    await onStatusChange(asset.id, next);
    setBusy(false);
  }

  const isInUse = asset.status === "In Use";

  return (
    <div onClick={() => onClick(asset)} style={{
      background:"#ffffff", border:`1px solid ${asset.alert ? "#fca5a5" : "#e2e8f0"}`,
      borderRadius:12, padding:"14px 16px", cursor:"pointer", transition:"all .15s", position:"relative" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#93c5fd"}
      onMouseLeave={e => e.currentTarget.style.borderColor = asset.alert ? "#fca5a5" : "#e2e8f0"}>

      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:10 }}>
        <span style={{ fontSize:22 }}>{ICONS[asset.type]}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
            <span style={{ color:"#0f172a", fontWeight:700, fontSize:13, fontFamily:"'DM Mono', monospace" }}>{asset.id}</span>
            <StatusBadge status={asset.status} />
          </div>
          <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>{asset.device_name || asset.type}</div>
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ color: asset.current_floor ? "#0369a1" : "#94a3b8", fontSize:12 }}>
          📍 {asset.current_floor
            ? `${asset.current_floor} · ${asset.current_room}`
            : (asset.floor && asset.floor !== "Unknown" ? asset.floor.split("–")[0].trim() : "Not yet detected")}
        </div>
        {elapsed && (
          <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:6,
            padding:"2px 7px", fontSize:11, fontWeight:700, color:"#c2410c", fontFamily:"'DM Mono', monospace" }}>
            ⏱ {elapsed}
          </div>
        )}
      </div>

      <button onClick={toggle} disabled={busy} style={{
        width:"100%", background: isInUse ? "#fef2f2" : "#f0fdf4",
        border:`1px solid ${isInUse ? "#fca5a5" : "#86efac"}`,
        color: isInUse ? "#dc2626" : "#16a34a",
        borderRadius:8, padding:"7px 0", fontSize:13, fontWeight:700, cursor:"pointer" }}>
        {busy ? "Updating…" : isInUse ? "✓ Mark Available" : "Mark In Use"}
      </button>
    </div>
  );
}

// ─── Clinical View ────────────────────────────────────────────────────────────
function ClinicalView({ onSelectAsset, assets, onStatusChange }) {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("ICU");
  const [finding, setFinding] = useState(false);
  const [nearestType, setNearestType] = useState("Infusion Pump");
  const [nearestResult, setNearestResult] = useState(null);

  const available = assets.filter(a => a.status === "Available" &&
    (search === "" || a.type.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase()))
  );

  const inUseAssets = assets.filter(a => a.status === "In Use");

  const deptAssets = assets.filter(a => a.department === dept).slice(0, 6);

  function findNearest() {
    setFinding(true);
    setTimeout(() => {
      const matches = assets.filter(a => a.type === nearestType && a.status === "Available");
      setNearestResult(matches[0] || null);
      setFinding(false);
    }, 1200);
  }

  return (
    <div>
      {/* Find Nearest Panel */}
      <div style={{ background:"linear-gradient(135deg, #eff6ff, #dbeafe)", border:"1px solid #93c5fd",
        borderRadius:14, padding:20, marginBottom:20 }}>
        <div style={{ color:"#0369a1", fontSize:13, fontWeight:700, marginBottom:12, letterSpacing:"0.05em", textTransform:"uppercase" }}>
          📡 Find Nearest Available Device
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <select value={nearestType} onChange={e => setNearestType(e.target.value)} style={{
            background:"#eff6ff", border:"1px solid #dbeafe", color:"#1e293b",
            borderRadius:8, padding:"10px 14px", fontSize:14, outline:"none", flex:1, minWidth:160 }}>
            {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <button onClick={findNearest} disabled={finding} style={{
            background: finding ? "#1d4ed8" : "#2563eb", color:"#fff", border:"none", borderRadius:8,
            padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer", transition:"background .2s",
            display:"flex", alignItems:"center", gap:8 }}>
            {finding ? <>⏳ Locating…</> : <>🔍 Find Nearest</>}
          </button>
        </div>

        {nearestResult && (
          <div onClick={() => onSelectAsset(nearestResult)} style={{ marginTop:14, background:"#f0fdf4",
            border:"1px solid #86efac", borderRadius:10, padding:"12px 16px", cursor:"pointer" }}>
            <div style={{ color:"#15803d", fontWeight:700, fontSize:14, marginBottom:4 }}>
              ✅ Found: {nearestResult.id} — {nearestResult.type}
            </div>
            <div style={{ color:"#166534", fontSize:13 }}>
              📍 {nearestResult.current_floor
                ? `${nearestResult.current_floor} · ${nearestResult.current_room}`
                : (nearestResult.floor !== "Unknown" ? nearestResult.floor : "Location unknown")
              } · Last seen {timeAgo(nearestResult.lastSeen)}
            </div>
            <div style={{ color:"#15803d", fontSize:12, marginTop:4, opacity:.7 }}>Tap to see details →</div>
          </div>
        )}
      </div>

      {/* My Department */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ color:"#94a3b8", fontSize:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>
            My Department
          </div>
          <select value={dept} onChange={e => setDept(e.target.value)} style={{
            background:"#eff6ff", border:"1px solid #dbeafe", color:"#1e293b",
            borderRadius:6, padding:"4px 10px", fontSize:12, outline:"none" }}>
            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:8 }}>
          {deptAssets.map(a => <NurseAssetCard key={a.id} asset={a} onClick={onSelectAsset} onStatusChange={onStatusChange} />)}
        </div>
      </div>

      {/* Search Available */}
      <div style={{ marginBottom:20 }}>
        <div style={{ color:"#94a3b8", fontSize:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>
          Search Available Equipment
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search by type or ID..."
          style={{ background:"#eff6ff", border:"1px solid #dbeafe", color:"#1e293b", borderRadius:8,
            padding:"10px 14px", fontSize:14, outline:"none", width:"100%", boxSizing:"border-box", marginBottom:12 }} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:8 }}>
          {available.slice(0, 12).map(a => <NurseAssetCard key={a.id} asset={a} onClick={onSelectAsset} onStatusChange={onStatusChange} />)}
        </div>
      </div>

      {/* Currently In Use */}
      {inUseAssets.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ color:"#94a3b8", fontSize:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:12 }}>
            🔴 Currently In Use ({inUseAssets.length})
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:8 }}>
            {inUseAssets.map(a => <NurseAssetCard key={a.id} asset={a} onClick={onSelectAsset} onStatusChange={onStatusChange} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Floor Map ────────────────────────────────────────────────────────────────
// ─── Building layout ──────────────────────────────────────────────────────────
// GATEWAY_ROOMS: only the ESP32 base stations actually deployed.
//   id    = GATEWAY_ID flashed onto the ESP32
//   floor = FLOOR constant flashed onto that same ESP32
const GATEWAY_ROOMS = [
  { id: "Room1", floor: "1F" },
  { id: "Room2", floor: "2F" },
  { id: "Room3", floor: "2F" },
];

// BUILDING_FLOORS: complete architectural layout.
//   Rooms with a `gateway` field are live-tracked.
//   Rooms without are rendered as decorative (no sensor / hatched).
const BUILDING_FLOORS = [
  {
    id: "1F", label: "Ground Floor",
    rooms: [
      { id: "Room101", label: "101", name: "Research Lab A",  gateway: "Room1", icon: "🔬", flex: 2 },
      { id: "Room102", label: "102", name: "Research Lab B",  gateway: null,    icon: "🧪", flex: 2 },
      { id: "Room103", label: "103", name: "Storage",         gateway: null,    icon: "📦", flex: 1 },
    ],
  },
  {
    id: "2F", label: "2nd Floor — Research",
    rooms: [
      { id: "Room201", label: "201", name: "Equipment Bay",   gateway: "Room2", icon: "🏗", flex: 2 },
      { id: "Room202", label: "202", name: "Workshop",        gateway: "Room3", icon: "🔧", flex: 2 },
      { id: "Room203", label: "203", name: "Meeting Room",    gateway: null,    icon: "👥", flex: 1 },
    ],
  },
  {
    id: "3F", label: "3rd Floor — Clinical",
    rooms: [
      { id: "Room301", label: "301", name: "Ward A",          gateway: null, icon: "🏥", flex: 2 },
      { id: "Room302", label: "302", name: "Ward B",          gateway: null, icon: "🏥", flex: 2 },
      { id: "Room303", label: "303", name: "Nurse Station",   gateway: null, icon: "👩‍⚕️", flex: 1 },
    ],
  },
];

const MAP_FLOORS = BUILDING_FLOORS.map(f => f.id);

// rssi thresholds (dBm): >-65 strong, -65 to -80 medium, <-80 weak
function signalStrength(rssi) {
  if (rssi == null) return 0;
  if (rssi >= -65) return 4;
  if (rssi >= -72) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

function signalColor(rssi) {
  const s = signalStrength(rssi);
  if (s >= 3) return "#16a34a";
  if (s === 2) return "#d97706";
  return "#dc2626";
}

function SignalBars({ rssi }) {
  const strength = signalStrength(rssi);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:14 }}>
      {[1,2,3,4].map(b => (
        <div key={b} style={{
          width:4, height:b*3+2, borderRadius:2,
          background: b <= strength ? signalColor(rssi) : "#e2e8f0",
          border:"1px solid #cbd5e1",
        }} />
      ))}
    </div>
  );
}

function FloorMap({ assets, onSelectAsset }) {
  const [selectedFloor, setSelectedFloor] = useState("1F");

  // Build per-gateway asset buckets
  const roomAssets = {};
  GATEWAY_ROOMS.forEach(r => { roomAssets[r.id] = []; });
  assets.forEach(asset => {
    const loc = asset.best_gateway || asset.gateway_id;
    if (loc && roomAssets[loc]) roomAssets[loc].push(asset);
  });

  const unplaced = assets.filter(a => {
    const loc = a.best_gateway || a.gateway_id;
    return !loc || !roomAssets[loc];
  });

  const floorData = BUILDING_FLOORS.find(f => f.id === selectedFloor);

  // ── Medical light palette ──
  const WALL   = "#93c5fd";   // soft blue walls
  const CORR   = "#dbeafe";   // light sky corridor
  const STRUCT = "#f1f5f9";   // off-white structural
  const GRID   = {
    backgroundImage: [
      "repeating-linear-gradient(0deg,  transparent, transparent 29px, rgba(148,163,184,0.18) 29px, rgba(148,163,184,0.18) 30px)",
      "repeating-linear-gradient(90deg, transparent, transparent 29px, rgba(148,163,184,0.18) 29px, rgba(148,163,184,0.18) 30px)",
    ].join(","),
  };
  const HATCH  = { backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(148,163,184,0.15) 5px, rgba(148,163,184,0.15) 6px)" };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ color:"#0f172a", fontSize:16, fontWeight:700 }}>Live Floor Map</div>
          <div style={{ color:"#475569", fontSize:13 }}>Amit Chakma Building · BLE tracking · best room = strongest smoothed RSSI</div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          {[["Active GW", GATEWAY_ROOMS.length, "#4ade80"], ["Tracked", assets.length - unplaced.length, "#60a5fa"], ["Unplaced", unplaced.length, "#f59e0b"]]
            .map(([l,v,c]) => (
              <div key={l} style={{ background:"#ffffff", border:"1px solid #bfdbfe", borderRadius:8, padding:"8px 14px", textAlign:"center" }}>
                <div style={{ color:c, fontSize:18, fontWeight:800, fontFamily:"'DM Mono', monospace" }}>{v}</div>
                <div style={{ color:"#475569", fontSize:11 }}>{l}</div>
              </div>
            ))}
        </div>
      </div>

      {/* ── Floor selector ── */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {BUILDING_FLOORS.map(f => {
          const count = f.rooms.filter(r => r.gateway).reduce((s, r) => s + (roomAssets[r.gateway]?.length ?? 0), 0);
          const active = f.id === selectedFloor;
          return (
            <button key={f.id} onClick={() => setSelectedFloor(f.id)} style={{
              background: active ? "#0369a1" : "#f0f9ff",
              border:`2px solid ${active ? "#0369a1" : "#bfdbfe"}`,
              color: active ? "#ffffff" : "#475569",
              borderRadius:8, padding:"8px 18px", fontSize:13, fontWeight:700,
              cursor:"pointer", display:"flex", alignItems:"center", gap:8, transition:"all .15s",
            }}>
              🏢 <span>{f.id}</span>
              <span style={{ color: active ? "#bfdbfe" : "#94a3b8", fontSize:11, fontWeight:400 }}>— {f.label}</span>
              {count > 0 && <span style={{ background:"#dbeafe", color:"#60a5fa", borderRadius:10, fontSize:11, padding:"1px 7px", fontWeight:700 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Floor plan ── */}
      <div style={{ ...GRID, background:"#f8faff", border:`3px solid ${WALL}`, borderRadius:12, overflow:"hidden", position:"relative", boxShadow:"0 4px 24px rgba(59,130,246,0.1)" }}>

        {/* ─ Corridor row ─ */}
        <div style={{ display:"flex", borderBottom:`3px solid ${WALL}` }}>
          {/* Stairwell top */}
          <div style={{ ...HATCH, width:88, flexShrink:0, background:STRUCT, borderRight:`3px solid ${WALL}`,
            padding:"10px 6px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4 }}>
            <span style={{ fontSize:18 }}>🪜</span>
            <span style={{ color:"#64748b", fontSize:7, letterSpacing:"0.12em", fontWeight:700 }}>STAIR</span>
          </div>
          {/* Corridor */}
          <div style={{ flex:1, background:CORR, padding:"10px 20px",
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ color:"#3b82f6", fontSize:10, fontWeight:700, letterSpacing:"0.15em" }}>
                MAIN CORRIDOR
              </span>
              <span style={{ color:"#bfdbfe", fontSize:12 }}>────────────────────────────</span>
              <span style={{ color:"#3b82f6", fontSize:10, letterSpacing:"0.1em" }}>{selectedFloor}</span>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {[["🚪","ENTRY"],["🛗","LIFT"],["🚻","WC"]].map(([icon,lbl]) => (
                <div key={lbl} style={{ background:STRUCT, border:`1px solid ${WALL}`, borderRadius:4,
                  padding:"5px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <span style={{ fontSize:13 }}>{icon}</span>
                  <span style={{ color:WALL, fontSize:7, letterSpacing:"0.1em" }}>{lbl}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Utility top */}
          <div style={{ ...HATCH, width:68, flexShrink:0, background:STRUCT, borderLeft:`3px solid ${WALL}`,
            padding:"10px 6px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4 }}>
            <span style={{ fontSize:16 }}>🔧</span>
            <span style={{ color:"#64748b", fontSize:7, letterSpacing:"0.12em", fontWeight:700 }}>UTIL</span>
          </div>
        </div>

        {/* ─ Room body ─ */}
        <div style={{ display:"flex", minHeight:440 }}>
          {/* Stairwell column */}
          <div style={{ ...HATCH, width:88, flexShrink:0, background:STRUCT, borderRight:`3px solid ${WALL}`,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ color:"#94a3b8", fontSize:8, writingMode:"vertical-rl", letterSpacing:"0.18em", fontWeight:700, opacity:.6 }}>
              A.C. BUILDING
            </span>
          </div>

          {/* Rooms */}
          <div style={{ flex:1, display:"flex" }}>
            {floorData?.rooms.map((room, i) => {
              const isLast = i === floorData.rooms.length - 1;
              const gwAssets = room.gateway ? (roomAssets[room.gateway] ?? []) : [];
              const hasAlert = gwAssets.some(a => a.alert);
              const tracked  = gwAssets.length > 0;

              let roomBg = "transparent";
              if (!room.gateway) roomBg = "transparent";
              else if (hasAlert) roomBg = "rgba(254,226,226,0.6)";
              else if (tracked)  roomBg = "rgba(219,234,254,0.5)";

              return (
                <div key={room.id} style={{
                  flex: room.flex,
                  borderRight: isLast ? "none" : `3px solid ${WALL}`,
                  background: roomBg,
                  display:"flex", flexDirection:"column",
                  position:"relative",
                }}>
                  {/* Door gap — cuts the corridor border above this room */}
                  {room.gateway && (
                    <div style={{ position:"absolute", top:-4, left:"50%", transform:"translateX(-50%)",
                      width:22, height:5, background:CORR, zIndex:2 }} />
                  )}

                  {/* Room label bar */}
                  <div style={{ padding:"8px 12px 6px",
                    borderBottom:`1px solid ${room.gateway ? "#bfdbfe" : "rgba(148,163,184,0.15)"}`,
                    display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ color: room.gateway ? "#0369a1" : "#94a3b8", fontSize:11, fontWeight:700,
                          letterSpacing:"0.1em", fontFamily:"'DM Mono', monospace" }}>{room.label}</span>
                        {room.gateway && (
                          <span style={{ fontSize:8, background:"#dbeafe", border:"1px solid #93c5fd",
                            color:"#0369a1", borderRadius:3, padding:"1px 4px", fontWeight:700 }}>📡 GW</span>
                        )}
                      </div>
                      <div style={{ color: room.gateway ? "#64748b" : "#cbd5e1", fontSize:9, marginTop:1, letterSpacing:"0.05em" }}>
                        {room.icon} {room.name.toUpperCase()}
                      </div>
                    </div>
                    {room.gateway && (
                      <div style={{ background: tracked ? "#dbeafe" : "transparent",
                        border:`1px solid ${tracked ? "#93c5fd" : "#e2e8f0"}`,
                        borderRadius:10, padding:"2px 8px",
                        color: tracked ? "#0369a1" : "#cbd5e1", fontSize:10, fontWeight:700 }}>
                        {gwAssets.length}
                      </div>
                    )}
                  </div>

                  {/* Room interior */}
                  <div style={{ flex:1, overflowY:"auto", padding: room.gateway ? 8 : 0 }}>
                    {!room.gateway ? (
                      // No sensor — hatched
                      <div style={{ ...HATCH, height:"100%", minHeight:200,
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <span style={{ color:"#cbd5e1", fontSize:10, letterSpacing:"0.14em", fontWeight:700 }}>NO SENSOR</span>
                      </div>
                    ) : gwAssets.length === 0 ? (
                      <div style={{ padding:"36px 0", display:"flex", flexDirection:"column",
                        alignItems:"center", justifyContent:"center", gap:5 }}>
                        <span style={{ color:"#94a3b8", fontSize:11, letterSpacing:"0.14em", fontWeight:700 }}>VACANT</span>
                        <span style={{ color:"#cbd5e1", fontSize:9 }}>gateway active · no tags</span>
                      </div>
                    ) : (
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {gwAssets.map(asset => {
                          const entry   = asset.rssi_map?.[room.gateway];
                          const roomRssi = entry?.smoothed ?? entry?.rssi ?? asset.rssi;
                          const isBest  = asset.best_gateway === room.gateway;
                          const all     = Object.entries(asset.rssi_map || {}).sort((a,b) => b[1].smoothed - a[1].smoothed);
                          return (
                            <div key={asset.id} onClick={() => onSelectAsset(asset)}
                              style={{ background: asset.alert ? "#fff5f5" : "#ffffff",
                                border:`1px solid ${asset.alert ? "#fca5a5" : isBest ? "#93c5fd" : "#e2e8f0"}`,
                                borderRadius:8, padding:"8px 10px", cursor:"pointer" }}
                              onMouseEnter={e => e.currentTarget.style.borderColor="#3b82f6"}
                              onMouseLeave={e => e.currentTarget.style.borderColor = asset.alert ? "#7f1d1d" : isBest ? "#1e40af" : "#0d1e38"}
                            >
                              {/* ID + status */}
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                                  <span style={{ fontSize:13 }}>{ICONS[asset.type]||"🏷"}</span>
                                  <span style={{ color:"#1e293b", fontSize:11, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>{asset.id}</span>
                                  {isBest && <span style={{ fontSize:8, background:"#dbeafe", border:"1px solid #93c5fd",
                                    color:"#1d4ed8", borderRadius:3, padding:"1px 4px", fontWeight:700 }}>★</span>}
                                </div>
                                <StatusBadge status={asset.status} />
                              </div>
                              {/* Signal + battery */}
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                                marginBottom: all.length > 1 ? 4 : 0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                                  <SignalBars rssi={roomRssi} />
                                  <span style={{ color:signalColor(roomRssi), fontSize:10, fontWeight:600 }}>
                                    {roomRssi != null ? `${roomRssi} dBm` : "—"}
                                  </span>
                                </div>
                                <BatteryBar pct={asset.battery} />
                              </div>
                              {/* Multi-gateway RSSI comparison */}
                              {all.length > 1 && (
                                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {all.map(([gw,v]) => (
                                    <span key={gw} style={{ fontSize:9, padding:"1px 5px", borderRadius:3,
                                      background: gw===asset.best_gateway ? "#dcfce7" : "#f1f5f9",
                                      border:`1px solid ${gw===asset.best_gateway ? "#86efac" : "#cbd5e1"}`,
                                      color: gw===asset.best_gateway ? "#15803d" : "#64748b" }}>
                                      {gw}:{v.smoothed??v.rssi}{gw===asset.best_gateway?"★":""}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {asset.alert && (
                                <div style={{ marginTop:4, color:"#fca5a5", fontSize:10, fontWeight:600 }}>⚠ {asset.alertMsg}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Utility column */}
          <div style={{ ...HATCH, width:68, flexShrink:0, background:STRUCT, borderLeft:`3px solid ${WALL}`,
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-around", padding:8 }}>
            {["🔌","💡","🌡️"].map(ic => (
              <div key={ic} style={{ background:"#f0f9ff", border:`1px solid ${WALL}`,
                borderRadius:4, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>{ic}</div>
            ))}
            <span style={{ color:WALL, fontSize:7, writingMode:"vertical-rl", letterSpacing:"0.1em", fontWeight:700, opacity:.5 }}>UTILITY</span>
          </div>
        </div>

        {/* Scale bar + north arrow */}
        <div style={{ position:"absolute", bottom:10, right:80,
          display:"flex", alignItems:"center", gap:6, opacity:.3 }}>
          <span style={{ color:WALL, fontSize:8 }}>N ↑</span>
          <div style={{ display:"flex", alignItems:"center" }}>
            <div style={{ width:2, height:8, background:WALL }} />
            <div style={{ width:44, height:2, background:WALL }} />
            <div style={{ width:2, height:8, background:WALL }} />
          </div>
          <span style={{ color:WALL, fontSize:8 }}>10 m</span>
        </div>

        {/* Watermark */}
        <div style={{ position:"absolute", bottom:10, left:100, opacity:.12 }}>
          <span style={{ color:WALL, fontSize:9, letterSpacing:"0.14em", fontFamily:"'DM Mono', monospace" }}>
            AMIT CHAKMA BUILDING · {selectedFloor} · MEDTRACK
          </span>
        </div>
      </div>

      {/* Unplaced */}
      {unplaced.length > 0 && (
        <div style={{ marginTop:14, background:"#ffffff", border:"1px solid #dbeafe", borderRadius:10, padding:"12px 14px" }}>
          <div style={{ color:"#64748b", fontSize:12, fontWeight:600, marginBottom:8 }}>📡 Awaiting detection ({unplaced.length})</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {unplaced.map(a => (
              <div key={a.id} onClick={() => onSelectAsset(a)}
                style={{ background:"#eff6ff", border:"1px solid #dbeafe", borderRadius:8,
                  padding:"6px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:14 }}>{ICONS[a.type]||"🏷"}</span>
                <span style={{ color:"#94a3b8", fontSize:12, fontFamily:"'DM Mono', monospace" }}>{a.id}</span>
                <BatteryBar pct={a.battery} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display:"flex", gap:20, marginTop:12, flexWrap:"wrap" }}>
        {[["Strong (≥ −65 dBm)","#4ade80"],["Medium (−65 to −80)","#f59e0b"],["Weak (< −80 dBm)","#f87171"],["★ Best gateway","#60a5fa"]].map(([l,c]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:10, height:10, background:c, borderRadius:2 }} />
            <span style={{ color:"#64748b", fontSize:12 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Heatmap View ─────────────────────────────────────────────────────────────
function HeatmapView() {
  const data = DEPARTMENTS.map(d => ({
    dept: d,
    counts: ASSET_TYPES.map(t => ({
      type: t,
      count: ASSETS.filter(a => a.department === d && a.type === t).length
    }))
  }));
  const maxCount = Math.max(...data.flatMap(d => d.counts.map(c => c.count)));

  function heatColor(v) {
    if (v === 0) return { bg:"#f8fafc", text:"#cbd5e1" };
    const pct = v / maxCount;
    if (pct < 0.3) return { bg:"#dbeafe", text:"#1d4ed8" };
    if (pct < 0.6) return { bg:"#93c5fd", text:"#1e3a8a" };
    return { bg:"#2563eb", text:"#fff" };
  }

  return (
    <div style={{ overflowX:"auto" }}>
      <div style={{ minWidth:700 }}>
        {/* Header row */}
        <div style={{ display:"grid", gridTemplateColumns:`120px repeat(${ASSET_TYPES.length}, 1fr)`, gap:4, marginBottom:4 }}>
          <div />
          {ASSET_TYPES.map(t => (
            <div key={t} style={{ color:"#64748b", fontSize:10, textAlign:"center", padding:"0 2px", lineHeight:1.3, writingMode:"vertical-rl", transform:"rotate(180deg)", height:80, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {ICONS[t]} {t.split(" ")[0]}
            </div>
          ))}
        </div>
        {data.map(row => (
          <div key={row.dept} style={{ display:"grid", gridTemplateColumns:`120px repeat(${ASSET_TYPES.length}, 1fr)`, gap:4, marginBottom:4 }}>
            <div style={{ color:"#94a3b8", fontSize:12, display:"flex", alignItems:"center", paddingRight:8 }}>{row.dept}</div>
            {row.counts.map(c => {
              const col = heatColor(c.count);
              return (
                <div key={c.type} style={{ background:col.bg, borderRadius:6, aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:col.text, fontSize:13, fontWeight:700, fontFamily:"'DM Mono', monospace" }}>{c.count || ""}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("assets");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [assets, setAssets] = useState(ASSETS);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [lastTag, setLastTag] = useState(null);

  // ── WebSocket: connect to local Node.js server ──
  useEffect(() => {
    if (!role) return;
    let ws;
    let retryTimer;

    function ingestTag(tag) {
      setAssets(prev => {
        const exists = prev.find(a => a.id === tag.tag_id);
        const updated = {
          id: tag.tag_id,
          device_name:   tag.device_name   ?? exists?.device_name   ?? "",
          type:          tag.device_type   ?? exists?.type          ?? "Unknown Device",
          status:        tag.status        ?? exists?.status        ?? "Unknown",
          floor:         tag.floor         ?? exists?.floor         ?? "Unknown",
          department:    tag.department    ?? exists?.department    ?? "Unknown",
          room:          tag.room          ?? exists?.room          ?? "Unknown",
          battery:       tag.battery       ?? exists?.battery       ?? 0,
          gateway_id:    tag.gateway_id    ?? exists?.gateway_id    ?? null,
          rssi:          tag.rssi          ?? exists?.rssi          ?? null,
          flags:         tag.flags         ?? exists?.flags         ?? null,
          rssi_map:      tag.rssi_map      ?? exists?.rssi_map      ?? {},
          best_gateway:  tag.best_gateway  ?? exists?.best_gateway  ?? null,
          current_floor: tag.current_floor ?? exists?.current_floor ?? null,
          current_room:  tag.current_room  ?? exists?.current_room  ?? null,
          in_use_since:  tag.in_use_since  ?? exists?.in_use_since  ?? null,
          moving:        exists?.moving    ?? false,
          lastSeen:      new Date(tag.last_seen ?? Date.now()),
          minsAgo:       0,
          alert:         (tag.battery ?? 100) < 20,
          alertMsg:      (tag.battery ?? 100) < 20 ? "Low battery" : null,
        };
        if (exists) return prev.map(a => a.id === tag.tag_id ? updated : a);
        return [...prev, updated];
      });

      // Keep the open modal's live telemetry current without touching the edit form.
      // (The form only reinitializes when asset.id changes, so this is safe.)
      setSelectedAsset(prev => {
        if (!prev || prev.id !== tag.tag_id) return prev;
        return {
          ...prev,
          battery:       tag.battery       ?? prev.battery,
          gateway_id:    tag.gateway_id    ?? prev.gateway_id,
          rssi:          tag.rssi          ?? prev.rssi,
          flags:         tag.flags         ?? prev.flags,
          rssi_map:      tag.rssi_map      ?? prev.rssi_map,
          best_gateway:  tag.best_gateway  ?? prev.best_gateway,
          current_floor: tag.current_floor ?? prev.current_floor,
          current_room:  tag.current_room  ?? prev.current_room,
          lastSeen:      new Date(tag.last_seen ?? Date.now()),
        };
      });
    }

    function connect() {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setWsStatus("connected");
      ws.onclose = () => { setWsStatus("disconnected"); retryTimer = setTimeout(connect, 5000); };
      ws.onerror = () => setWsStatus("error");
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "init") msg.data.forEach(tag => ingestTag(tag));
        if (msg.type === "tag_update") { ingestTag(msg.data); setLastTag(msg.data); }
        if (msg.type === "tag_deleted") setAssets(prev => prev.filter(a => a.id !== msg.tag_id));
      };
    }

    connect();
    return () => { ws?.close(); clearTimeout(retryTimer); };
  }, [role]);

  function handleDelete(id) {
    setAssets(prev => prev.filter(a => a.id !== id));
    setSelectedAsset(null);
  }

  async function handleStatusChange(id, newStatus) {
    try {
      const body = { status: newStatus };
      if (newStatus === "In Use") body.in_use_since = new Date().toISOString();
      if (newStatus === "Available") body.in_use_since = null;
      const res = await fetch(`${SERVER_URL}/api/assets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { entry } = await res.json();
      if (entry) handleUpdate(entry);
    } catch (e) {
      console.error("Status update failed", e);
    }
  }

  function handleUpdate(entry) {
    ingestTagGlobal(entry);
    setSelectedAsset(prev => prev ? { ...prev,
      device_name:  entry.device_name,
      type:         entry.device_type  ?? prev.type,
      status:       entry.status       ?? prev.status,
      floor:        entry.floor        ?? prev.floor,
      department:   entry.department   ?? prev.department,
      room:         entry.room         ?? prev.room,
      in_use_since: entry.in_use_since !== undefined ? entry.in_use_since : prev.in_use_since,
    } : prev);
  }

  function ingestTagGlobal(tag) {
    setAssets(prev => {
      const exists = prev.find(a => a.id === tag.tag_id);
      const updated = {
        id: tag.tag_id,
        device_name:   tag.device_name   ?? exists?.device_name   ?? "",
        type:          tag.device_type   ?? exists?.type          ?? "Unknown Device",
        status:        tag.status        ?? exists?.status        ?? "Unknown",
        floor:         tag.floor         ?? exists?.floor         ?? "Unknown",
        department:    tag.department    ?? exists?.department    ?? "Unknown",
        room:          tag.room          ?? exists?.room          ?? "Unknown",
        battery:       tag.battery       ?? exists?.battery       ?? 0,
        gateway_id:    tag.gateway_id    ?? exists?.gateway_id    ?? null,
        rssi:          tag.rssi          ?? exists?.rssi          ?? null,
        flags:         tag.flags         ?? exists?.flags         ?? null,
        rssi_map:      tag.rssi_map      ?? exists?.rssi_map      ?? {},
        best_gateway:  tag.best_gateway  ?? exists?.best_gateway  ?? null,
        current_floor: tag.current_floor ?? exists?.current_floor ?? null,
        current_room:  tag.current_room  ?? exists?.current_room  ?? null,
        in_use_since:  tag.in_use_since  !== undefined ? tag.in_use_since : (exists?.in_use_since ?? null),
        moving:        exists?.moving    ?? false,
        lastSeen:      new Date(tag.last_seen ?? Date.now()),
        minsAgo:       0,
        alert:         (tag.battery ?? 100) < 20,
        alertMsg:      (tag.battery ?? 100) < 20 ? "Low battery" : null,
      };
      if (exists) return prev.map(a => a.id === tag.tag_id ? updated : a);
      return [...prev, updated];
    });
  }

  const USERS = {
    "biomed": { pass:"biomed123", role:"biomed" },
    "nurse": { pass:"nurse123", role:"clinical" },
  };

  function handleLogin() {
    const u = USERS[loginUser.toLowerCase()];
    if (u && u.pass === loginPass) { setRole(u.role); setLoginError(""); }
    else setLoginError("Invalid credentials. Try biomed/biomed123 or nurse/nurse123");
  }

  // ── Login Screen ──
  if (!role) {
    return (
      <div style={{ minHeight:"100vh", background:"#f0f7ff", display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'DM Sans', system-ui, sans-serif", padding:16 }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
          @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        `}</style>
        <div style={{ width:"100%", maxWidth:420, animation:"fadeIn .5s ease" }}>
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ marginBottom:8 }}>
              <img src="/logo.png" alt="MedTags" style={{ width:220, height:"auto", objectFit:"contain" }} />
            </div>
            <div style={{ color:"#0f172a", fontSize:24, fontWeight:800, letterSpacing:"-0.02em" }}>MedTags</div>
            <div style={{ color:"#475569", fontSize:14, marginTop:4 }}>Hospital Asset Tracking System</div>
          </div>
          <div style={{ background:"#ffffff", border:"1px solid #bfdbfe", borderRadius:16, padding:28 }}>
            <div style={{ marginBottom:16 }}>
              <label style={{ color:"#94a3b8", fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>Username</label>
              <input value={loginUser} onChange={e => setLoginUser(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="biomed or nurse"
                style={{ width:"100%", background:"#eff6ff", border:"1px solid #dbeafe", color:"#0f172a",
                  borderRadius:8, padding:"10px 14px", fontSize:14, outline:"none" }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ color:"#94a3b8", fontSize:13, fontWeight:600, display:"block", marginBottom:6 }}>Password</label>
              <input value={loginPass} onChange={e => setLoginPass(e.target.value)} type="password"
                onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••"
                style={{ width:"100%", background:"#eff6ff", border:"1px solid #dbeafe", color:"#0f172a",
                  borderRadius:8, padding:"10px 14px", fontSize:14, outline:"none" }} />
            </div>
            {loginError && <div style={{ color:"#f87171", fontSize:13, marginBottom:14, background:"#fef2f2", padding:"8px 12px", borderRadius:8 }}>{loginError}</div>}
            <button onClick={handleLogin} style={{ width:"100%", background:"#2563eb", color:"#fff", border:"none",
              borderRadius:8, padding:"12px", fontSize:15, fontWeight:700, cursor:"pointer" }}>Sign In</button>
            <div style={{ marginTop:16, padding:12, background:"#ffffff", border:"1px solid #bfdbfe", borderRadius:8 }}>
              <div style={{ color:"#64748b", fontSize:12, fontWeight:600, marginBottom:6 }}>Demo Credentials</div>
              <div style={{ color:"#475569", fontSize:12 }}>🔬 Biomedical: <span style={{color:"#0369a1"}}>biomed / biomed123</span></div>
              <div style={{ color:"#475569", fontSize:12, marginTop:4 }}>👩‍⚕️ Clinical Staff: <span style={{color:"#0369a1"}}>nurse / nurse123</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main App ──
  const isBiomed = role === "biomed";
  const tabs = isBiomed
    ? [{ id:"assets", label:"📋 All Assets" }, { id:"map", label:"🗺 Floor Map" }]
    : [{ id:"assets", label:"🔍 Find Equipment" }];

  const wsColors = { connected:"#16a34a", disconnected:"#dc2626", error:"#d97706" };
  const wsLabels = { connected:"SERVER CONNECTED", disconnected:"SERVER OFFLINE", error:"SERVER ERROR" };

  return (
    <div style={{ minHeight:"100vh", background:"#f0f7ff", fontFamily:"'DM Sans', system-ui, sans-serif", color:"#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,.4)} 70%{box-shadow:0 0 0 8px rgba(22,163,74,0)} }
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background:#f0f7ff; }
        ::-webkit-scrollbar-thumb { background:#bfdbfe; border-radius:3px; }
        select option { background:#ffffff; }
      `}</style>

      {/* Nav */}
      <nav style={{ background:"#ffffff", borderBottom:"1px solid #bfdbfe", padding:"0 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between", height:58, position:"sticky", top:0, zIndex:100,
        boxShadow:"0 1px 8px rgba(59,130,246,0.08)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <img src="/logo.png" alt="MedTags" style={{ height:34, width:"auto", objectFit:"contain" }} />
          <div>
            <div style={{ color:"#0369a1", fontWeight:800, fontSize:16, letterSpacing:"-0.02em", lineHeight:1.2 }}>MedTags</div>
            <div style={{ color:"#94a3b8", fontSize:11 }}>{isBiomed ? "Biomedical Engineering" : "Clinical Staff"}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, background:"#f8fafc",
            border:"1px solid #e2e8f0", borderRadius:20, padding:"4px 12px" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background: wsColors[wsStatus],
              animation: wsStatus === "connected" ? "pulse 2s infinite" : "none" }} />
            <span style={{ color: wsColors[wsStatus], fontSize:11, fontWeight:600 }}>{wsLabels[wsStatus]}</span>
          </div>
          {lastTag && (
            <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:20, padding:"4px 12px", fontSize:11 }}>
              <span style={{ color:"#16a34a", fontWeight:600 }}>📡 {lastTag.tag_id} · {lastTag.battery}%</span>
            </div>
          )}
          <button onClick={() => setRole(null)} style={{ background:"#f8fafc", border:"1px solid #e2e8f0",
            color:"#64748b", borderRadius:8, padding:"6px 14px", fontSize:12, cursor:"pointer", fontWeight:500 }}>Sign out</button>
        </div>
      </nav>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div style={{ background:"#ffffff", borderBottom:"1px solid #e2e8f0", padding:"0 24px", display:"flex", gap:2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background:"transparent", border:"none", borderBottom:`2px solid ${tab === t.id ? "#0369a1" : "transparent"}`,
              color: tab === t.id ? "#0369a1" : "#94a3b8", padding:"14px 18px", fontSize:14, cursor:"pointer",
              fontWeight: tab === t.id ? 700 : 400, transition:"all .15s" }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <main style={{ padding:16, maxWidth:1400, margin:"0 auto" }}>
        {tab === "assets" && (isBiomed
          ? <BiomédicalView onSelectAsset={setSelectedAsset} assets={assets} onDelete={handleDelete} />
          : <ClinicalView onSelectAsset={setSelectedAsset} assets={assets} onStatusChange={handleStatusChange} />
        )}
        {tab === "map" && <FloorMap assets={assets} onSelectAsset={setSelectedAsset} />}
      </main>

      <AssetModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} onDelete={handleDelete} onUpdate={handleUpdate} isBiomed={isBiomed} />
    </div>
  );
}
