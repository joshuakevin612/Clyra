export type Editable = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(["text", "password", "search", "email", "url", "tel", "number"]);
export function isEditable(el: Element | null): el is Editable {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  return (
    el instanceof HTMLInputElement &&
    TEXT_TYPES.has(el.type) &&
    !el.readOnly &&
    !el.disabled
  );
}

/** Pure text edit used by the keyboard (selection is a half-open range). */
export function applyEdit(
  value: string,
  start: number,
  end: number,
  key: string,
  maxLength = -1,
): { value: string; caret: number } {
  if (key === "Backspace") {
    if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
    if (start === 0) return { value, caret: 0 };
    return { value: value.slice(0, start - 1) + value.slice(end), caret: start - 1 };
  }
  const next = value.slice(0, start) + key + value.slice(end);
  if (maxLength >= 0 && next.length > maxLength) return { value, caret: start };
  return { value: next, caret: start + key.length };
}

/** Writes through the native setter so React-controlled inputs see the change. */
export function setNativeValue(el: Editable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function typeKey(el: Editable, key: string) {
  let start = el.value.length;
  let end = start;
  try {
    if (el.selectionStart !== null && el.selectionEnd !== null) {
      start = el.selectionStart;
      end = el.selectionEnd;
    }
  } catch {
    /* number/email inputs do not expose a selection */
  }
  const result = applyEdit(el.value, start, end, key, el.maxLength);
  if (result.value === el.value) return;
  setNativeValue(el, result.value);
  try {
    el.setSelectionRange(result.caret, result.caret);
  } catch {
    /* ignore for types without selection */
  }
}
