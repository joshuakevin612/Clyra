import { useEffect, useRef, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { isEditable, typeKey } from "./edit";
import type { Editable } from "./edit";
import "./keyboard.css";

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "_"],
  ["z", "x", "c", "v", "b", "n", "m", ".", "@"],
];
const SYMBOLS = ["!", "#", "$", "%", "&", "*", "(", ")", "+", "=", "/", ":", ",", "?"];

// Keeping focus in the field means pointer presses must not blur it.
const keep = (e: { preventDefault: () => void }) => e.preventDefault();

export function OnScreenKeyboard() {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(false);
  const [caps, setCaps] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const target = useRef<Editable | null>(null);
  const [hasTarget, setHasTarget] = useState(false);

  useEffect(() => {
    const track = (e: FocusEvent) => {
      const el = e.target as Element;
      if (el.closest?.(".osk")) return;
      if (isEditable(el)) {
        target.current = el;
        setHasTarget(true);
        if (document.documentElement.classList.contains("osk-open"))
          el.scrollIntoView({ block: "center" });
      }
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, []);
  useEffect(() => {
    // Reserve room so the panel never permanently covers form fields.
    document.documentElement.classList.toggle("osk-open", open);
    if (open) target.current?.scrollIntoView({ block: "center" });
    return () => document.documentElement.classList.remove("osk-open");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const upper = shift || caps;
  function press(key: string) {
    const el = target.current;
    if (!el || !document.contains(el)) return;
    el.focus();
    typeKey(el, upper && key.length === 1 ? key.toUpperCase() : key);
    if (shift) setShift(false);
  }
  function enter() {
    const el = target.current;
    if (!el || !document.contains(el)) return;
    el.focus();
    if (el instanceof HTMLTextAreaElement) typeKey(el, "\n");
    else el.form?.requestSubmit();
  }
  const char = (k: string) => (
    <button
      key={k}
      type="button"
      className="osk-key"
      onMouseDown={keep}
      onPointerDown={keep}
      onClick={() => press(k)}
    >
      {upper ? k.toUpperCase() : k}
    </button>
  );
  const action = (label: string, onPress: () => void, pressed?: boolean, text?: string) => (
    <button
      type="button"
      className="osk-key wide"
      aria-pressed={pressed}
      aria-label={label}
      onMouseDown={keep}
      onPointerDown={keep}
      onClick={onPress}
    >
      {text ?? label}
    </button>
  );

  return (
    <>
      <button
        type="button"
        className="osk-toggle"
        aria-expanded={open}
        aria-controls="osk-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <Keyboard size={18} aria-hidden="true" />
        <span>{open ? "Hide on-screen keyboard" : "On-screen keyboard"}</span>
      </button>
      {open && (
        <div id="osk-panel" className="osk" role="group" aria-label="On-screen keyboard">
          <div className="osk-head">
            <span role="status">
              {hasTarget ? "Typing into the last selected field." : "Select a text field first."}
            </span>
            <button type="button" className="osk-close" aria-label="Close on-screen keyboard" onClick={() => setOpen(false)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {(symbols ? [SYMBOLS.slice(0, 7), SYMBOLS.slice(7)] : ROWS).map((row, i) => (
            <div className="osk-row" key={i}>
              {row.map(char)}
            </div>
          ))}
          <div className="osk-row">
            {action("Shift", () => setShift((s) => !s), shift)}
            {action("Caps lock", () => setCaps((c) => !c), caps, "Caps")}
            {action(symbols ? "Letters" : "Symbols", () => setSymbols((s) => !s), undefined, symbols ? "ABC" : "#+=")}
            {action("Backspace", () => press("Backspace"), undefined, "⌫")}
          </div>
          <div className="osk-row">
            {action("Space", () => press(" "), undefined, "Space")}
            {action("Enter", enter)}
          </div>
        </div>
      )}
    </>
  );
}
