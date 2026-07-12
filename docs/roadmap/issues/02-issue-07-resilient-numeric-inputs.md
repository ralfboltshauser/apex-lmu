---
title: "Reusable, resilient numeric inputs"
issue: 7
issue_url: "https://github.com/ralfboltshauser/apex-lmu/issues/7"
issue_state: "open"
implementation_status: "implemented; focused and full renderer validation passed; merge pending"
plan_order: 2
phase: 0
workstream: "shared-ui-correctness"
complexity: "S"
complexity_score: 2
effort_engineer_days: "2-4"
risk: "low"
confidence: "high"
depends_on: []
blocks: [8]
parallel_with: [9]
source_updated_at: "2026-07-12T12:35:00Z"
source_commit: "9660be5"
last_verified: "2026-07-12"
---

# Issue #7 — reusable, resilient numeric inputs

## Implementation progress — 2026-07-12

Implemented on `codex/complete-open-issues`:

- a pure locale-aware discriminated parser that rejects empty, partial,
  exponent, non-finite, mixed-separator, out-of-range, non-integer, and
  step-misaligned drafts without coercion;
- one accessible `NumericField` with independent draft/committed values,
  English dot and German comma input, inline linked errors, blur/Enter commit,
  Escape restore, external Reset resynchronization, and a documented language-
  switch policy that restores the committed value;
- complete migration of Strategy and Fuel Calculator with bounded field
  contracts and no remaining local numeric helper;
- field-by-field fuel localStorage recovery that preserves valid siblings and
  backs up the original malformed payload before repaired values persist;
- retention of the last valid calculation while any field is empty or invalid.

All 22 focused parser/component/view tests, the full 93-test renderer suite,
i18n validation, TypeScript lint, and the production renderer build pass. The
GitHub issue remains open until the implementation is committed, published, and
included in the final Windows release validation.

## Outcome

Users can clear, replace, paste, or partially type every numeric value without
crashing a view, silently changing the calculation to zero, or persisting an
invalid intermediate value. Strategy and fuel calculations always receive a
validated domain value. One shared component and parsing contract handles the
behavior consistently in English and German.

## Verified failure mechanism

There are currently two reusable-looking but duplicated number fields:

- `StrategyView.tsx:NumberInput` immediately calls
  `onChange(Number(event.target.value))`.
- `FuelCalculatorView.tsx:Field` does the same.

For an empty HTML input, `Number('')` is `0`. The browser's `min` attribute only
marks a control invalid; it does not stop React from putting zero into state.
The consequences differ by view:

- Strategy feeds the temporary zero directly into `projectRaceResources`
  during render. The engine correctly rejects non-positive pace/consumption
  inputs, so an ordinary edit can become an uncaught render failure.
- Fuel stores zero, then its `safe()` helper silently substitutes a fallback or
  minimum for calculations. The displayed draft, persisted value, and computed
  value can therefore disagree.
- `FuelCalculatorView.loadInputs()` spreads arbitrary parsed localStorage data
  over defaults without validating each field first.

Only `StrategyView.tsx` and `FuelCalculatorView.tsx` currently use
`type="number"`; the overlay opacity field is a bounded range input and is not
the same failure class. The engine's exceptions are desirable programmer
guards and should remain. The UI must stop invoking the engine with an invalid
editing state.

## State model

A numeric field has two distinct values:

1. **Draft text** — what the user is editing. It may temporarily be empty,
   `-`, `1.`, or use the locale decimal separator.
2. **Committed number** — the last value that passed parsing and domain
   constraints. Only this value may reach engines or persistence.

Model parsing as a discriminated result rather than coercing strings:

```ts
type NumericDraft =
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: 'syntax' | 'below-min' | 'above-max' | 'step' }
  | { kind: 'valid'; value: number }
```

The shared field owns draft text and resynchronizes when the committed parent
value changes through Reset, automatic telemetry, or plan loading. It may emit
`onValidChange` while typing, but never emits for empty/invalid text. On blur or
Enter it commits a valid value; invalid text remains visibly invalid or is
restored according to one documented policy. Escape restores the last committed
display.

Using `type="text"` with `inputMode="decimal"` is preferable if Apex supports
both `3.46` and German `3,46`; native `type="number"` parsing of locale input is
not consistent enough to be the application contract. Formatting for display
and parsing must use the active Apex locale, while storage remains a JSON
number with `.` semantics.

## Implementation plan

### 1. Define reusable parsing and constraint functions

- Add a small pure module for locale decimal normalization, finite-number
  parsing, `min`, `max`, integer, and optional step checks.
- Reject `NaN`, infinity, exponent syntax if the product does not deliberately
  support it, and mixed separators such as `1,2.3`.
- Do not round silently. If step alignment matters, expose a clear error or
  round only through an explicit product option.
- Return localized error IDs rather than hard-coded rendered strings.

