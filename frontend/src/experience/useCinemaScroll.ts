import { useEffect } from "react";
import type { RefObject } from "react";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

// Native scroll is the only playhead. Scenes land before handing off.
// Request a frame only on scroll/resize, with no wheel interception.
export function useCinemaScroll(root: RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    const element = root.current;
    if (!active || !element) return;
    const motion = matchMedia("(prefers-reduced-motion: no-preference)");
    const desktop = matchMedia("(min-width: 901px) and (min-height: 760px)");
    const opening = element.querySelector<HTMLElement>(".cinema-opening")!;
    const problem = element.querySelector<HTMLElement>(".cinema-problem")!;
    const explore = element.querySelector<HTMLElement>(".cinema-explore")!;
    let frame = 0;
    const render = () => {
      frame = 0;
      if (!motion.matches) return;
      const box = opening.getBoundingClientRect();
      const progress = desktop.matches ? clamp((64 - box.top) / Math.max(1, box.height - innerHeight + 64)) : 0;
      const move = smooth((progress - 0.12) / 0.7);
      opening.style.setProperty("--opening-shift", `${move * -15}vw`);
      opening.style.setProperty("--opening-counter", `${move * 23}vw`);
      opening.style.setProperty("--opening-fade", String(1 - smooth((progress - 0.64) / 0.3)));
      opening.style.setProperty("--ribbon-scale", String(1 + move * 0.65));
      opening.style.setProperty("--ribbon-turn", `${move * -38}deg`);
      opening.style.setProperty("--ribbon-travel", `${move * -16}vw`);
      opening.dataset.phase = progress < 0.12 ? "hold" : progress < 0.82 ? "travel" : "release";
      const relay = clamp((innerHeight - problem.getBoundingClientRect().top) / (innerHeight + problem.offsetHeight));
      problem.style.setProperty("--relay-travel", `${12 - relay * 40}%`);
      const arrival = smooth((innerHeight - explore.getBoundingClientRect().top) / (innerHeight * 0.7));
      explore.style.setProperty("--explore-arrival", `${(1 - arrival) * (desktop.matches ? 100 : 24)}px`);
      explore.style.setProperty("--explore-turn", `${(1 - arrival) * (desktop.matches ? -8 : 0)}deg`);
    };
    const update = () => { if (!frame) frame = requestAnimationFrame(render); };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    motion.addEventListener("change", update);
    render();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      motion.removeEventListener("change", update);
    };
  }, [root, active]);
}
