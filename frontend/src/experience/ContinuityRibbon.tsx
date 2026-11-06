import { useEffect, useRef } from "react";

type Point = { x: number; y: number; z: number };
const ring = (u: number, v: number): Point => ({
  x: (1.35 + v * Math.cos(u / 2)) * Math.cos(u),
  y: (1.35 + v * Math.cos(u / 2)) * Math.sin(u),
  z: v * Math.sin(u / 2),
});
const mesh = Array.from({ length: 88 }, (_, i) => Array.from({ length: 6 }, (_, j) => {
  const u = i / 88 * Math.PI * 2, next = (i + 1) / 88 * Math.PI * 2;
  const v = -0.48 + j / 6 * 0.96, edge = -0.48 + (j + 1) / 6 * 0.96;
  return [ring(u, v), ring(next, v), ring(next, edge), ring(u, edge)];
})).flat();

export function ContinuityRibbon({ compact = false }: { compact?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d", { alpha: true });
    if (!element || !context) return;
    let frame = 0, previous = 0, angle = 0.4, width = 1, height = 1, visible = false;
    let targetX = 0, targetY = 0, pointerX = 0, pointerY = 0;
    let bounds = element.getBoundingClientRect();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(pointer: fine)");
    function size() {
      bounds = element!.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      element!.width = Math.round(width * ratio); element!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!frame) paint(0);
    }
    function rotate(p: Point): Point {
      const a = 0.65 + pointerY * 0.22, b = angle * 0.42 + pointerX * 0.3, c = Math.sin(angle * 0.3) * 0.15;
      const y = p.y * Math.cos(a) - p.z * Math.sin(a), z = p.y * Math.sin(a) + p.z * Math.cos(a);
      const x2 = p.x * Math.cos(b) + z * Math.sin(b), z2 = -p.x * Math.sin(b) + z * Math.cos(b);
      return { x: x2 * Math.cos(c) - y * Math.sin(c), y: x2 * Math.sin(c) + y * Math.cos(c), z: z2 };
    }
    function paint(elapsed: number) {
      angle += elapsed * (compact ? 0.00018 : 0.00026);
      const damp = 1 - Math.exp(-elapsed * 0.004);
      pointerX += (targetX - pointerX) * damp; pointerY += (targetY - pointerY) * damp;
      context!.clearRect(0, 0, width, height);
      const scale = Math.min(width, height) * 1.45;
      const faces = mesh.map(face => {
        const points = face.map(rotate);
        const a = points[0], b = points[1], c = points[3];
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
        const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz) || 1;
        const light = Math.abs((nx * -0.4 + ny * -0.55 + nz * 0.72) / length);
        return { points, z: points.reduce((sum, p) => sum + p.z, 0) / 4, light };
      }).sort((a, b) => a.z - b.z);
      for (const face of faces) {
        context!.beginPath();
        face.points.forEach((p, i) => {
          const perspective = scale / (4.6 - p.z);
          const x = width / 2 + p.x * perspective, y = height / 2 + p.y * perspective;
          if (i === 0) context!.moveTo(x, y); else context!.lineTo(x, y);
        });
        context!.closePath();
        // Lighting belongs to the geometric ribbon, never to text or chart data.
        // Midnight-blue shadow to aurum highlight, mixed in RGB so the mid-tones stay warm.
        const t = Math.pow(Math.min(1, face.light), 1.35);
        const color = `rgb(${Math.round(18 + t * 222)} ${Math.round(26 + t * 168)} ${Math.round(64 + t * 28)})`;
        context!.fillStyle = color;
        context!.strokeStyle = color;
        context!.lineWidth = 0.6;
        context!.fill(); context!.stroke();
      }
      element!.dataset.frame = String((Number(element!.dataset.frame) || 0) + 1);
    }
    function tick(time: number) {
      if (!visible || document.hidden || reduced.matches) { frame = 0; previous = 0; return; }
      if (!previous || time - previous >= 16) {
        paint(previous ? Math.min(time - previous, 50) : 1000 / 60);
        previous = time;
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      if (visible && !document.hidden && !reduced.matches && !frame) frame = requestAnimationFrame(tick);
      if ((!visible || document.hidden || reduced.matches) && frame) { cancelAnimationFrame(frame); frame = 0; previous = 0; }
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    const resize = new ResizeObserver(size);
    function move(event: PointerEvent) {
      if (!fine.matches || event.pointerType === "touch" || !visible) return;
      targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / width * 2 - 1));
      targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / height * 2 - 1));
    }
    function reset() { targetX = targetY = 0; }
    function scroll() { bounds = element!.getBoundingClientRect(); }
    observer.observe(element); resize.observe(element); size();
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", reset);
    window.addEventListener("scroll", scroll, { passive: true });
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
      window.removeEventListener("pointermove", move); window.removeEventListener("blur", reset);
      window.removeEventListener("scroll", scroll); document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [compact]);
  return <canvas ref={canvas} className="continuity-ribbon" aria-hidden="true" data-frame="0" />;
}
