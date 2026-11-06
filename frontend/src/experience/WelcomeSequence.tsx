import { traceabilityPose } from "./traceabilityTimeline";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
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

export function WelcomeSequence() {
  const { effective } = useExperience();
  const [selected, select] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const landing = useRef<HTMLDivElement>(null);
  useCinemaScroll(landing, effective === "cinematic");
  useEffect(() => {
    const element = stage.current;
    if (!element || effective !== "cinematic") return;
    let visible = false;
    const sync = () => { element.dataset.idlePaused = String(!visible || document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element); document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [effective]);
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
      section.dataset.phase = state.phase;
    };
    const draw = (now: number) => {
      current += (target-current)*(1-Math.exp(-(last ? now-last : 16)/120)); last=now;
      pose(current);
      if (Math.abs(target-current) > 0.0002) frame=requestAnimationFrame(draw);
      else {current=target;pose(current);frame=0;last=0;}
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
      const box=section.getBoundingClientRect();
      target=Math.max(0,Math.min(1,(64-box.top)/Math.max(1,box.height-innerHeight+64)));
      if(!frame)frame=requestAnimationFrame(draw);
    };
    update(); window.addEventListener("scroll",update,{passive:true}); window.addEventListener("resize",update);
    return () => {cancelAnimationFrame(frame);window.removeEventListener("scroll",update);window.removeEventListener("resize",update);world.style.removeProperty("transform");world.style.removeProperty("opacity");section.removeAttribute("data-scroll-ready");};
  }, [effective]);
  if (effective !== "cinematic") return null;
  const item = evidence[selected];
  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || !matchMedia("(pointer: fine)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    panel.current?.style.setProperty("--tilt-x", `${((event.clientY - box.top) / box.height - 0.5) * -7}deg`);
    panel.current?.style.setProperty("--tilt-y", `${((event.clientX - box.left) / box.width - 0.5) * 9}deg`);
  }
  function resetTilt() { panel.current?.style.setProperty("--tilt-x", "0deg"); panel.current?.style.setProperty("--tilt-y", "0deg"); }
  return <div ref={landing} className="cinema-landing">
    <div className="cinema-opening">
    <section className="cinema-hero" aria-labelledby="cinema-title">
      <nav className="cinema-nav" aria-label="Product navigation">
        <a className="cinema-wordmark" href="#cinema-title">clyra<span>Medication continuity</span></a>
        <div><a href="#cinema-story">The story</a><a href="#cinema-explore">Explore Clyra</a><a href="#main-content">Sign in <ArrowUpRight size={18} /></a></div>
      </nav>
      <div className="cinema-hero-body">
        <h1 id="cinema-title" aria-label="Care in context."><span aria-hidden="true">CARE.</span><span aria-hidden="true">IN</span><span aria-hidden="true">CONTEXT.</span></h1>
        <div className="cinema-hero-aside"><p>Records move.<br />Their context should too.</p><p>Clyra brings medication history, source evidence and synthetic telemetry into one clear clinical workflow.</p><a className="cinema-action" href="#main-content">Enter the workspace <ArrowUpRight /></a></div>
      </div>
      <div className="flow-hero-art" aria-hidden="true"><ContinuityRibbon /></div>
      <footer className="cinema-hero-footer"><span>Synthetic data. Real attention to evidence.</span><a href="#cinema-story">Follow the record <ArrowDown size={16} /></a></footer>
    </section>

    </div>
    <section className="cinema-problem" id="cinema-story" aria-labelledby="problem-title">
      <div className="cinema-word-relay" aria-hidden="true">RECORD. REVIEW. RELAY.</div>
      <div className="cinema-problem-copy"><h2 id="problem-title">A handover is more<br />than a list.</h2><p>A medication entry needs its source. A questionable reading needs an explanation. A new clinician needs the context that came before.</p><p>Clyra keeps those connections visible so people can review the evidence before making decisions.</p></div>
    </section>

    <LivingMarquee />

    <section ref={stage} className="cinema-orbit" aria-labelledby="orbit-title" data-idle-paused="true">
      <div className="cinema-orbit-stage">
        <div className="orbit-heading"><h2 id="orbit-title">EVERY CHANGE.<br />STILL TRACEABLE.</h2><p>Original evidence. A linked concern. A readable handover.</p></div>
        <div className="orbit-world" aria-hidden="true" onPointerMove={event => {
          if (event.pointerType === "touch") return;
          const box = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.translate = `${((event.clientX-box.left)/box.width-.5)*12}px ${((event.clientY-box.top)/box.height-.5)*8}px`;
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
      <header><h2 id="explore-title">DON’T JUST<br />FLAG IT. EXPLAIN IT.</h2><p>Explore how the pieces fit together. This is an illustrative walkthrough, separate from patient records.</p></header>
      <div className="explore-layout">
        <div className="explore-copy">
          <div className="explore-tabs" role="tablist" aria-label="Evidence walkthrough">
            {evidence.map((entry, index) => <button type="button" key={entry.name} role="tab" id={`walkthrough-tab-${index}`} aria-selected={selected === index} aria-controls="walkthrough-panel"
              tabIndex={selected === index ? 0 : -1} onClick={() => select(index)} onKeyDown={event => {
                const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
                if (next !== null) { event.preventDefault(); select(next); document.getElementById(`walkthrough-tab-${next}`)?.focus(); }
              }}>{entry.name}<ArrowUpRight size={18} /></button>)}
          </div>
          <div id="walkthrough-panel" role="tabpanel" aria-labelledby={`walkthrough-tab-${selected}`}><h3>{item.title}</h3><p>{item.body}</p></div>
          <p className="cinema-qualification"><ShieldCheck size={18} />Data-quality flags are not a diagnosis.</p>
        </div>
        <div className="explore-art" onPointerMove={tilt} onPointerLeave={resetTilt}>
          <div ref={panel} key={selected} className="explore-specimen" aria-hidden="true" data-cursor-hot>
            <span>{item.label}</span><strong>{item.name}.</strong><div>{item.lines.map((line, index) => <p key={line}><span>{index + 1}</span>{line}<ArrowUpRight size={20} /></p>)}</div><small>Clyra / Illustrative product walkthrough</small>
          </div>
        </div>
      </div>
    </section>

    <section className="cinema-close" aria-labelledby="close-title"><h2 id="close-title">THE NEXT PERSON<br />GETS THE WHOLE STORY.</h2><div><p>Review medication records. Inspect synthetic observations. Follow the evidence into the next handover.</p><a className="cinema-action" href="#main-content">Try Clyra <ArrowUpRight /></a></div><span>Synthetic demonstration — not a connected medical device.</span></section>
  </div>;
}
