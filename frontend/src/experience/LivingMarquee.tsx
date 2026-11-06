import { useEffect, useRef } from "react";

export function LivingMarquee() {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    let visible = false;
    const sync = () => { target.dataset.paused = String(!visible || document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(target); document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);
  return <div ref={element} className="flow-marquee" aria-hidden="true" data-paused="true"><div>
    {[0, 1].map(n => <span key={n}>SOURCE <i /> REVIEW <i /> RELAY <i /> CONTEXT <i /></span>)}
  </div></div>;
}
