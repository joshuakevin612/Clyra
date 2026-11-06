# Cinematic direction: continuity in motion

Surface: Clyra's optional cinematic landing and authenticated shell. Audience: hackathon viewers and clinicians exploring synthetic medication continuity and telemetry evidence. Existing Easy reading identity is preserved; the project owner explicitly replaced the cinematic palette and requested ongoing motion, including after login.

Reference studied: https://landonorris.com/ — opening and scroll frames were captured locally. The useful principles are one dominant moving visual, strong colour fields, continuity between scroll scenes and small ongoing movement at rest. No portraits, logos, images or proprietary assets from that site are used.

Concept: care keeps its context. A continuous Möbius ribbon is the visual metaphor, carried into the workspace. Deep aubergine and acid pear replace the earlier cobalt/coral palette; porcelain provides the reading surface. Barlow Condensed carries large display text, Barlow carries reading and interaction. The hero is left aligned, with the living ribbon filling the right field; mobile places it below readable copy. No background gradients or decorative particle layer are added.

Choreography: source-led hero → text relay → original record approach → quarter-turn of the connected evidence world → zoom-through into handover → interactive evidence walkthrough → calm sign-in ending. Camera moves are isolated from actual clinical records. Source, review and summary remain explainable without the rig. The scene bible validates the combined 380svh sticky sequence as three distinct moves with named handoffs.

Motion hierarchy: ribbon leads; typography/nav/action feedback support; the marquee is the ambient layer. The main content and live measurements remain still. A compact ribbon and brand strip keep the signed-in shell alive without moving patient values. Easy reading stops every loop and restores the original calm skin. OS reduced motion overrides cinematic selection. Touch uses the simplified composition without pointer effects.

Verification is in MOTION.md. No human screen-reader conformance, 200% browser-zoom audit or production frame-rate guarantee is claimed.


Palette update: Cinematic now uses saturated vermilion `#FF512B`, ink blue `#101C36`, sharp white reading surfaces and cool blue-white `#DCE6FF` for the evidence stage. The opening is colour-drenched; the ending is ink blue with a vermilion action. The ribbon lighting now uses the same blue family. Easy reading retains its original pine/ivory palette. Verified WCAG contrast: ink on vermilion 5.21:1, light on ink 16.30:1, secondary text on white 6.56:1.


## Aurum redesign (current)

Palette: midnight `#0A0E1F`, navy `#121936`, aurum `#E4B95C`, ivory `#F6F0E3`, sand `#E9DFC9`, sea `#1F6F73` (review card only). Verified contrast: aurum on midnight 10.40:1, ivory on midnight 16.88:1, midnight on aurum 10.40:1, ivory on sea 5.17:1, slate `#4A5273` on ivory 6.73:1. Colour arc: midnight arrival, ivory relay, aurum band, navy trace, sand explore, midnight close. Barlow Condensed 700 for display, Barlow for reading.

Choreography: per-character mask-slide hero with pointer parallax and scroll split; Möbius ribbon (midnight to aurum lit) travels as the hero releases; RECORD/REVIEW/RELAY rows pass in opposition with scroll-velocity skew; two-row aurum marquee speeds up with scroll speed; pinned trace stage (headline recedes, evidence converges, signature draws, rotating rings keyed to progress); sand explore section with a gliding tab indicator and a 3D-tilting specimen with a pointer-following glare; closing statement resolves word by word. Scroll progress bar and chapter rail are fixed. Motion verbs: mask-slide, draw, sweep, parallax. All of it lives in `aurum.css`, `WelcomeSequence.tsx` and `useCinemaScroll.ts`, scoped to Cinematic; Easy reading is untouched.
