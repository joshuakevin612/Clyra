import type { Source } from "./generated";
export function sourceParts(raw: string, source: Source) {
  const chars = Array.from(raw);
  if (
    source.charStart < 0 ||
    source.charEnd < source.charStart ||
    source.charEnd > chars.length
  )
    return null;
  const quote = chars.slice(source.charStart, source.charEnd).join("");
  return quote === source.quote
    ? {
        before: chars.slice(0, source.charStart).join(""),
        quote,
        after: chars.slice(source.charEnd).join(""),
      }
    : null;
}
