// Scroll Choreography scene bible: one playhead, overlapping handoffs,
// explicit reading holds, reversible rendering. No autonomous scene timing.
export const traceabilityBeats = {
  headline: [0, 0.16], recession: [0.16, 0.44],
  evidence: [0.34, 0.64], signature: [0.66, 0.88], release: [0.88, 1],
} as const;
function easeRange(progress: number, range: readonly [number, number]) {
  const t = Math.max(0, Math.min(1, (progress - range[0]) / (range[1] - range[0])));
  return t * t * (3 - 2 * t);
}
export function traceabilityPose(progress: number) {
  const title = easeRange(progress, traceabilityBeats.recession);
  const cards = easeRange(progress, traceabilityBeats.evidence);
  const signature = easeRange(progress, traceabilityBeats.signature);
  return {
    titleScale: 1 - title * 0.58, titleOpacity: 1 - title,
    cardsScale: 0.62 + cards * 0.38, cardsOpacity: cards,
    signatureOffset: 1 - signature,
    phase: progress < 0.16 ? "headline" : progress < 0.44 ? "recession" : progress < 0.66 ? "evidence" : progress < 0.88 ? "signature" : "release",
  };
}
