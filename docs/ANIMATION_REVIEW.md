# Animation review

Reviewed against the project's dedicated motion standards after browser testing at desktop, mobile, and reduced-motion settings.

| Before | After | Why |
| --- | --- | --- |
| Root CSS progress variables drove descendant transforms on every scroll | Direct `scaleX` / `scaleY` writes in `src/hooks/useMotion.ts:20` | Avoid a root-level style-recalculation path; update only the compositor-backed elements that move |
| Hero parallax and product tilt were inherited through parent CSS variables | Direct poster transform in `src/App.tsx:154` and frame transform in `src/components/ProductTheatre.tsx:341` | Keep scroll-linked work local to the moving element |
| Header animated its `height` between top and scrolled states | Fixed-height shell with color, border, and shadow feedback in `src/styles.css:280` | Remove layout animation from a frequently crossed scroll boundary |
| Product panels restarted a 520 ms keyframe on every tab change | Interruptible 180–220 ms starting-style transition in `src/styles.css:1258` | Interactive UI should respond below 300 ms and retarget cleanly |
| Strategy stints animated `width` | Width changes now settle immediately; only background color transitions in `src/styles.css:1734` | Avoid repeated layout work for a decorative interpolation |
| Active map markers animated SVG `r` | `transform: scale(1.28)` in `src/styles.css:1345` | Use a compositor-friendly transform for the same focus cue |
| Setup dial took 480 ms to answer a row selection | 260 ms retargetable transform in `src/styles.css:1942` | Keep a direct control response below the UI timing ceiling |
| Screenshot hover depth could run on coarse pointers | Transform hover is gated in `src/styles.css:2906` | Prevent sticky touch-hover states and reserve decorative motion for precise pointers |
| Mobile navigation links entered simultaneously | 30 ms stagger through `src/styles.css:480` | Give the rare menu entrance readable order without delaying interaction materially |

## Verdict

**Approve.** No feel-breaking regression remains: there is no `transition: all`, `scale(0)`, UI `ease-in`, animated layout on high-frequency controls, or unbounded root-variable scroll path. Frequent UI stays below 300 ms, pointer motion is interruptible, scroll-linked work uses transforms/opacity, decorative hover is fine-pointer gated, and reduced motion swaps the choreography for a static, fully usable document flow.
