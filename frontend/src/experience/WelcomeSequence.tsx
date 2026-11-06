import { traceabilityPose } from "./traceabilityTimeline";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { ArrowDown, ArrowUpRight, FileText, Link2, ScanLine, ShieldCheck } from "lucide-react";
import { useExperience } from "./Experience";
import { ContinuityRibbon } from "./ContinuityRibbon";
import { LivingMarquee } from "./LivingMarquee";
import { useCinemaScroll } from "./useCinemaScroll";

const evidence = [
  { name: "Source", title: "Start with what was received.", body: "Original documents and synthetic observations stay available. Missing values remain missing; abnormal readings remain visible.", label: "Original evidence", lines: ["Source document", "Original instruction text", "Measurement and receipt times"] },
  { name: "Findings", title: "A concern with a paper trail.", body: "Deterministic backend rules flag missing, spiking, repeated, fluctuating, delayed and conflicting data. Each finding links back to its evidence.", label: "Data-quality review", lines: ["Finding and explanation", "Linked observations", "No automatic correction"] },
  { name: "Summary", title: "The context travels with the record.", body: "A readable telemetry handover brings source states, latest values and finding counts together. Copy the report exactly as displayed.", label: "Telemetry handover", lines: ["Source-linked values", "Finding counts", "Readable summary"] },
];
const chapters = [
  ["cinema-title", "Arrival"], ["cinema-story", "Relay"], ["cinema-trace", "Trace"], ["cinema-explore", "Explore"], ["cinema-close", "Begin"],
] as const;

/** Characters are masked and staggered; the accessible name lives on the parent. */
function Chars({ text, start = 0 }: { text: string; start?: number }) {
  return <>{Array.from(text).map((char, i) =>
    <span className="au-char" key={i} style={{ "--i": start + i } as CSSProperties}><span>{char === " " ? " " : char}</span></span>)}</>;
}
function Words({ text }: { text: string }) {
  return <>{text.split(" ").map((word, i) => <span className="au-word" key={i}>{word}</span>)}</>;
}

