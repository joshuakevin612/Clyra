import { ContinuityRibbon } from "./ContinuityRibbon";
import { useExperience } from "./Experience";

export function WorkspaceMotion() {
  const { effective } = useExperience();
  if (effective !== "cinematic") return null;
  return (
    <div className="workspace-ribbon" aria-hidden="true">
      <ContinuityRibbon compact />
    </div>
  );
}
