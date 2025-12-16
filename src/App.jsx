import { useEffect, useMemo, useState } from "react";
import "./App.css";

const DEFAULT_PLAYERS = [
  { id: "p1", name: "Player 1", life: 40 },
  { id: "p2", name: "Player 2", life: 40 },
  { id: "p3", name: "Player 3", life: 40 },
  { id: "p4", name: "Player 4", life: 40 },
];

const EFFECTS = [
  { id: "DMG_SMALL", title: "Damage (1–3)", desc: "quick pulse" },
  { id: "DMG_MED", title: "Damage (4–7)", desc: "strong pulse" },
  { id: "DMG_BIG", title: "Damage (8+)", desc: "red warning flash" },
  { id: "GAIN_LIFE", title: "Gain Life", desc: "green glow" },
  { id: "BOARD_WIPE", title: "Board Wipe", desc: "white flash → dim" },
  { id: "COMMANDER_CAST", title: "Cast Commander", desc: "orange flare" },
  { id: "COUNTER_WAR", title: "Counter War", desc: "rapid flicker" },
];

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);

  const [effectsOpen, setEffectsOpen] = useState(false);

  // Govee
  const [goveeEnabled, setGoveeEnabled] = useState(true);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("1F:2C:D4:0F:44:46:4F:2C");
  const [model, setModel] = useState("H6099");

  const selectedLabel = useMemo(() => {
    const d = devices.find((x) => x.device === deviceId);
    return d ? `${d.deviceName} (${d.model})` : `${model} • ${deviceId.slice(0, 6)}…`;
  }, [devices, deviceId, model]);

  // Throttle effect triggers to avoid spamming cloud API
  const [lastEffectAt, setLastEffectAt] = useState(0);

  useEffect(() => {
    // load device list from your Netlify function
    (async () => {
      try {
        const resp = await fetch("/.netlify/functions/govee-devices");
        const json = await resp.json();
        const list = json?.data?.devices || [];
        setDevices(list);

        // If user hasn’t chosen yet, auto-pick the first controllable one
        if ((!deviceId || !model) && list.length > 0) {
          const first = list[0];
          setDeviceId(first.device);
          setModel(first.model);
        }
      } catch (e) {
        // no-op: user can still manually set device/model later
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeLife(playerId, delta) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, life: p.life + delta } : p))
    );
  }

