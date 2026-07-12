import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  Activity,
  ArrowDownRight,
  Braces,
  Check,
  Gauge,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useReducedMotion } from "../hooks/useMotion";

const scenes = [
  {
    id: "live",
    number: "01",
    label: "Live",
    kicker: "50 HZ · LOCAL BRIDGE",
    title: "See what the car is saying.",
    body: "Position, gaps, fuel, hybrid, tyres, brakes, weather and standings become one measured race view—without touching the game process.",
  },
  {
    id: "analysis",
    number: "02",
    label: "Analysis",
    kicker: "DISTANCE ALIGNED",
    title: "Find the time. Understand why.",
    body: "Compare laps corner by corner. Every observation stays beside its telemetry evidence and confidence instead of disappearing into a score.",
  },
  {
    id: "strategy",
    number: "03",
    label: "Fuel + strategy",
    kicker: "LIVE SAMPLES · MANUAL FALLBACK",
    title: "Fuel the finish—not the guess.",
    body: "Learn consumption from clean LMU laps or enter it manually. See total fuel, opening load, stops, final stint and extra-lap risk with every assumption exposed.",
  },
  {
    id: "setups",
    number: "04",
    label: "Setups",
    kicker: "BACKUP · APPLY · ROLLBACK",
    title: "Change one thing. Keep your way back.",
    body: "Narrow, user-initiated setup writes create durable backups and recover atomically if anything fails. Experiment without gambling the baseline.",
  },
] as const;

function LivePanel() {
  const [focused, setFocused] = useState(0);
  const drivers = [
    { pos: "01", car: "A07", cls: "HYP", gap: "LEADER", fuel: "41.8 L" },
    { pos: "02", car: "R12", cls: "HYP", gap: "+1.842", fuel: "39.2 L" },
    { pos: "08", car: "V38", cls: "LMP2", gap: "+1 LAP", fuel: "33.6 L" },
  ];
  const markers = [
    { cx: 325, cy: 68 },
    { cx: 104, cy: 176 },
    { cx: 286, cy: 214 },
  ];

  return (
    <div className="live-panel panel-enter">
      <div className="track-card">
        <div className="panel-label">
          <span>SESSION MAP</span>
          <span className="signal-ok"><i /> RUNNING</span>
        </div>
        <svg className="circuit-map" viewBox="0 0 420 280" role="img" aria-label="Abstract circuit with three car positions">
          <path
            d="M55 179C28 115 66 38 151 35c44-2 55 47 96 36 43-11 86-37 119-4 29 29 6 73-22 93-33 24-25 62-65 83-52 28-109-3-145-27-30-20-63 1-79-37Z"
            className="circuit-shadow"
          />
          <path
            d="M55 179C28 115 66 38 151 35c44-2 55 47 96 36 43-11 86-37 119-4 29 29 6 73-22 93-33 24-25 62-65 83-52 28-109-3-145-27-30-20-63 1-79-37Z"
            className="circuit-line"
          />
          {markers.map((marker, index) => (
            <g key={index} className={focused === index ? "car-marker is-active" : "car-marker"}>
              <circle cx={marker.cx} cy={marker.cy} r="14" />
              <text x={marker.cx} y={marker.cy + 4}>{drivers[index].pos}</text>
            </g>
          ))}
        </svg>
        <div className="track-readout">
          <span>PORSCHE CURVES</span>
          <strong>287</strong>
          <span>KM/H</span>
        </div>
      </div>
      <div className="standings-card">
        <div className="panel-label"><span>RELATIVE</span><span>13:42:08</span></div>
        <div className="standings-head"><span>P</span><span>CAR</span><span>GAP</span><span>FUEL</span></div>
        {drivers.map((driver, index) => (
          <button
            type="button"
            key={driver.car}
            className={focused === index ? "driver-row is-active" : "driver-row"}
            onPointerEnter={() => setFocused(index)}
            onFocus={() => setFocused(index)}
            onClick={() => setFocused(index)}
            aria-label={`Focus car ${driver.car}, position ${driver.pos}`}
          >
            <strong>{driver.pos}</strong>
            <span><b>{driver.car}</b><small>{driver.cls}</small></span>
            <span>{driver.gap}</span>
            <span>{driver.fuel}</span>
          </button>
        ))}
        <div className="live-metrics">
          <div><span>TYRE AVG</span><strong>86°</strong></div>
          <div><span>ENERGY</span><strong>72%</strong></div>
          <div><span>LAPS</span><strong>42</strong></div>
        </div>
      </div>
    </div>
  );
}

