import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CursorFollower } from "./CursorFollower";

export type Experience = "cinematic" | "current" | "off";
function savedExperience(): Experience | null {
  try {
    const value = localStorage.getItem("clyra-experience");
    if (value === "cinematic" || value === "current" || value === "off") return value === "current" ? "off" : value;
    // An earlier explicit opt-out remains an opt-out.
    if (localStorage.getItem("clyra-motion") === "off") return "off";
  } catch { /* A preference must never be required to use Clyra. */ }
  return null;
}
type Settings = {
  mode: Experience; effective: Experience; reduced: boolean;
  choose: (mode: Experience) => void; toggle: () => void; configure: () => void;
};
const Context = createContext<Settings | null>(null);
export function useExperience() {
  const value = useContext(Context);
  if (!value) throw new Error("Experience provider missing");
  return value;
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(savedExperience);
  const [mode, setMode] = useState<Experience>(initial ?? "cinematic");
  const [open, setOpen] = useState(initial === null);
  const [chosen, setChosen] = useState(initial !== null);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  
  const effective = reduced || open || !chosen ? "off" : mode;
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = effective === "off" ? "off" : "on";
    document.documentElement.dataset.experience = effective;
    if (chosen) {
      try {
        localStorage.setItem("clyra-experience", mode);
        localStorage.setItem("clyra-motion", mode === "off" ? "off" : "on");
      } catch { /* Continue with the in-memory choice. */ }
    }
  }, [effective, mode, chosen]);
  function choose(value: Experience) {
    setMode(value);
    setChosen(true);
    setOpen(false);
  }
  return <Context.Provider value={{ mode, effective, reduced, choose,
    toggle: () => choose(effective === "off" ? "cinematic" : "off"), configure: () => setOpen(true) }}>
    {children}
    <div className="easy-reading-bar"><span>Clyra · Your preferred experience</span><MotionControls /></div>
    <CursorFollower active={effective === "cinematic"} />
    <ExperienceChoice open={open} reduced={reduced} initial={mode} onChoose={choose} />
  </Context.Provider>;
}

function ExperienceChoice({ open, reduced, initial, onChoose }: {
  open: boolean; reduced: boolean; initial: Experience; onChoose: (mode: Experience) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selection, setSelection] = useState<Experience>(reduced ? "off" : initial);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      setSelection(reduced ? "off" : initial);
      element.showModal();
    } else if (!open && element?.open) element.close();
  }, [open, initial, reduced]);
  return <dialog ref={dialog} className="experience-choice" aria-labelledby="experience-title" aria-describedby="experience-description"
    onCancel={event => { event.preventDefault(); onChoose("off"); }}>
    <form onSubmit={event => { event.preventDefault(); onChoose(reduced ? "off" : selection); }}>
      <h2 id="experience-title">Make yourself comfortable.</h2>
      <p id="experience-description">Choose how Clyra moves. You can change this at any time. Your records and controls work in every mode.</p>
      {reduced && <p className="experience-system">Your device requests reduced motion. Animations will stay off.</p>}
      <fieldset>
        <legend>Choose your experience</legend>
        {([
          ["cinematic", "Cinematic", "A bold product story, scroll choreography and the reference cursor."],
          ["off", "Easy reading", "The familiar calm interface, with all animations and cursor effects off."],
        ] as const).map(([value, title, description]) => <label className="experience-option" key={value}>
          <input type="radio" name="experience" value={value} checked={selection === value} disabled={reduced && value !== "off"}
            onChange={() => setSelection(value)} />
          <span><strong>{title}</strong><small>{description}</small></span>
        </label>)}
      </fieldset>
      <button className="primary" type="submit">Continue to Clyra</button>
      <small className="experience-note">Synthetic demonstration. Clinical evidence remains still in every mode.</small>
    </form>
  </dialog>;
}

export function MotionControls() {
  const { effective, reduced, toggle } = useExperience();
  const reading = effective === "off";
  return <button className="easy-reading-toggle" role="switch" aria-checked={reading}
    disabled={reduced} title={reduced ? "Your device requests reduced motion; easy reading stays on." : "Switch between cinematic and easy reading on any page"}
    onClick={toggle}>
    <span className="toggle-track" aria-hidden="true"><i /></span>
    Easy reading mode {reading ? "on" : "off"}
  </button>;
}