async function goveeControl(cmd) {
  if (!goveeEnabled) return;
  if (!deviceId || !model) return;

  const resp = await fetch("/.netlify/functions/govee-control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: deviceId, model, cmd }),
  });

  // Don't assume JSON; govee-control may return an empty body on success.
  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    console.error("Govee control failed:", resp.status, data);
  }

  return data;
}

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function triggerEffect(effectId) {
    const now = Date.now();
    if (now - lastEffectAt < 800) return;
    setLastEffectAt(now);

    // Simple sequences. Your device supports: turn, brightness, color, colorTem.
    switch (effectId) {
      case "DMG_SMALL":
        await goveeControl({ name: "brightness", value: 25 });
        await sleep(160);
        await goveeControl({ name: "brightness", value: 100 });
        break;

      case "DMG_MED":
        await goveeControl({ name: "brightness", value: 15 });
        await sleep(140);
        await goveeControl({ name: "brightness", value: 100 });
        await sleep(140);
        await goveeControl({ name: "brightness", value: 35 });
        await sleep(140);
        await goveeControl({ name: "brightness", value: 100 });
        break;

      case "DMG_BIG":
        await goveeControl({ name: "turn", value: "on" });
        await goveeControl({ name: "color", value: { r: 255, g: 30, b: 30 } });
        await goveeControl({ name: "brightness", value: 100 });
        await sleep(120);
        await goveeControl({ name: "brightness", value: 10 });
        await sleep(160);
        await goveeControl({ name: "brightness", value: 100 });
        break;

      case "GAIN_LIFE":
        await goveeControl({ name: "color", value: { r: 60, g: 255, b: 140 } });
        await goveeControl({ name: "brightness", value: 25 });
        await sleep(140);
        await goveeControl({ name: "brightness", value: 90 });
        break;

      case "BOARD_WIPE":
        await goveeControl({ name: "color", value: { r: 255, g: 255, b: 255 } });
        await goveeControl({ name: "brightness", value: 100 });
        await sleep(160);
        await goveeControl({ name: "brightness", value: 10 });
        await sleep(220);
        await goveeControl({ name: "brightness", value: 70 });
        break;

      case "COMMANDER_CAST":
        await goveeControl({ name: "color", value: { r: 245, g: 132, b: 38 } });
        await goveeControl({ name: "brightness", value: 100 });
        await sleep(120);
        await goveeControl({ name: "brightness", value: 35 });
        await sleep(180);
        await goveeControl({ name: "brightness", value: 90 });
        break;

      case "COUNTER_WAR":
        await goveeControl({ name: "color", value: { r: 120, g: 170, b: 255 } });
        await goveeControl({ name: "brightness", value: 100 });
        await sleep(110);
        await goveeControl({ name: "brightness", value: 30 });
        await sleep(110);
        await goveeControl({ name: "brightness", value: 100 });
        await sleep(110);
        await goveeControl({ name: "brightness", value: 30 });
        await sleep(110);
        await goveeControl({ name: "brightness", value: 100 });
        break;

      default:
        break;
    }
  }

  return (
    <div className="mtgApp">
      <header className="topBar">
        <div>
          <div className="title">MTG Life Counter</div>
          <div className="subtitle">Govee-powered Commander table</div>
        </div>

        <button className="chip" onClick={() => setEffectsOpen(true)}>
          Effects
        </button>
      </header>

      <section className="panel">
        <div className="row">
          <div>
            <div className="label">Govee</div>
            <div className="hint">Selected: {selectedLabel}</div>
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={goveeEnabled}
              onChange={(e) => setGoveeEnabled(e.target.checked)}
            />
            <span>Enabled</span>
          </label>
        </div>

        <div className="row wrap">
          <select
            className="select"
            value={deviceId ? `${deviceId}|${model}` : ""}
            onChange={(e) => {
              const [d, m] = e.target.value.split("|");
              setDeviceId(d);
              setModel(m);
            }}
          >
            <option value="">Choose device…</option>
            {devices.map((d) => (
              <option key={d.device} value={`${d.device}|${d.model}`}>
                {d.deviceName} ({d.model})
              </option>
            ))}
          </select>

          <button className="btn" onClick={() => triggerEffect("DMG_SMALL")}>
            Test Lights
          </button>
        </div>
      </section>

      <main className="grid">
        {players.map((p) => (
          <section key={p.id} className="card">
            <div className="row">
              <div className="playerName">{p.name}</div>
              <div className={`pill ${p.life <= 5 ? "danger" : ""}`}>
                {p.life <= 5 ? "Low Life" : "Life"}
              </div>
            </div>

            <div className="lifeRow">
              <button
                className="lifeBtn"
                onClick={() => {
                  changeLife(p.id, -1);
                  triggerEffect("DMG_SMALL");
                }}
              >
                -1
              </button>

              <div className="lifeNum">{p.life}</div>

              <button
                className="lifeBtn"
                onClick={() => {
                  changeLife(p.id, +1);
                  triggerEffect("GAIN_LIFE");
                }}
              >
                +1
              </button>
            </div>

            <div className="row wrap">
              <button className="btn small" onClick={() => triggerEffect("DMG_BIG")}>
                Big Hit
              </button>
              <button className="btn small" onClick={() => triggerEffect("BOARD_WIPE")}>
                Board Wipe
              </button>
              <button className="btn small" onClick={() => triggerEffect("COMMANDER_CAST")}>
                Cast Cmdr
              </button>
            </div>
          </section>
        ))}
      </main>

      {effectsOpen && (
        <div className="sheetBackdrop" onClick={() => setEffectsOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <div className="sheetTitle">Effects Board</div>
              <button className="chip" onClick={() => setEffectsOpen(false)}>
                Close
              </button>
            </div>

            <div className="effectsGrid">
              {EFFECTS.map((fx) => (
                <button
                  key={fx.id}
                  className="effect"
                  onClick={() => triggerEffect(fx.id)}
                >
                  <div className="effectTitle">{fx.title}</div>
                  <div className="effectDesc">{fx.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