const samples = Array.from({ length: 81 }, (_, index) => {
  const t = index / 80;
  const corner = Math.pow(Math.sin(t * Math.PI * 3.1), 8);
  const compression = Math.pow(Math.sin((t + 0.13) * Math.PI * 5.2), 12);
  const reference = 0.77 - corner * 0.48 - compression * 0.22 + Math.sin(t * 18) * 0.025;
  const current = reference - Math.exp(-Math.pow((t - 0.61) * 14, 2)) * 0.14 + Math.sin(t * 11) * 0.018;
  return { reference, current };
});

function makePath(values: number[], width = 800, height = 250) {
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - value * height;
      return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function AnalysisPanel() {
  const [sample, setSample] = useState(49);
  const chartRef = useRef<HTMLDivElement>(null);
  const referencePath = useMemo(() => makePath(samples.map((value) => value.reference)), []);
  const currentPath = useMemo(() => makePath(samples.map((value) => value.current)), []);
  const point = samples[sample];
  const x = (sample / (samples.length - 1)) * 800;
  const speed = Math.round(164 + point.current * 181);
  const referenceSpeed = Math.round(164 + point.reference * 181);
  const deltaSeconds = (point.reference - point.current) * 1.82;
  const delta = `${deltaSeconds >= 0 ? "+" : "−"}${Math.abs(deltaSeconds).toFixed(3)}`;

  const selectFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = chartRef.current?.getBoundingClientRect();
    if (!box) return;
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    setSample(Math.round(ratio * (samples.length - 1)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setSample((value) => Math.min(Math.max(value + (event.key === "ArrowRight" ? 1 : -1), 0), samples.length - 1));
  };

  return (
    <div className="analysis-panel panel-enter">
      <div className="analysis-summary">
        <div><span>REFERENCE</span><strong>03:28.914</strong></div>
        <ArrowDownRight size={18} />
        <div><span>CURRENT</span><strong>03:29.281</strong></div>
        <div className="delta-loss"><span>DELTA HERE</span><strong>{delta}</strong></div>
      </div>
      <div
        ref={chartRef}
        className="telemetry-chart"
        onPointerMove={selectFromPointer}
        onPointerDown={selectFromPointer}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="slider"
        aria-label="Telemetry comparison position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((sample / (samples.length - 1)) * 100)}
        aria-valuetext={`${speed} kilometres per hour, ${Math.abs(deltaSeconds).toFixed(3)} seconds ${deltaSeconds >= 0 ? "lost" : "gained"}`}
      >
        <div className="chart-labels"><span>SPEED / KMH</span><span>POINTER OR ARROW KEYS TO SCRUB</span></div>
        <svg viewBox="0 0 800 250" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="analysis-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b9f34a" stopOpacity="0.16" />
              <stop offset="1" stopColor="#b9f34a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-grid" d="M0 50H800M0 100H800M0 150H800M0 200H800M160 0V250M320 0V250M480 0V250M640 0V250" />
          <path className="trace trace-reference" d={referencePath} />
          <path className="trace trace-current" d={currentPath} />
          <path className="scrub-line" d={`M${x} 0V250`} />
          <circle className="scrub-point" cx={x} cy={250 - point.current * 250} r="6" />
        </svg>
        <input
          className="sr-only"
          type="range"
          min="0"
          max={samples.length - 1}
          value={sample}
          onChange={(event) => setSample(Number(event.target.value))}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      <div className="analysis-readout">
        <div><span>POSITION</span><strong>{(sample / 8).toFixed(1)} KM</strong></div>
        <div><span>YOUR SPEED</span><strong>{speed}</strong></div>
        <div><span>REFERENCE</span><strong>{referenceSpeed}</strong></div>
        <div className="evidence-chip"><Check size={14} /> HIGH CONFIDENCE</div>
      </div>
    </div>
  );
}

const profiles = {
  safe: { label: "Safe", laps: 13, reserve: 2.4, risk: "LOW", stints: [25, 25, 25, 25] },
  balanced: { label: "Balanced", laps: 14, reserve: 1.2, risk: "MED", stints: [27, 25, 24, 24] },
  attack: { label: "Attack", laps: 15, reserve: 0.5, risk: "HIGH", stints: [29, 27, 23, 21] },
} as const;

type ProfileKey = keyof typeof profiles;

function StrategyPanel() {
  const [profileKey, setProfileKey] = useState<ProfileKey>("balanced");
  const profile = profiles[profileKey];

  return (
    <div className="strategy-panel panel-enter">
      <div className="strategy-controls">
        <div>
          <span className="panel-label">RACE POSTURE</span>
          <div className="segmented" role="group" aria-label="Race posture">
            {(Object.keys(profiles) as ProfileKey[]).map((key) => (
              <button
                type="button"
                key={key}
                className={profileKey === key ? "is-active" : ""}
                onClick={() => setProfileKey(key)}
                aria-pressed={profileKey === key}
              >
                {profiles[key].label}
              </button>
            ))}
          </div>
        </div>
        <span className="alpha-tag">ILLUSTRATIVE ALPHA MODEL</span>
      </div>
      <div className="race-clock"><span>04:00:00</span><i /><strong>00:47:12 REMAINING</strong></div>
      <div className="stint-timeline">
        {profile.stints.map((width, index) => (
          <div key={index} className={`stint stint-${index + 1}`} style={{ width: `${width}%` }}>
            <span>STINT {index + 1}</span><b>{index === 3 ? `${profile.laps} LAPS` : `${Math.round(width / 2)} LAPS`}</b>
          </div>
        ))}
      </div>
      <div className="strategy-metrics">
        <div><span>FINISH LAPS</span><strong>{56 + profile.laps}</strong><small>± 1 boundary</small></div>
        <div><span>FUEL RESERVE</span><strong>{profile.reserve.toFixed(1)} L</strong><small>editable target</small></div>
        <div><span>EXTRA-LAP RISK</span><strong className={`risk-${profileKey}`}>{profile.risk}</strong><small>modelled range</small></div>
      </div>
      <p className="model-note"><Braces size={15} /> Inputs, bounds and formulas remain visible. No magic number.</p>
    </div>
  );
}

const setupChanges = [
  { label: "Rear wing", from: "8", to: "7", effect: "More straight-line speed" },
  { label: "Brake bias", from: "54.2%", to: "53.8%", effect: "More rotation on entry" },
  { label: "Front ARB", from: "3", to: "4", effect: "Sharper direction change" },
] as const;

function SetupsPanel() {
  const [selected, setSelected] = useState(0);
  const change = setupChanges[selected];

  return (
    <div className="setups-panel panel-enter">
      <div className="setup-browser">
        <div className="panel-label"><span>BASELINE / LE MANS</span><span>READ · COMPARE · APPLY</span></div>
        {setupChanges.map((item, index) => (
          <button
            type="button"
            key={item.label}
            className={selected === index ? "setup-row is-active" : "setup-row"}
            onClick={() => setSelected(index)}
          >
            <span><SlidersHorizontal size={14} />{item.label}</span>
            <span className="setup-value">{item.from}</span>
            <span className="setup-arrow">→</span>
            <strong>{item.to}</strong>
          </button>
        ))}
        <div className="backup-status"><ShieldCheck size={16} /><span><b>BASELINE.SVM.BAK</b>Durable backup ready</span><Check size={16} /></div>
      </div>
      <div className="setup-detail">
        <span className="panel-label">ONE CHANGE PREVIEW</span>
        <div className="setup-dial"><i style={{ "--dial": `${selected * 30 - 30}deg` } as CSSProperties} /><b>{change.to}</b><span>{change.label}</span></div>
        <h4>{change.effect}</h4>
        <p>Apply only to a user-selected LMU settings folder. If the write fails, Apex restores the baseline.</p>
        <button type="button" className="rollback-button"><RotateCcw size={15} /> Rollback always available</button>
      </div>
    </div>
  );
}

function ProductPanel({ active }: { active: number }) {
  return (
    <div id="product-panel" role="tabpanel" aria-labelledby={`product-tab-${scenes[active].id}`}>
      {active === 0 && <LivePanel />}
      {active === 1 && <AnalysisPanel />}
      {active === 2 && <StrategyPanel />}
      {active === 3 && <SetupsPanel />}
    </div>
  );
}

export default function ProductTheatre() {
  const storyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      if (reduced || window.matchMedia("(max-width: 900px)").matches) return;
      const box = story.getBoundingClientRect();
      const travel = Math.max(box.height - window.innerHeight, 1);
      const progress = Math.min(Math.max(-box.top / travel, 0), 1);
      if (frameRef.current) {
        frameRef.current.style.transform = `perspective(1200px) rotateX(${((0.5 - progress) * 1).toFixed(3)}deg)`;
      }
      setActive(Math.min(Math.floor(progress * scenes.length), scenes.length - 1));
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, [reduced]);

  const selectScene = (index: number) => {
    setActive(index);
    const story = storyRef.current;
    if (!story || window.matchMedia("(max-width: 900px)").matches) return;
    const box = story.getBoundingClientRect();
    const pageTop = window.scrollY + box.top;
    const travel = Math.max(story.offsetHeight - window.innerHeight, 0);
    const target = pageTop + (index / Math.max(scenes.length - 1, 1)) * travel;
    window.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });
  };

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % scenes.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + scenes.length) % scenes.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = scenes.length - 1;
    else return;

    event.preventDefault();
    selectScene(next);
    window.requestAnimationFrame(() => document.getElementById(`product-tab-${scenes[next].id}`)?.focus());
  };

  const scene = scenes[active];

  return (
    <section id="product" className="product-section">
      <div className="section-intro container" data-reveal>
        <p className="eyebrow eyebrow--lime"><Activity size={15} /> ONE SIGNAL · FOUR DECISIONS</p>
        <h2>A pit wall you can<br /><em>look inside.</em></h2>
        <p>Scroll through the race—or take control. Every screen is designed to answer one question quickly, with the evidence still attached.</p>
      </div>

      <div ref={storyRef} className="product-story">
        <div className="product-sticky container">
          <div className="scene-copy" aria-live="polite">
            <span className="scene-number">{scene.number} / 04</span>
            <p>{scene.kicker}</p>
            <h3>{scene.title}</h3>
            <p>{scene.body}</p>
            <div className="scene-progress" aria-hidden="true">
              {scenes.map((item, index) => <i key={item.id} className={index <= active ? "is-active" : ""} />)}
            </div>
          </div>

          <div ref={frameRef} className="product-frame">
            <div className="product-frame__bar">
              <div className="window-controls" aria-hidden="true"><i /><i /><i /></div>
              <span><img src="/apex-mark.svg" alt="" /> APEX / RACE VIEW</span>
              <span className="frame-status"><i /> LOCAL</span>
            </div>
            <div className="product-tabs" role="tablist" aria-label="Apex product views">
              {scenes.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`product-tab-${item.id}`}
                  aria-selected={active === index}
                  aria-controls="product-panel"
                  tabIndex={active === index ? 0 : -1}
                  className={active === index ? "is-active" : ""}
                  onClick={() => selectScene(index)}
                  onKeyDown={(event) => moveTabFocus(event, index)}
                >
                  <span>{item.number}</span>{item.label}
                </button>
              ))}
            </div>
            <div className="product-frame__body">
              <ProductPanel active={active} />
            </div>
            <div className="frame-footer">
              <span><Gauge size={13} /> 20 HZ UI</span>
              <span><ShieldCheck size={13} /> OUT OF PROCESS</span>
              <span><Braces size={13} /> INSPECTABLE</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
