import { useEffect, useMemo, useRef, useState } from "react";
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

const DEFAULT_BASELINE = {
  turn: "on",
  brightness: 80,
  // Choose ONE: either color OR colorTem
  color: { r: 255, g: 255, b: 255 },
  // colorTem: 4500,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [effectsOpen, setEffectsOpen] = useState(false);

  // Govee
  const [goveeEnabled, setGoveeEnabled] = useState(true);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("1F:2C:D4:0F:44:46:4F:2C");
  const [model, setModel] = useState("H6099");

  // Baseline (what the room light should return to after effects)
  const [baseline, setBaseline] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("goveeBaseline") || "null");
    } catch {
      return null;
    }
  });

  // Rate-limit + queue to avoid 429
  const effectLock = useRef(false);
  const cmdQueue = useRef(Promise.resolve());
  const lastCmdAt = useRef(0);

  const selectedLabel = useMemo(() => {
    const d = devices.find((x) => x.device === deviceId);
    return d ? `${d.deviceName} (${d.model})` : `${model} • ${deviceId?.slice(0, 6) ?? ""}…`;
  }, [devices, deviceId, model]);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/.netlify/functions/govee-devices");
        const json = await resp.json();
        const list = json?.data?.devices || [];
        setDevices(list);
        console.log("GOVEE DEVICES:", list);

        if ((!deviceId || !model) && list.length > 0) {
          const first = list[0];
          setDeviceId(first.device);
          setModel(first.model);
        }
      } catch (e) {
        console.error("Failed to load govee devices:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeLife(playerId, delta) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, life: p.life + delta } : p))
    );
  }

  function saveBaseline(next) {
    setBaseline(next);
    localStorage.setItem("goveeBaseline", JSON.stringify(next));
  }

  async function goveeControl(cmd) {
    if (!goveeEnabled) return;
    if (!deviceId || !model) return;

    const resp = await fetch("/.netlify/functions/govee-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: deviceId, model, cmd }),
    });

    // Do not assume JSON (some responses can be empty)
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

  async function goveeControlThrottled(cmd) {
    // Serialize commands + add a minimum gap to prevent 429
    cmdQueue.current = cmdQueue.current.then(async () => {
      const minGapMs = 650; // increase if you still see 429
      const now = Date.now();
      const wait = Math.max(0, minGapMs - (now - lastCmdAt.current));
      if (wait) await sleep(wait);

      lastCmdAt.current = Date.now();
      return goveeControl(cmd);
    });

    return cmdQueue.current;
  }

  async function restoreBaseline() {
    if (!baseline) return;

    // Safe order: turn -> color/colortem -> brightness
    if (baseline.turn) {
      await goveeControlThrottled({ name: "turn", value: baseline.turn });
    }

    if (baseline.color) {
      await goveeControlThrottled({ name: "color", value: baseline.color });
    } else if (typeof baseline.colorTem === "number") {
      await goveeControlThrottled({ name: "colorTem", value: baseline.colorTem });
    }

    if (typeof baseline.brightness === "number") {
      await goveeControlThrottled({ name: "brightness", value: baseline.brightness });
    }
  }

  async function triggerEffect(effectId) {
    if (!goveeEnabled) return;
    if (!deviceId || !model) return;

    // Ignore spam while an effect is running
    if (effectLock.current) return;
    effectLock.current = true;

    try {
      switch (effectId) {
        case "DMG_SMALL":
          await goveeControlThrottled({ name: "brightness", value: 25 });
          await sleep(160);
          await goveeControlThrottled({ name: "brightness", value: 100 });
          break;

        case "DMG_MED":
          await goveeControlThrottled({ name: "brightness", value: 15 });
          await sleep(140);
          await goveeControlThrottled({ name: "brightness", value: 100 });
          await sleep(140);
          await goveeControlThrottled({ name: "brightness", value: 35 });
          await sleep(140);
          await goveeControlThrottled({ name: "brightness", value: 100 });
          break;

        case "DMG_BIG":
          await goveeControlThrottled({ name: "turn", value: "on" });
          await goveeControlThrottled({ name: "color", value: { r: 255, g: 30, b: 30 } });
          await goveeControlThrottled({ name: "brightness", value: 100 });
          await sleep(120);
          await goveeControlThrottled({ name: "brightness", value: 10 });
          await sleep(160);
          await goveeControlThrottled({ name: "brightness", value: 100 });
          break;

        case "GAIN_LIFE":
          await goveeControlThrottled({ name: "turn", value: "on" });
          await goveeControlThrottled({ name: "color", value: { r: 60, g: 255, b: 140 } });
          await goveeControlThrottled({ name: "brightness", value: 25 });
          await sleep(140);
          await goveeControlThrottled({ name: "brightness", value: 90 });
          break;

        case "BOARD_WIPE":
          await goveeControlThrottled({ name: "turn", value: "on" });
          await goveeControlThrottled({ name: "color", value: { r: 255, g: 255, b: 255 } });
          await goveeControlThrottled({ name: "brightness", value: 100 });
          await sleep(160);
          await goveeControlThrottled({ name: "brightness", value: 10 });
          await sleep(220);
          await goveeControlThrottled({ name: "brightness", value: 70 });
          break;

        case "COMMANDER_CAST":
          await goveeControlThrottled({ name: "turn", value: "on" });
          await goveeControlThrottled({ name: "color", value: { r: 245, g: 132, b: 38 } });
          await goveeControlThrottled({ name: "brightness", value: 100 });
          await sleep(120);
          await goveeControlThrottled({ name: "brightness", value: 35 });
          await sleep(180);
          await goveeControlThrottled({ name: "brightness", value: 90 });
          break;

        case "COUNTER_WAR":
          await goveeControlThrottled({ name: "turn", value: "on" });
          await goveeControlThrottled({ name: "color", value: { r: 120, g: 170, b: 255 } });
          await goveeControlThrottled({ name: "brightness", value: 100 });
          await sleep(110);
          await goveeControlThrottled({ name: "brightness", value: 30 });
          await sleep(110);
          await goveeControlThrottled({ name: "brightness", value: 100 });
          await sleep(110);
          await goveeControlThrottled({ name: "brightness", value: 30 });
          await sleep(110);
          await goveeControlThrottled({ name: "brightness", value: 100 });
          break;

        default:
          break;
      }
    } finally {
      // brief pause then restore the room lighting baseline
      await sleep(250);
      await restoreBaseline();
      await sleep(200);
      effectLock.current = false;
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

        <div className="row wrap" style={{ marginTop: 10 }}>
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

        <div className="row wrap" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => saveBaseline(DEFAULT_BASELINE)}>
            Set Room Baseline
          </button>
          <button className="btn" onClick={restoreBaseline} disabled={!baseline}>
            Restore Baseline
          </button>
        </div>

        <div className="hint" style={{ marginTop: 8 }}>
          Tip: Set your room lighting how you want (in Govee app), then edit DEFAULT_BASELINE in App.jsx
          to match it and click “Set Room Baseline.” Effects will always return to that.
        </div>
      </section>

      <main className="grid">
        {players.map((p) => (
          <section key={p.id} className="card">
            <div className="row">
              <div className="playerName">{p.name}</div>
              <div className={`pill ${p.life <= 5 ? "danger" : ""}`}>{p.life <= 5 ? "Low Life" : "Life"}</div>
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

            <div className="row wrap" style={{ marginTop: 10 }}>
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
