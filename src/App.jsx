import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const DEFAULT_PLAYERS = [
  { id: "p1", name: "Player 1", life: 40 },
  { id: "p2", name: "Player 2", life: 40 },
  { id: "p3", name: "Player 3", life: 40 },
  { id: "p4", name: "Player 4", life: 40 },
];

const EFFECTS = [
  { id: "DMG_SMALL", title: "Damage (1–3)", desc: "hot punch" },
  { id: "DMG_MED", title: "Damage (4–7)", desc: "double hit" },
  { id: "DMG_BIG", title: "Damage (8+)", desc: "red alarm" },
  { id: "GAIN_LIFE", title: "Gain Life", desc: "neon green bloom" },
  { id: "BOARD_WIPE", title: "Board Wipe", desc: "whiteout + blackout" },
  { id: "COMMANDER_CAST", title: "Cast Commander", desc: "gold flare" },
  { id: "COUNTER_WAR", title: "Counter War", desc: "blue strobe" },
  { id: "EXTRA_TURN", title: "Extra Turn", desc: "time warp purple" },
  { id: "PLAYER_OUT", title: "Player Eliminated", desc: "deep red fade" },
  { id: "BIG_SPELL", title: "Big Spell", desc: "rainbow slam" },
];

const DEFAULT_BASELINE = {
  turn: "on",
  brightness: 80,
  // Choose ONE:
  color: { r: 255, g: 255, b: 255 },
  // colorTem: 4500,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clampBrightness(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return 50;
  return Math.max(1, Math.min(100, v));
}

function rgb(r, g, b) {
  return { r, g, b };
}

