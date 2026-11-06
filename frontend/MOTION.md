# Cinematic and easy reading experiences

The project owner explicitly authorized a replacement visual world and bolder scroll choreography for Cinematic mode. Design Craft and Scroll Choreography guide this surface. Easy reading preserves the original pine/ivory/Arial identity and disables all animations, custom-pointer effects and the marketing story. There is one fixed, native switch labelled **Easy reading mode on/off**. It remains available before sign-in, in every signed-in role, on patient records and on the password-change screen. It does not change authentication, records, grants, polling or ingestion.

## Choice and persistence

First-time visitors choose Cinematic (initially selected) or Easy reading in a native modal. Continue applies the choice immediately; Escape selects Easy reading. A saved selection is remembered; earlier Current-look or motion-off choices migrate to Easy reading. No waiting period or automatic countdown applies. OS reduced motion forces Easy reading and updates live. Preference-storage failures fall back to in-memory state; no credentials, tokens or clinical data are stored with preferences.

## The cinematic story

The hero introduces medication continuity and offers an immediate sign-in anchor. A scroll-linked typographic relay explains the handover problem. A 380svh native sticky camera rig approaches the record, turns through the review relationship and zooms into the handover; a keyboard-accessible Source/Findings/Summary walkthrough explains the actual product behavior. The final section leads to the real sign-in form. There is no wheel interception, forced scrolling, automatic chapter timing, hidden record data or simulated medical advice. The illustrative graphics contain no patient readings. Mobile uses a shorter, unpinned sequence. Unsupported CSS timeline browsers get complete static illustrations.

The current palette is deep aubergine `#27133D`, acid pear `#D8F36A`, porcelain `#F7F4EA` and orchid `#DAC8EC`. Barlow Condensed gives the headline its document-stamp character; Barlow carries reading and controls. Fonts are bundled locally using Fontsource, with no Google Fonts runtime dependency. The palette and typography also apply to the signed-in workspace only while Cinematic is active. Easy reading restores the original identity.

## Motion that remains alive at rest

The hero's continuity object is an original parametric Möbius ribbon rendered as a lit, depth-sorted Canvas 2D mesh (528 faces), not an image downloaded from the reference. It rotates slowly without scrolling and follows pointer position with damping. A compact ribbon and branded marquee continue the same language in the authenticated workspace. CSS marquees, the evidence stamp and its connection add small secondary loops. The ribbon and marquees use visibility/intersection checks; stage loops pause when that stage is out of view. Every RAF/listener/observer is cleaned up on disabling or unmount. Canvas resolution is capped at 1.5 device pixels per CSS pixel and painting is bounded to approximately display-frame cadence. Representative-device profiling has not been performed.

The semantic text and clinical charts/tables stay outside the decorative camera rig. The illustrated evidence specimen recomposes on an explicit tab selection; navigation arrows and action shapes respond to hover/focus. Keyboard focus, backend flags and live announcements are not driven by animation. The global Easy reading switch is the pause control for all ongoing movement, before and after login.

## Reference cursor

Matched to the user-supplied local Design Craft reference HTML: 14px dot, 56px on hot zones, `#D8D9D6` blend ink, `mix-blend-mode: difference`, 300ms expo width/height growth and 200ms opacity. The exact positional law is `1 - Math.pow(0.0003, Math.min(elapsedSeconds, 0.05))`. The native cursor is hidden while the follower is active on a fine pointer. Keyboard input, window exit/blur, touch, hidden tabs, disabled motion and reduced motion hide the follower and restore the native cursor. The dot cannot intercept clicks; the frame loop stops when settled and cancels when disabled. Position is initialized outside the window as in the reference. Unit tests compare 30/60/144 Hz convergence and the reference's 50ms delta clamp.

## Evidence and scope

Visual changes are frontend-only. Patient/organisation isolation, immutable source evidence, backend classifications, timestamp precision, idempotency, audits and versioning are unchanged. The real clinical charts, readings, findings and summaries are not part of the marketing camera rig. Live updates do not trigger scene transitions. Display pause remains independent of ingestion. Native focus, meaningful controls and equivalent clinical chart/table information are preserved.

## Verification

Latest living-motion results: production build passed; all 33 unit/mock tests passed; 18 browser checks passed, including pixel changes at rest, pointer response, offscreen suspension and idle motion after login. The real Neon-backed cinematic clinical review passed at desktop and 320px widths. The scene-budget checker reported no findings. The design scanner reported four low-severity ambient-loop notices; those loops are explicitly requested by the owner, carry the continuity motif, and pause out of view/hidden tabs or stop in Easy reading. No high-severity findings were reported. Desktop/mobile hero, walkthrough and easy-reading captures were inspected.

Run `npm run build`, `npm test`, and `npx playwright test --config playwright.motion.config.ts`. The browser configuration uses mock data for repeatable UI regressions and explicitly exercises the cinematic and easy-reading branches. `node scripts/check-telemetry-neon.mjs --cinematic` reviews persisted synthetic telemetry through the real Neon-backed app and signs out. The scene bible is `motion-scenes.json`.

Contrast checks: aubergine on acid pear 13.59:1; porcelain on aubergine 15.31:1; secondary text on the workspace surface 6.81:1. Desktop/mobile visual captures are under ignored test-results. Human screen-reader testing, actual 200% browser zoom auditing and representative-device frame-rate profiling remain unperformed. No full WCAG conformance or production performance claim is made.

## Traceability sequence update

The desktop cinematic stage now opens with a large, centered EVERY CHANGE. STILL TRACEABLE. headline. At 16–44% of the native scroll span it scales back and fades away; at 34–64% the linked source/review composition scales into view; at 66–88% the Clyra mark draws onto the composition. The last frame holds before native scrolling releases the section. All poses are derived from the same scroll progress with 120ms elapsed-time damping and reverse correctly. Pointer offsets are independent of the scroll scale. Mobile keeps the readable static composition; Easy reading removes the cinematic stage.

The current implementation supersedes the earlier quarter-turn rig. The build passed, the existing native-scroll/mobile check passed, and a new staged headline/cards/signature browser check passed. Opening and final-stage screenshots were visually inspected for text overlap.


Palette update: Cinematic now uses saturated vermilion `#FF512B`, ink blue `#101C36`, sharp white reading surfaces and cool blue-white `#DCE6FF` for the evidence stage. The opening is colour-drenched; the ending is ink blue with a vermilion action. The ribbon lighting now uses the same blue family. Easy reading retains its original pine/ivory palette. Verified WCAG contrast: ink on vermilion 5.21:1, light on ink 16.30:1, secondary text on white 6.56:1.
