import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Code2,
  Download,
  FileCheck2,
  Github,
  Gauge,
  HardDrive,
  Menu,
  MonitorDown,
  MousePointer2,
  Radio,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Waves,
  X,
} from "lucide-react";
import { MagneticLink } from "./components/MagneticLink";
import ProductTheatre from "./components/ProductTheatre";
import { usePageMotion, useReducedMotion, useRevealObserver } from "./hooks/useMotion";
import { RELEASE } from "./release";

const URLS = {
  repository: RELEASE.repository,
  release: RELEASE.page,
  installer: RELEASE.installer,
  portable: RELEASE.portable,
  checksums: RELEASE.checksums,
};

const navItems = [
  { href: "#signal", label: "Signal" },
  { href: "#product", label: "Product" },
  { href: "#local", label: "How it works" },
  { href: "#trust", label: "Trust" },
  { href: "#roadmap", label: "Roadmap" },
];

function Header() {
  const [open, setOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const background = [
      document.querySelector<HTMLElement>(".skip-link"),
      document.querySelector<HTMLElement>("main"),
      document.querySelector<HTMLElement>(".site-footer"),
    ].filter((node): node is HTMLElement => Boolean(node));
    document.body.style.overflow = "hidden";
    background.forEach((node) => (node.inert = true));
    firstLinkRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      background.forEach((node) => (node.inert = false));
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <header className="site-header">
      <div className="nav-shell">
        <a className="brand" href="#top" aria-label="Apex home">
          <img src="/apex-mark.svg" alt="" />
          <span>APEX</span>
          <i>ALPHA</i>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
        </nav>
        <div className="nav-actions">
          <a className="nav-github" href={URLS.repository} target="_blank" rel="noreferrer" aria-label="View Apex on GitHub">
            <Github size={18} />
          </a>
          <a className="nav-download" href={URLS.installer}>
            Download alpha <ArrowDown size={15} />
          </a>
          <button
            type="button"
            className="menu-button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      <div
        id="mobile-menu"
        className="mobile-menu"
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label="Site navigation"
      >
        <div className="mobile-menu__inner">
          <p>OPEN RACE ENGINEERING</p>
          {navItems.map((item, index) => (
            <a
              ref={index === 0 ? firstLinkRef : undefined}
              href={item.href}
              key={item.href}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
            >
              <span>0{index + 1}</span>{item.label}<ArrowUpRight size={22} />
            </a>
          ))}
          <a className="mobile-menu__download" href={URLS.installer} tabIndex={open ? 0 : -1}>
            <Download size={18} /> Download {RELEASE.tag} alpha
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const posterRef = useRef<HTMLElement>(null);
  const windRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const update = () => {
      frame = 0;
      const node = heroRef.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      const travel = Math.max(node.offsetHeight - window.innerHeight, 1);
      const value = Math.min(Math.max(-box.top / travel, 0), 1);
      if (posterRef.current) posterRef.current.style.transform = `scale(${(1.04 + value * 0.07).toFixed(4)})`;
      if (windRef.current) windRef.current.style.opacity = (0.18 + value * 0.34).toFixed(4);
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    if (reduced) return;
    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const moveReticle = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = reticleRef.current;
    if (!node) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    node.dataset.active = "true";
    node.querySelector("span")!.textContent = `${Math.round((x / box.width) * 100).toString().padStart(2, "0")} · ${Math.round((y / box.height) * 100).toString().padStart(2, "0")}`;
  };

  const hideReticle = () => {
    if (reticleRef.current) reticleRef.current.dataset.active = "false";
  };

  return (
    <section ref={heroRef} id="top" className="hero">
      <div className="hero-sticky" onPointerMove={moveReticle} onPointerLeave={hideReticle}>
        <picture ref={posterRef} className="hero-poster" aria-hidden="true">
          <source srcSet="/media/hero-windtunnel.avif" type="image/avif" />
          <img src="/media/hero-windtunnel.webp" alt="" fetchPriority="high" />
        </picture>
        <div ref={windRef} className="hero-wind" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-reticle" ref={reticleRef} aria-hidden="true"><i /><span>50 · 50</span></div>

        <div className="hero-content container">
          <div className="hero-topline">
            <p><span className="pulse-dot" /> OPEN RACE ENGINEERING</p>
            <p>LOCAL / TRANSPARENT / YOURS</p>
          </div>
          <h1>
            <span>RACE ENGINEERING,</span>
            <span>WITHOUT THE</span>
            <span className="hero-accent">BLACK BOX.</span>
          </h1>
          <div className="hero-bottom">
            <div className="hero-actions">
              <MagneticLink className="button button--lime" href={URLS.installer}>
                <Download size={18} /> Download {RELEASE.tag} <ArrowDown size={16} />
              </MagneticLink>
              <MagneticLink className="button button--ghost" href={URLS.repository} target="_blank" rel="noreferrer">
                <Github size={18} /> View source <ArrowUpRight size={16} />
              </MagneticLink>
              <p>Windows 11 x64 · public prerelease<br />No admin required · unsigned alpha</p>
            </div>
            <p className="hero-intro">
              Live telemetry, deterministic driver debriefs, transparent strategy, safer setup handling and a focused race HUD—fully local and open source.
            </p>
          </div>
          <div className="hero-metrics" role="group" aria-label="Apex principles">
            <div><Radio size={16} /><span>READER</span><strong>50 HZ</strong></div>
            <div><CloudOff size={16} /><span>CLOUD</span><strong>0 B</strong></div>
            <div><Braces size={16} /><span>LICENSE</span><strong>GPL</strong></div>
          </div>
          <a href="#signal" className="scroll-cue"><span>FOLLOW THE SIGNAL</span><i><ArrowDown size={15} /></i></a>
        </div>
      </div>
    </section>
  );
}

function SignalSection() {
  return (
    <section id="signal" className="signal-section">
      <div className="signal-intro container" data-reveal>
        <p className="eyebrow"><Waves size={15} /> FROM RAW DATA TO RACE DECISIONS</p>
        <h2>One local signal.<br /><em>A clearer race.</em></h2>
        <p>Apex follows a simple rule: measure first, explain the model, and never pretend certainty that the data cannot support.</p>
      </div>
      <div className="signal-visual" data-reveal>
        <picture>
          <source srcSet="/media/signal-circuit.avif" type="image/avif" />
          <img src="/media/signal-circuit.webp" alt="An abstract race circuit dissolving into a telemetry waveform" loading="lazy" />
        </picture>
        <div className="signal-overlay container" aria-hidden="true">
          <span>START / SHARED MEMORY</span>
          <span>FINISH / EVIDENCE</span>
        </div>
        <div className="sector-ticks container" aria-hidden="true">
          <span>S1<i /></span><span>S2<i /></span><span>S3<i /></span><span>FIN<i /></span>
        </div>
      </div>
      <div className="principles-grid container">
        <article data-reveal style={{ "--delay": "0ms" } as CSSProperties}>
          <span>01</span><Gauge size={24} />
          <h3>Measured</h3>
          <p>Live state and recorded evidence stay distinct from estimates, defaults and generated examples.</p>
        </article>
        <article data-reveal style={{ "--delay": "90ms" } as CSSProperties}>
          <span>02</span><Code2 size={24} />
          <h3>Inspectable</h3>
          <p>Offsets, formulas, assumptions and confidence remain visible. Advice is a trail, not an oracle.</p>
        </article>
        <article data-reveal style={{ "--delay": "180ms" } as CSSProperties}>
          <span>03</span><HardDrive size={24} />
          <h3>Local</h3>
          <p>No account, telemetry upload, analytics, remote fonts, runtime CDN or cloud dependency.</p>
        </article>
      </div>
    </section>
  );
}

function ArchitectureStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);

  const tilt = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const stage = stageRef.current;
    const flow = flowRef.current;
    if (!stage || !flow) return;
    const box = stage.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width - 0.5) * 2;
    const y = ((event.clientY - box.top) / box.height - 0.5) * 2;
    flow.style.transform = `translate(-50%, -50%) rotateX(${(-y * 2.4).toFixed(2)}deg) rotateY(${(x * 3.8).toFixed(2)}deg)`;
  };

  const reset = () => {
    if (flowRef.current) flowRef.current.style.transform = "translate(-50%, -50%) rotateX(0deg) rotateY(0deg)";
  };

  return (
    <div ref={stageRef} className="architecture-stage" onPointerMove={tilt} onPointerLeave={reset} data-reveal>
      <div className="architecture-grid" aria-hidden="true" />
      <div className="architecture-cloud" role="img" aria-label="Cloud is not used"><CloudOff size={27} /><span>NO ROUTE</span></div>
      <div ref={flowRef} className="architecture-flow">
        <div className="architecture-node node-game">
          <span>01 / SOURCE</span><strong>LMU</strong><small>official shared memory</small>
        </div>
        <div className="architecture-link"><i /><span>READ ONLY</span></div>
        <div className="architecture-node node-bridge">
          <span>02 / BOUNDARY</span><strong>BRIDGE</strong><small>unprivileged process</small>
        </div>
        <div className="architecture-link"><i /><span>LOCAL IPC</span></div>
        <div className="architecture-node node-apex">
          <span>03 / YOUR PC</span><strong>APEX</strong><small>sandboxed interface</small>
        </div>
      </div>
      <div className="architecture-floor"><span>WINDOWS 11 / USER SPACE</span><span>0 BYTES UPLOADED</span></div>
    </div>
  );
}

