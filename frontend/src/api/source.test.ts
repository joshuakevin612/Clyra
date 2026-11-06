import { expect, it } from "vitest";
import { sourceParts } from "./source";
it("highlights the correct repeated quote using Unicode offsets", () => {
  const result = sourceParts("💊 same / same ", {
    documentId: "doc_a",
    page: 1,
    quote: "same ",
    charStart: 9,
    charEnd: 14,
  });
  expect(result).toEqual({ before: "💊 same / ", quote: "same ", after: "" });
});
it("refuses mismatched source spans instead of highlighting another occurrence", () => {
  expect(
    sourceParts("same / same", {
      documentId: "doc_a",
      page: 1,
      quote: "same",
      charStart: 5,
      charEnd: 9,
    }),
  ).toBeNull();
});
