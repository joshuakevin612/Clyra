import { useEffect } from "react";
import type { RefObject } from "react";

const clamp = (value: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const CHAPTERS = ["cinema-title", "cinema-story", "cinema-trace", "cinema-explore", "cinema-close"];

/**
 * Native scroll is the only playhead. One rAF-batched pass writes CSS variables
 * (never layout properties) for every scene, plus a damped scroll-velocity value
 * that drives skew and marquee speed. No wheel interception; reversible.
 *
 * Score (desktop):
 *   Arrival  0-12% hold · 12-82% ribbon travel + line split · 82-100% release
 *   Relay    rows slide in opposition across the section's whole pass, skewed by velocity
 *   Trace    pinned stage (see WelcomeSequence) · Explore  specimen rises and levels
 *   Close    words resolve one by one as the section arrives; calm end frame
 */
export function useCinemaScroll(root: RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    const element = root.current;
    if (!active || !element) return;
    const motion = matchMedia("(prefers-reduced-motion: no-preference)");
    const desktop = matchMedia("(min-width: 901px) and (min-height: 760px)");
    const opening = element.querySelector<HTMLElement>(".cinema-opening")!;
    const relay = element.querySelector<HTMLElement>(".cinema-problem")!;
    const explore = element.querySelector<HTMLElement>(".cinema-explore")!;
    const close = element.querySelector<HTMLElement>(".au-close")!;
    const words = Array.from(close.querySelectorAll<HTMLElement>(".au-word"));
    const marquees = Array.from(element.querySelectorAll<HTMLElement>(".flow-marquee > div"));
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>(".au-rail a"));
    const sections = CHAPTERS.map(id => document.getElementById(id));
    let frame = 0, lastY = scrollY, lastTime = performance.now(), velocity = 0, currentChapter = "";

    const render = (now: number) => {
      frame = 0;
      if (!motion.matches) return;
      const dt = Math.max(1, now - lastTime);
      const raw = (scrollY - lastY) / dt * 1000;           // px per second
      lastY = scrollY; lastTime = now;
      velocity += (raw - velocity) * (1 - Math.pow(0.002, dt / 1000)); // damped, frame-rate independent
      if (Math.abs(velocity) < 4 && Math.abs(raw) < 4) velocity = 0;

      const docHeight = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      element.style.setProperty("--page", String(clamp(scrollY / docHeight)));
      element.style.setProperty("--skew", `${clamp(velocity / 420, -6, 6).toFixed(3)}deg`);
      element.style.setProperty("--drift", clamp(velocity / 900, -1.5, 1.5).toFixed(3));

      // Arrival: type splits, ribbon travels, copy releases.
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

      // Relay: three rows pass through the viewport in opposition.
      const pass = clamp((innerHeight - relay.getBoundingClientRect().top) / (innerHeight + relay.offsetHeight));
      relay.style.setProperty("--relay-p", pass.toFixed(4));

      // Explore: the specimen rises and levels as the section arrives.
      const arrival = smooth((innerHeight - explore.getBoundingClientRect().top) / (innerHeight * 0.7));
      explore.style.setProperty("--explore-arrival", `${(1 - arrival) * (desktop.matches ? 100 : 24)}px`);
      explore.style.setProperty("--explore-turn", `${(1 - arrival) * (desktop.matches ? -8 : 0)}deg`);

      // Close: a reading reveal. The lowest opacity stays legible; the end frame is full.
      const read = clamp((innerHeight * 0.92 - close.getBoundingClientRect().top) / (innerHeight * 0.7));
      words.forEach((word, i) => {
        const t = clamp(read * (words.length + 4) - i, 0, 1);
        word.style.opacity = (0.34 + 0.66 * smooth(t)).toFixed(3);
      });

      // Marquees speed up with scroll speed and settle back.
      const boost = 1 + clamp(Math.abs(velocity) / 500, 0, 4);
      marquees.forEach(strip => strip.getAnimations().forEach(a => a.updatePlaybackRate(boost)));

      // Chapter rail.
      let index = 0;
      sections.forEach((section, i) => { if (section && section.getBoundingClientRect().top < innerHeight * 0.5) index = i; });
      const id = CHAPTERS[index];
      if (id !== currentChapter) {
        currentChapter = id;
        element.dataset.chapter = id;
        links.forEach(link => link.getAttribute("href") === `#${id}` ? link.setAttribute("aria-current", "true") : link.removeAttribute("aria-current"));
      }
      if (velocity !== 0) frame = requestAnimationFrame(render); // let the damped velocity settle
    };
    const update = () => { if (!frame) frame = requestAnimationFrame(render); };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    motion.addEventListener("change", update);
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      motion.removeEventListener("change", update);
      marquees.forEach(strip => strip.getAnimations().forEach(a => a.updatePlaybackRate(1)));
    };
  }, [root, active]);
}