function LocalSection() {
  return (
    <section id="local" className="local-section">
      <div className="local-heading container" data-reveal>
        <p className="eyebrow eyebrow--lime"><ShieldCheck size={15} /> LOCAL BY ARCHITECTURE</p>
        <h2>Your data has one<br />destination: <em>your PC.</em></h2>
      </div>
      <div className="local-layout container">
        <ArchitectureStage />
        <div className="local-copy" data-reveal>
          <p>Apex runs beside the game, never inside it. Native access lives behind a narrow boundary; raw recordings and analysis stay local; setup writes are explicit, backed up and reversible.</p>
          <ul>
            <li><span><Check size={14} /></span><div><strong>No injection</strong><small>Separate, unprivileged reader process</small></div></li>
            <li><span><Check size={14} /></span><div><strong>No account</strong><small>Start locally, even without a network</small></div></li>
            <li><span><Check size={14} /></span><div><strong>No hidden model</strong><small>Deterministic logic you can inspect</small></div></li>
            <li><span><Check size={14} /></span><div><strong>No lock-in</strong><small>GPL-3.0-or-later source</small></div></li>
          </ul>
          <a href={URLS.repository} target="_blank" rel="noreferrer" className="text-link">Inspect the architecture <ArrowUpRight size={16} /></a>
        </div>
      </div>
    </section>
  );
}

