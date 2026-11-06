// Exact damping law from the owner's reference website (dt in seconds).
export const cursorDamping = 0.0003;
export function dampingAlpha(elapsedMs: number) {
  return 1 - Math.pow(cursorDamping, Math.min(Math.max(elapsedMs / 1000, 0), 0.05));
}
