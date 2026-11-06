import { expect, it } from "vitest";
import { traceabilityPose } from "./traceabilityTimeline";
it("holds the headline, overlaps the reveal, draws after landing and reverses without state", () => {
  expect(traceabilityPose(.1)).toMatchObject({titleOpacity: 1, cardsOpacity: 0, signatureOffset: 1});
  const handoff = traceabilityPose(.38);
  expect(handoff.titleOpacity).toBeGreaterThan(0);
  expect(handoff.cardsOpacity).toBeGreaterThan(0);
  expect(traceabilityPose(.65)).toMatchObject({titleOpacity: 0, cardsOpacity: 1, cardsScale: 1, signatureOffset: 1});
  expect(traceabilityPose(.95)).toMatchObject({signatureOffset: 0, phase: "release"});
  const forward = [.1,.3,.5,.7,.95].map(traceabilityPose);
  expect([.95,.7,.5,.3,.1].map(traceabilityPose).reverse()).toEqual(forward);
});