### 2. Build one accessible `NumericField`

- Put it under a focused shared form path such as
  `src/components/forms/NumericField.tsx`; do not add a third local helper.
- Support label, unit, help, committed value, min/max/step, required, disabled,
  locale, and stable error-description IDs.
- Use `aria-invalid`, `aria-describedby`, and an inline message that does not
  rely on color. Preserve label click/focus behavior.
- Define keyboard behavior for Enter, Escape, arrows, Home/End only where those
  controls are intentionally supported.
- Preserve caret position during ordinary edits and locale formatting.

### 3. Migrate Fuel Calculator

- Replace `Field` with the shared component.
- Keep the last valid plan visible while a field is empty/invalid and label the
  stale calculation if necessary; never substitute an unrelated default
  without telling the user.
- Validate every loaded persisted property. Invalid legacy fields fall back
  individually, are reported locally, and do not discard valid sibling fields.
- Persist only the committed validated input object, never draft strings.
- Ensure automatic/live read-only fields still resynchronize correctly.

### 4. Migrate Strategy

- Replace `NumberInput` before the broader #8 planner rewrite.
- Keep `projectRaceResources` and later `generateStrategyCandidates` behind a
  fully valid input snapshot. One invalid draft cannot call either engine.
- Show which field is blocking recalculation and retain the last valid result
  instead of clearing the entire page.
- Reset must update both the parent values and every field draft.

### 5. Add containment without hiding defects

- Keep engine validation and exceptions unchanged.
- If the app lacks a renderer error boundary, add one separately as
  defense-in-depth so a future unexpected defect offers recovery and reports to
  existing local diagnostics. Do not use it as the fix for this issue.

## Acceptance criteria

- Selecting all text and pressing Backspace in every strategy/fuel numeric
  field leaves the view running and the last valid calculation intact.
- Typing a replacement value one character at a time never sends an empty,
  non-finite, below-minimum, or malformed value to an engine.
- `3.46` works in English; `3,46` works in German and commits the same number.
- Reset, mode changes, and live automatic values resynchronize visible drafts.
- Blur/Enter/Escape behavior is consistent and documented.
- Invalid values have an accessible inline explanation; browser-native validity
  bubbles are not the only feedback.
- Reloading malformed legacy localStorage preserves every valid sibling value
  and never crashes.
- No duplicate local numeric-field component remains in the two views.

## Focused test plan

### Pure parser tests

- Empty, whitespace, sign-only, decimal-only, valid integer/decimal, comma and
  dot locales, mixed separators, exponent, `NaN`, infinity, min/max, and step.
- Round-trip format/parse for representative fuel, time, capacity, and reserve
  values.

### Component tests in jsdom

- Clear and retype; paste; blur; Enter; Escape; external Reset; disabled state;
  inline help/error linkage; keyboard-only flow.
- Assert the callback history so empty/invalid drafts demonstrably never emit.

### View integration tests

- Reproduce the reported sequence in every field in `StrategyView` and
  `FuelCalculatorView` and assert no global error/rejected render.
- Confirm calculations use the last valid input until a new value commits.
- Load partly corrupt persisted fuel inputs and verify field-level recovery.
- Switch EN↔DE with an active draft and verify the chosen locale policy.

Run these focused Vitest cases first, then `npm run i18n:check`, `npm test`,
`npm run lint`, and the complete release validation before publishing.

## Risks and decisions

| Decision/risk | Resolution |
| --- | --- |
| Recalculate on each keystroke or blur | Emit only complete valid drafts; commit on blur/Enter. Never calculate from invalid text. |
| Empty required value | Keep it as an explicit draft error; do not coerce it to zero. |
| German decimal comma | Normalize through the Apex locale, not browser coercion. |
| Invalid persisted legacy data | Recover per field and preserve the original payload for diagnostics where practical. |
| Engine throws on invalid input | Retain this invariant; UI validation is not a substitute for domain validation. |
| Scope creep into all form controls | Migrate numeric controls now; select/range/checkbox primitives remain separate. |

## Dependencies and parallelization

This issue has no hard dependency and can be developed alongside #9. It is a
hard prerequisite for #8 because strategy work otherwise keeps an ordinary
editing action on the render-failure path. The component can later serve #5's
overlay position/size editor, but #5 must not wait for that optional reuse.

## Definition of done

The reported delete-to-empty sequence is automated for every numeric field,
all calculations receive only valid committed numbers, EN/DE input behavior is
verified, and the reusable component has replaced both duplicated helpers.

## Repository references

- `src/views/StrategyView.tsx:NumberInput`
- `src/views/FuelCalculatorView.tsx:Field`, `safe`, and `loadInputs`
- `src/engine/fuel.ts`, `src/engine/fuel-plan.ts`, and
  `src/engine/strategy.ts` validation boundaries
- `src/components/ui.tsx` for existing shared-component conventions
