import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { dampingAlpha } from "./damping";

const hotZones = "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[role='button'],[role='tab'],[tabindex]:not([tabindex='-1']),label,[data-cursor-hot]";
export function CursorFollower({ active }: { active: boolean }) {
  const dot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const element = dot.current;
    if (!active || !element) return;
    let frame = 0, last = 0, visible = false;
    let x = -100, y = -100, targetX = -100, targetY = -100;
    const paint = () => { element.style.transform = `translate(${x - element.offsetWidth / 2}px,${y - element.offsetHeight / 2}px)`; };
    function tick(time: number) {
      const elapsed = last ? time - last : 1000 / 60;
      last = time;
      const alpha = dampingAlpha(elapsed);
      x += (targetX - x) * alpha;
      y += (targetY - y) * alpha;
      paint();
      if (visible && Math.hypot(targetX - x, targetY - y) > 0.01) frame = requestAnimationFrame(tick);
      else { frame = 0; last = 0; }
    }
    function hide() {
      visible = false;
      element!.dataset.visible = "false";
      document.documentElement.dataset.cursorReady = "false";
      cancelAnimationFrame(frame);
      frame = 0; last = 0;
    }
    function move(event: PointerEvent) {
      if (!fine.matches || reduced.matches || event.pointerType === "touch" || document.hidden) { hide(); return; }
      targetX = event.clientX; targetY = event.clientY;
      element!.dataset.hot = event.target instanceof Element && event.target.closest(hotZones) ? "true" : "false";
      visible = true;
      element!.dataset.visible = "true";
      document.documentElement.dataset.cursorReady = "true";
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
    }
    const out = (event: PointerEvent) => { if (!event.relatedTarget) hide(); };
    const keyboard = () => hide();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", out);
    document.documentElement.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", keyboard);
    document.addEventListener("visibilitychange", hide);
    fine.addEventListener("change", hide);
    reduced.addEventListener("change", hide);
    return () => {
      hide();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", out);
      document.documentElement.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", keyboard);
      document.removeEventListener("visibilitychange", hide);
      fine.removeEventListener("change", hide);
      reduced.removeEventListener("change", hide);
    };
  }, [active]);
  return createPortal(<div ref={dot} className="cursor-follower" aria-hidden="true" data-visible="false" />, document.body);
}
