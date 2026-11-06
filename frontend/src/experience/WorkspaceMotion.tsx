import { useEffect, useRef } from "react";
import { ContinuityRibbon } from "./ContinuityRibbon";
import { useExperience } from "./Experience";

export function WorkspaceMotion() {
  const { effective } = useExperience();
  const ticker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ticker.current;
    if (!element) return;
    const sync = () => { element.dataset.paused = String(document.hidden); };
    sync(); document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [effective]);
  if (effective !== "cinematic") return null;
  return <>
    <div className="workspace-ribbon" aria-hidden="true"><ContinuityRibbon compact /></div>
    <div ref={ticker} className="workspace-motion-strip" aria-hidden="true"><div>
      {[0, 1].map(n => <span key={n}>CLYRA <i /> SOURCE. REVIEW. RELAY. <i /> SYNTHETIC WORKSPACE <i /></span>)}
    </div></div>
  </>;
}
