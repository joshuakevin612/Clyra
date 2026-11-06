import { describe, expect, it } from "vitest";
import { applyEdit } from "./edit";

describe("on-screen keyboard edits", () => {
  it("inserts at the caret and replaces a selection", () => {
    expect(applyEdit("abc", 1, 1, "X")).toEqual({ value: "aXbc", caret: 2 });
    expect(applyEdit("abc", 0, 3, "Z")).toEqual({ value: "Z", caret: 1 });
  });
  it("backspace deletes one character or the selection", () => {
    expect(applyEdit("abc", 2, 2, "Backspace")).toEqual({ value: "ac", caret: 1 });
    expect(applyEdit("abc", 0, 2, "Backspace")).toEqual({ value: "c", caret: 0 });
    expect(applyEdit("abc", 0, 0, "Backspace")).toEqual({ value: "abc", caret: 0 });
  });
  it("respects maxLength", () => {
    expect(applyEdit("ab", 2, 2, "c", 2)).toEqual({ value: "ab", caret: 2 });
  });
});
