import type { Observation, SourceId } from "./contract";
export function chartSegments(
  observations: Observation[],
  sourceId: SourceId,
): Observation[][] {
  const segments: Observation[][] = [];
  let segment: Observation[] = [];
  for (const observation of observations.filter(
    (o) => o.sourceId === sourceId,
  )) {
    if (
      observation.value === null ||
      (segment.length &&
        Date.parse(observation.measuredAt) -
          Date.parse(segment.at(-1)!.measuredAt) >
          6000)
    ) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (observation.value !== null) segment.push(observation);
  }
  if (segment.length) segments.push(segment);
  return segments;
}