export function WelcomeSequence() {
  const { effective } = useExperience();
  const [selected, select] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const landing = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  useCinemaScroll(landing, effective === "cinematic");

  // Reveals: once, on arrival. Content is fully visible without JS.
  useEffect(() => {
    const root = landing.current;
    if (!root || effective !== "cinematic") return;
    root.dataset.js = "true";
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { (entry.target as HTMLElement).dataset.in = "true"; observer.unobserve(entry.target); }
    }), { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    root.querySelectorAll("[data-reveal]").forEach(node => observer.observe(node));
    return () => { observer.disconnect(); delete root.dataset.js; };
  }, [effective]);

  // Pointer: hero parallax and magnetic actions. Fine pointers only; transforms only.
  useEffect(() => {
    const root = landing.current;
    if (!root || effective !== "cinematic") return;
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const hero = root.querySelector<HTMLElement>(".cinema-hero");
    let magnet: HTMLElement | null = null;
    const move = (event: globalThis.PointerEvent) => {
      if (!fine.matches || event.pointerType === "touch") return;
      if (hero) {
        const box = hero.getBoundingClientRect();
        if (event.clientY >= box.top && event.clientY <= box.bottom) {
          hero.style.setProperty("--px", String(((event.clientX - box.left) / box.width - 0.5) * 2));
          hero.style.setProperty("--py", String(((event.clientY - box.top) / box.height - 0.5) * 2));
        }
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-magnetic]") : null;
      if (magnet && magnet !== target) { magnet.style.removeProperty("--mx"); magnet.style.removeProperty("--my"); }
      magnet = target;
      if (target) {
        const box = target.getBoundingClientRect();
        target.style.setProperty("--mx", `${((event.clientX - box.left) / box.width - 0.5) * 14}px`);
        target.style.setProperty("--my", `${((event.clientY - box.top) / box.height - 0.5) * 10}px`);
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [effective]);

  // Tab indicator: one persistent bar that glides between tabs.
  useEffect(() => {
    const list = tabs.current;
    if (!list || effective !== "cinematic") return;
    const place = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      list.style.setProperty("--tab-x", `${active.offsetLeft}px`);
      list.style.setProperty("--tab-w", String(active.offsetWidth));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    document.fonts?.ready.then(place);
    return () => observer.disconnect();
  }, [selected, effective]);

  useEffect(() => {
    const element = stage.current;
    if (!element || effective !== "cinematic") return;
    let visible = false;
    const sync = () => { element.dataset.idlePaused = String(!visible || document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element); document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [effective]);

  // Trace stage: headline recedes, evidence converges, signature draws. One playhead, damped.
  useEffect(() => {
    const section = stage.current;
    const world = section?.querySelector<HTMLElement>(".orbit-world");
    if (effective !== "cinematic" || !section || !world) return;
    let frame = 0, last = 0, current = 0, target = 0;
    const pose = (p: number) => {
      const state = traceabilityPose(p);
      section.style.setProperty("--title-scale", String(state.titleScale));
      section.style.setProperty("--title-opacity", String(state.titleOpacity));
      world.style.transform = `scale(${state.cardsScale})`;
      world.style.opacity = String(state.cardsOpacity);
      section.style.setProperty("--signature-offset", String(state.signatureOffset));
      section.style.setProperty("--evidence-travel", `${(1 - state.cardsOpacity) * 42}vw`);
      section.style.setProperty("--evidence-turn", `${(1 - state.cardsOpacity) * 18}deg`);
      section.style.setProperty("--trace", p.toFixed(4));
      section.dataset.phase = state.phase;
    };
    const draw = (now: number) => {
      current += (target - current) * (1 - Math.exp(-(last ? now - last : 16) / 120)); last = now;
      pose(current);
      if (Math.abs(target - current) > 0.0002) frame = requestAnimationFrame(draw);
      else { current = target; pose(current); frame = 0; last = 0; }
    };
    const update = () => {
      if (matchMedia("(max-width: 640px)").matches) {
        cancelAnimationFrame(frame); frame = 0; last = 0;
        world.style.removeProperty("transform");
        world.style.removeProperty("opacity");
        section.removeAttribute("data-scroll-ready");
        return;
      }
      section.dataset.scrollReady = "true";
      const box = section.getBoundingClientRect();
      target = Math.max(0, Math.min(1, (64 - box.top) / Math.max(1, box.height - innerHeight + 64)));
      if (!frame) frame = requestAnimationFrame(draw);
    };
    update(); window.addEventListener("scroll", update, { passive: true }); window.addEventListener("resize", update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); world.style.removeProperty("transform"); world.style.removeProperty("opacity"); section.removeAttribute("data-scroll-ready"); };
  }, [effective]);

  if (effective !== "cinematic") return null;
  const item = evidence[selected];
  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || !matchMedia("(pointer: fine)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height;
    panel.current?.style.setProperty("--tilt-x", `${(y - 0.5) * -9}deg`);
    panel.current?.style.setProperty("--tilt-y", `${(x - 0.5) * 11}deg`);
    panel.current?.style.setProperty("--glare-x", `${x * 100}%`);
    panel.current?.style.setProperty("--glare-y", `${y * 100}%`);
  }
  function resetTilt() {
    panel.current?.style.setProperty("--tilt-x", "0deg"); panel.current?.style.setProperty("--tilt-y", "0deg");
    panel.current?.style.setProperty("--glare-x", "30%"); panel.current?.style.setProperty("--glare-y", "10%");
  }
  return <div ref={landing} className="cinema-landing">
    <div className="au-progress" aria-hidden="true" />
    <nav className="au-rail" aria-label="Story chapters">
      {chapters.map(([id, label]) => <a key={id} href={`#${id}`}><i aria-hidden="true" /><span>{label}</span></a>)}
    </nav>

    <div className="cinema-opening">
      <section className="cinema-hero" aria-labelledby="cinema-title">
        <nav className="cinema-nav" aria-label="Product navigation">
          <a className="cinema-wordmark" href="#cinema-title">clyra<span>Medication continuity</span></a>
          <div><a href="#cinema-story">The story</a><a href="#cinema-explore">Explore Clyra</a><a className="cinema-nav-cta" href="#main-content" data-magnetic>Sign in <ArrowUpRight size={18} /></a></div>
        </nav>
        <div className="cinema-hero-body">
          <h1 id="cinema-title" aria-label="Care in context."><span aria-hidden="true"><Chars text="CARE." /></span><span aria-hidden="true"><Chars text="IN" start={5} /></span><span aria-hidden="true"><Chars text="CONTEXT." start={7} /></span></h1>
          <div className="cinema-hero-aside"><p>Records move.<br />Their context should too.</p><p>Clyra brings medication history, source evidence and synthetic telemetry into one clear clinical workflow.</p><a className="cinema-action" href="#main-content" data-magnetic><span>Enter the workspace</span><ArrowUpRight /></a></div>
        </div>
        <div className="flow-hero-art" aria-hidden="true"><ContinuityRibbon /></div>
        <footer className="cinema-hero-footer"><span><i className="au-live" aria-hidden="true" />Synthetic data. Real attention to evidence.</span><a href="#cinema-story">Follow the record <ArrowDown size={16} /></a></footer>
      </section>
    </div>

    <section className="cinema-problem" id="cinema-story" aria-labelledby="problem-title">
      <div className="au-relay" aria-hidden="true">
        <div className="au-relay-row" data-row="1">RECORD.</div>
        <div className="au-relay-row" data-row="2">REVIEW.</div>
        <div className="au-relay-row" data-row="3">RELAY.</div>
      </div>
      <div className="cinema-problem-copy">
        <h2 id="problem-title" data-reveal><span className="au-line"><span>A handover is more</span></span><span className="au-line"><span>than a list.</span></span></h2>
        <p data-reveal style={{ "--d": "120ms" } as CSSProperties}>A medication entry needs its source. A questionable reading needs an explanation. A new clinician needs the context that came before.</p>
        <p data-reveal style={{ "--d": "220ms" } as CSSProperties}>Clyra keeps those connections visible so people can review the evidence before making decisions.</p>
      </div>
    </section>

    <LivingMarquee />

    <section ref={stage} className="cinema-orbit" id="cinema-trace" aria-labelledby="orbit-title" data-idle-paused="true">
      <div className="cinema-orbit-stage">
        <svg className="au-rings" viewBox="0 0 800 800" aria-hidden="true"><circle cx="400" cy="400" r="380" /><circle cx="400" cy="400" r="300" /><circle cx="400" cy="400" r="220" /></svg>
        <div className="orbit-heading"><h2 id="orbit-title">EVERY CHANGE.<br />STILL TRACEABLE.</h2><p>Original evidence. A linked concern. A readable handover.</p></div>
        <div className="orbit-world" aria-hidden="true" onPointerMove={event => {
          if (event.pointerType === "touch") return;
          const box = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.translate = `${((event.clientX - box.left) / box.width - .5) * 22}px ${((event.clientY - box.top) / box.height - .5) * 14}px`;
        }} onPointerLeave={event => { event.currentTarget.style.translate = "0 0"; }}>
          <div className="orbit-paper orbit-original"><FileText /><span>SOURCE</span><strong>As received.</strong><i /><i /><i /><small>Original evidence preserved</small></div>
          <div className="orbit-thread"><Link2 /></div>
          <div className="orbit-paper orbit-finding"><ScanLine /><span>REVIEW</span><strong>With context.</strong><i /><i /><small>Concern linked to its source</small></div>
          <svg className="orbit-signature" viewBox="0 0 500 90"><path pathLength="1" d="M20 55 C90 -5 125 0 88 42 C48 83 128 78 162 40 C181 20 164 72 184 53 C224 5 202 72 232 44 C258 20 250 72 284 47 C324 14 301 70 336 48 C372 25 346 67 386 43 C440 8 420 64 480 28 M70 76 Q260 45 456 69" /></svg>
          <div className="orbit-stamp">EVIDENCE<br />STAYS WITH IT.</div>
        </div>
        <div className="orbit-caption"><span>Keep the source</span><span>Inspect the concern</span><span>Carry the context</span></div>
      </div>
    </section>

    <section className="cinema-explore" id="cinema-explore" aria-labelledby="explore-title">
      <header><h2 id="explore-title" data-reveal><span className="au-line"><span>DON’T JUST</span></span><span className="au-line"><span>FLAG IT. EXPLAIN IT.</span></span></h2><p data-reveal style={{ "--d": "160ms" } as CSSProperties}>Explore how the pieces fit together. This is an illustrative walkthrough, separate from patient records.</p></header>
      <div className="explore-layout">
        <div className="explore-copy">
          <div ref={tabs} className="explore-tabs" role="tablist" aria-label="Evidence walkthrough">
            {evidence.map((entry, index) => <button type="button" key={entry.name} role="tab" id={`walkthrough-tab-${index}`} aria-selected={selected === index} aria-controls="walkthrough-panel"
              tabIndex={selected === index ? 0 : -1} onClick={() => select(index)} onKeyDown={event => {
                const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
                if (next !== null) { event.preventDefault(); select(next); document.getElementById(`walkthrough-tab-${next}`)?.focus(); }
              }}>{entry.name}<ArrowUpRight size={18} /></button>)}
            <b className="explore-indicator" aria-hidden="true" />
          </div>
          <div id="walkthrough-panel" role="tabpanel" aria-labelledby={`walkthrough-tab-${selected}`} key={selected}><h3>{item.title}</h3><p>{item.body}</p></div>
          <p className="cinema-qualification"><ShieldCheck size={18} />Data-quality flags are not a diagnosis.</p>
        </div>
        <div className="explore-art" onPointerMove={tilt} onPointerLeave={resetTilt}>
          <div ref={panel} key={selected} className="explore-specimen" aria-hidden="true" data-cursor-hot>
            <span>{item.label}</span><strong>{item.name}.</strong><div>{item.lines.map((line, index) => <p key={line} style={{ "--row": index } as CSSProperties}><span>{index + 1}</span>{line}<ArrowUpRight size={20} /></p>)}</div><small>Clyra / Illustrative product walkthrough</small>
          </div>
        </div>
      </div>
    </section>

    <section className="au-close" id="cinema-close" aria-labelledby="close-title">
      <h2 id="close-title" aria-label="The next person gets the whole story."><span aria-hidden="true"><Words text="THE NEXT PERSON" /></span><span aria-hidden="true"><Words text="GETS THE WHOLE STORY." /></span></h2>
      <div className="au-close-row"><p data-reveal>Review medication records. Inspect synthetic observations. Follow the evidence into the next handover.</p><a className="cinema-action" href="#main-content" data-magnetic><span>Try Clyra</span><ArrowUpRight /></a></div>
      <span className="au-close-note">Synthetic demonstration — not a connected medical device.</span>
    </section>
  </div>;
}