export default function App() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [effectsOpen, setEffectsOpen] = useState(false);

  // Govee
  const [goveeEnabled, setGoveeEnabled] = useState(true);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("1F:2C:D4:0F:44:46:4F:2C");
  const [model, setModel] = useState("H6099");

  // Baseline restore
  const [baseline, setBaseline] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("goveeBaseline") || "null");
    } catch {
      return null;
    }
  });

  // Rate limit helpers
  const effectLock = useRef(false);
  const cmdQueue = useRef(Promise.resolve());
  const lastCmdAt = useRef(0);

  // Optional: if you want a slightly faster feel, drop to 500.
  const MIN_GAP_MS = 650;

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
    cmdQueue.current = cmdQueue.current.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, MIN_GAP_MS - (now - lastCmdAt.current));
      if (wait) await sleep(wait);

      lastCmdAt.current = Date.now();
      return goveeControl(cmd);
    });

    return cmdQueue.current;
  }

  // Convenience wrappers (keeps effects readable)
  async function setColor(c) {
    return goveeControlThrottled({ name: "color", value: c });
  }
  async function setBright(b) {
    return goveeControlThrottled({ name: "brightness", value: clampBrightness(b) });
  }
  async function setOn() {
    return goveeControlThrottled({ name: "turn", value: "on" });
  }

  async function restoreBaseline() {
    if (!baseline) return;

    if (baseline.turn) {
      await goveeControlThrottled({ name: "turn", value: baseline.turn });
    }

    if (baseline.color) {
      await goveeControlThrottled({ name: "color", value: baseline.color });
    } else if (typeof baseline.colorTem === "number") {
      await goveeControlThrottled({ name: "colorTem", value: baseline.colorTem });
    }

    if (typeof baseline.brightness === "number") {
      await goveeControlThrottled({ name: "brightness", value: clampBrightness(baseline.brightness) });
    }
  }

  /**
   * BOLD EFFECT PHILOSOPHY
   * - Use high brightness briefly (100)
   * - Big color changes (red/white/blue/purple/neon green)
   * - 4–7 commands per effect to avoid 429
   * - Always restore baseline
   */
  async function triggerEffect(effectId) {
    if (!goveeEnabled) return;
    if (!deviceId || !model) return;
    if (effectLock.current) return;

    effectLock.current = true;

    try {
      switch (effectId) {
        // DAMAGE: hot red/orange hit, then snap back
        case "DMG_SMALL": {
          await setOn();
          await setColor(rgb(255, 60, 0)); // punch orange
          await setBright(100);
          await sleep(140);
          await setColor(rgb(255, 0, 0)); // red snap
          await sleep(140);
          await setBright(35);
          break;
        }

        case "DMG_MED": {
          await setOn();
          await setColor(rgb(255, 0, 0));
          await setBright(100);
          await sleep(120);
          await setColor(rgb(255, 120, 0));
          await sleep(120);
          await setColor(rgb(255, 0, 0));
          await sleep(120);
          await setBright(20);
          break;
        }

        case "DMG_BIG": {
          // Red alarm: BRIGHT -> DIM -> BRIGHT, 2 fast beats
          await setOn();
          await setColor(rgb(255, 0, 0));
          await setBright(100);
          await sleep(120);
          await setBright(5);
          await sleep(150);
          await setBright(100);
          await sleep(120);
          await setBright(5);
          await sleep(150);
          await setBright(100);
          break;
        }

        // GAIN LIFE: neon green bloom (bright green → teal → bright)
        case "GAIN_LIFE": {
          await setOn();
          await setColor(rgb(0, 255, 120));
          await setBright(20);
          await sleep(140);
          await setBright(100);
          await sleep(180);
          await setColor(rgb(0, 220, 255)); // teal shimmer
          await sleep(180);
          await setBright(70);
          break;
        }

        // BOARD WIPE: whiteout flash then blackout moment then soft return
        case "BOARD_WIPE": {
          await setOn();
          await setColor(rgb(255, 255, 255));
          await setBright(100);
          await sleep(180);
          await setBright(1);
          await sleep(260);
          await setBright(100);
          await sleep(120);
          await setBright(25);
          break;
        }

        // COMMANDER CAST: gold flare (warm gold + brightness slam)
        case "COMMANDER_CAST": {
          await setOn();
          await setColor(rgb(255, 190, 40)); // gold
          await setBright(100);
          await sleep(150);
          await setColor(rgb(255, 90, 0)); // ember
          await sleep(150);
          await setBright(45);
          break;
        }

        // COUNTER WAR: crisp blue strobe
        case "COUNTER_WAR": {
          await setOn();
          await setColor(rgb(0, 160, 255));
          await setBright(100);
          await sleep(110);
          await setBright(10);
          await sleep(110);
          await setBright(100);
          await sleep(110);
          await setBright(10);
          await sleep(110);
          await setBright(100);
          break;
        }

        // EXTRA TURN: purple “time warp” pulse
        case "EXTRA_TURN": {
          await setOn();
          await setColor(rgb(170, 0, 255));
          await setBright(100);
          await sleep(160);
          await setColor(rgb(80, 0, 255));
          await sleep(160);
          await setColor(rgb(255, 0, 255));
          await sleep(160);
          await setBright(30);
          break;
        }

        // PLAYER OUT: deep red fade (ominous, obvious)
        case "PLAYER_OUT": {
          await setOn();
          await setColor(rgb(180, 0, 0));
          await setBright(100);
          await sleep(200);
          await setBright(30);
          await sleep(250);
          await setBright(10);
          break;
        }

        // BIG SPELL: rainbow slam (4 colors quickly, bright)
        case "BIG_SPELL": {
          await setOn();
          await setBright(100);
          await setColor(rgb(255, 0, 0));
          await sleep(120);
          await setColor(rgb(255, 160, 0));
          await sleep(120);
          await setColor(rgb(0, 255, 120));
          await sleep(120);
          await setColor(rgb(0, 160, 255));
          await sleep(120);
          await setColor(rgb(170, 0, 255));
          await sleep(120);
          await setBright(40);
          break;
        }

        default:
          break;
      }
    } finally {
      // restore the room lighting baseline after every effect
      await sleep(200);
      await restoreBaseline();
      await sleep(150);
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

          <button className="btn" onClick={() => triggerEffect("BIG_SPELL")}>
            Test Bold
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
          Effects are now intentionally loud. If you see 429 again, increase MIN_GAP_MS.
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
                <button key={fx.id} className="effect" onClick={() => triggerEffect(fx.id)}>
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