const proofStats = [
  { value: "45", label: "React + domain tests" },
  { value: "19", label: "Windows integration assertions" },
  { value: "17", label: "Portable lifecycle assertions" },
  { value: "28", label: "Non-elevated installer assertions" },
];

function TrustSection() {
  return (
    <section id="trust" className="trust-section">
      <div className="trust-heading container" data-reveal>
        <p className="eyebrow"><TestTube2 size={15} /> VALIDATION, NOT VIBES</p>
        <h2>Evidence before advice.<br /><em>Source before trust.</em></h2>
        <p>Apex is built in public. The validation surface is named precisely—so a passing test is never dressed up as proof from a real race.</p>
      </div>
      <div className="proof-layout container">
        <div className="product-proof" data-reveal>
          <div className="screenshot-shell screenshot-shell--back">
            <img src="/media/product/live-demo.avif" alt="Apex live pit wall in its clearly labelled generated demo mode" loading="lazy" />
          </div>
          <div className="screenshot-shell screenshot-shell--front">
            <div className="screenshot-bar"><i /><span>APEX / COMMAND CENTER</span><span>LOCAL</span></div>
            <img src="/media/product/command-center.avif" alt="Apex command center showing generated examples and offline status" loading="lazy" />
          </div>
          <div className="proof-stamp"><FileCheck2 size={20} /><span>TRUTHFUL UI</span><small>Generated content is labelled</small></div>
        </div>
        <div className="proof-copy" data-reveal>
          <div className="proof-stats">
            {proofStats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
          </div>
          <div className="proof-list">
            <p><CheckCircle2 size={17} /><span><b>Windows 11 VM</b>Secure Boot + TPM 2.0</span></p>
            <p><CheckCircle2 size={17} /><span><b>Automated release verification</b>At the {RELEASE.tag} release boundary</span></p>
            <p><CheckCircle2 size={17} /><span><b>No administrator requirement</b>Installer and portable lifecycle tested</span></p>
          </div>
          <MagneticLink className="button button--dark" href={URLS.repository} target="_blank" rel="noreferrer">
            <Github size={18} /> Read the source <ArrowUpRight size={16} />
          </MagneticLink>
        </div>
      </div>
    </section>
  );
}

const alphaItems = [
  { status: "validated", title: "Deterministic demo", copy: "Explore the live pit wall without the game or a network." },
  { status: "validated", title: "Windows package lifecycle", copy: "Installer and portable builds exercised in a Windows 11 VM." },
  { status: "validated", title: "Raw recording + private import", copy: "Capture 50 Hz .apexrec files and rebuild durable Analysis history locally through the current decoder." },
  { status: "validated", title: "Deterministic driver debrief", copy: "Compare a strict same-session lap cohort locally and inspect recurring measured differences—without AI or a causal claim." },
  { status: "open", title: "Current LMU compatibility", copy: "Still needs validation against a current real-game installation." },
  { status: "open", title: "EAC + online race", copy: "A fresh EAC-protected native drive remains open; shared memory has no authoritative online/offline field." },
];

function RoadmapSection() {
  return (
    <section id="roadmap" className="roadmap-section">
      <div className="roadmap-heading container" data-reveal>
        <p className="eyebrow eyebrow--amber"><Sparkles size={15} /> PUBLIC ALPHA / REAL BOUNDARIES</p>
        <h2>Built in public.<br /><em>Honest about the gap.</em></h2>
        <p>{RELEASE.tag} is a foundation, not a victory lap. These are the edges that matter before Apex can call itself race-proven.</p>
      </div>
      <div className="alpha-grid container">
        {alphaItems.map((item, index) => (
          <article key={item.title} data-reveal style={{ "--delay": `${(index % 3) * 70}ms` } as CSSProperties}>
            <span className={`alpha-status alpha-status--${item.status}`}>
              {item.status === "validated" ? <Check size={13} /> : <span>○</span>}
              {item.status === "validated" ? "VALIDATED SCOPE" : "OPEN VALIDATION"}
            </span>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
          </article>
        ))}
      </div>
      <div className="roadmap-note container" data-reveal>
        <p><ShieldCheck size={19} /> <strong>Unsigned prerelease.</strong> Windows SmartScreen may warn. Verify the published SHA-256 checksum before running the installer.</p>
        <a href={URLS.checksums} target="_blank" rel="noreferrer">View checksums <ArrowUpRight size={15} /></a>
      </div>
    </section>
  );
}

const installSteps = [
  { number: "01", icon: Download, title: "Download", copy: `Choose the ${RELEASE.tag} installer or portable ZIP from GitHub.` },
  { number: "02", icon: FileCheck2, title: "Verify", copy: "Match the file against the published SHA-256 checksum." },
  { number: "03", icon: MonitorDown, title: "Explore", copy: "Open the local demo first. No game or network connection required." },
];

function InstallSection() {
  return (
    <section id="download" className="install-section">
      <div className="install-card container" data-reveal>
        <div className="install-glow" aria-hidden="true" />
        <div className="install-heading">
          <p className="eyebrow"><span className="pulse-dot pulse-dot--dark" /> GREEN FLAG / {RELEASE.tag.toUpperCase()}</p>
          <h2>Take Apex for<br />a test lap.</h2>
          <p>Free forever. Open source. Fully local. Start with the deterministic demo and help close the gap to race-proven.</p>
          <div className="install-actions">
            <MagneticLink className="button button--black" href={URLS.installer}>
              <Download size={18} /> Download installer <ArrowDown size={16} />
            </MagneticLink>
            <MagneticLink className="button button--lime-ghost" href={URLS.portable}>
              Portable ZIP <ArrowDown size={16} />
            </MagneticLink>
          </div>
          <small>Windows 11 x64 · {RELEASE.version} public alpha · no admin · unsigned</small>
        </div>
        <div className="install-steps">
          {installSteps.map(({ number, icon: Icon, title, copy }) => (
            <div key={number}>
              <span>{number}</span><Icon size={21} />
              <h3>{title}</h3><p>{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqs = [
  ["Is Apex free?", "Yes. Apex is free software under GPL-3.0-or-later. There is no subscription, account tier or paid unlock."],
  ["Does it upload telemetry?", "No. Apex has no telemetry upload, analytics, advertising, remote fonts or runtime cloud service. Your data stays on your PC."],
  ["Does the driver debrief use AI?", "No. Deterministic local code compares complete, clean, officially timed, reference-eligible and exactly replayable laps from the same session. It reports measured associations to inspect, never a cause or promised gain."],
  ["Does it inject into Le Mans Ultimate?", "No. The integration is designed as a separate unprivileged reader targeting LMU’s official shared-memory surface."],
  ["Can I explore it without LMU?", "Yes. A deterministic multiclass demo makes the live pit wall and core workflows explorable locally, with no game or network required."],
  ["Is it production-ready?", `No. ${RELEASE.tag} is a public alpha. Current real-game compatibility, EAC, fullscreen and multi-hour race behavior still need validation.`],
  ["Why might Windows warn?", "The alpha binaries are not code-signed yet. Windows SmartScreen may show a warning; compare the file with the published SHA-256 checksum."],
] as const;

function FaqSection() {
  return (
    <section className="faq-section">
      <div className="faq-layout container">
        <div className="faq-heading" data-reveal>
          <p className="eyebrow"><MousePointer2 size={15} /> BEFORE THE OUT LAP</p>
          <h2>Good questions,<br />straight answers.</h2>
        </div>
        <div className="faq-list" data-reveal>
          {faqs.map(([question, answer], index) => (
            <details key={question} name="faq" open={index === 0}>
              <summary><span>0{index + 1}</span>{question}<ChevronDown size={19} /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top container">
        <a className="footer-brand" href="#top"><img src="/apex-mark.svg" alt="" /><span>APEX</span></a>
        <p>Race engineering,<br />without the black box.</p>
        <div className="footer-links">
          <div><span>EXPLORE</span>{navItems.slice(0, 4).map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</div>
          <div><span>PROJECT</span><a href={URLS.repository} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a><a href={URLS.release} target="_blank" rel="noreferrer">Release notes <ArrowUpRight size={12} /></a><a href={URLS.checksums} target="_blank" rel="noreferrer">Checksums <ArrowUpRight size={12} /></a></div>
        </div>
      </div>
      <div className="footer-bottom container">
        <span>© 2026 APEX · GPL-3.0-OR-LATER</span>
        <span>COMMUNITY PROJECT · NOT AFFILIATED WITH STUDIO 397 OR LE MANS ULTIMATE</span>
        <a href="#top">BACK TO GRID <ArrowRight size={13} /></a>
      </div>
    </footer>
  );
}

function PageRail() {
  return (
    <aside className="page-rail" aria-hidden="true">
      <span>RACE PROGRESS</span>
      <div className="page-rail__track"><i /></div>
      <div className="page-rail__sectors"><span>S1</span><span>S2</span><span>S3</span><span>FIN</span></div>
    </aside>
  );
}

export default function App() {
  usePageMotion();
  useRevealObserver();
  const reduced = useReducedMotion();

  return (
    <div className="app" data-reduced-motion={reduced ? "true" : "false"}>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="page-progress" aria-hidden="true" />
      <Header />
      <main id="main">
        <Hero />
        <SignalSection />
        <ProductTheatre />
        <LocalSection />
        <TrustSection />
        <RoadmapSection />
        <InstallSection />
        <FaqSection />
      </main>
      <Footer />
      <PageRail />
    </div>
  );
}
