# Imagework Design System

## 0. Visual Reference Log

This revision uses [Astryx](https://astryx.atmeta.com/) as a **component and
interaction reference**, not as a runtime dependency or a template to copy.
Its public component catalogue groups File Input, Field, Input Group, Number
Input, Radio List, Badge, Status, Card, and Button as composable form
primitives; its themes present a Neutral baseline alongside more expressive
alternatives. Imagework adopts that neutral, field-forward composition: a
clear section label, a compact status badge, a bounded field group, and one
unambiguous primary action.

The adaptation deliberately does not import Astryx, StyleX, its assets, its
copy, or its brand marks. The product remains a small focused worker form
rather than a multi-pane application shell. The distinctive Imagework moment
is the local-file metadata strip: it makes the image's actual pixel dimensions
visible before upload, while explicitly stating that it does **not**
automatically choose the target object or normalized box.

## 1. Atmosphere & Identity

Imagework is a restrained, reassuring handoff screen: one clear task, a small
amount of explanation, and no implied magic. Its signature is a quiet neutral
work surface with a restrained indigo action color and compact component
grouping inspired by Astryx's Neutral theme and form catalogue. The form makes
the boundary explicit: the submitted image is processed only for the temporary
server job; Google and Hugging Face credentials stay server-side. It is not a
dashboard or a place to enter a provider credential.

## 2. Color

### Palette

The existing page uses Tailwind Zinc utility values. These are the extracted
light-only tokens for the worker form; no dark theme has been designed.

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Page surface | `--surface-page` | `#f7f7f8` | Full-page background |
| Card/input surface | `--surface-primary` | `#ffffff` | Helper panel and field controls |
| Quiet/metadata surface | `--surface-subtle` | `#f2f2f4` | Badges, notices, and code tokens |
| Selected surface | `--surface-selected` | `#eeeefd` | Selected radio item and file hover state |
| Text/primary | `--text-primary` | `#1d1d22` | Headings, labels, and notice marker |
| Text/secondary | `--text-secondary` | `#60606b` | Supporting explanation |
| Text/muted | `--text-muted` | `#777783` | Eyebrows, badge labels, and input guidance |
| Border/default | `--border-default` | `#dedee5` | Panels and unselected controls |
| Border/strong | `--border-strong` | `#a8a8b5` | Hovered drop zone and controls |
| Action/primary | `--action-primary` | `#34346d` | Launch button and selected-choice border |
| Action/hover | `--action-hover` | `#272757` | Hovered launch button |
| Action/disabled | `--action-disabled` | `#e3e3e8` | Unavailable launch button |
| Error/surface | `--status-error-surface` | `#fff1f1` | Validation message background |
| Error/text | `--status-error-text` | `#ae3038` | Validation message text |
| Focus | `--focus-ring` | `#5656b8` | Visible focus outline; never rely on color alone |

Rules: the indigo accent is functional, never decorative. White cards separate
from the page with a restrained shadow; controls separate with borders. Error uses
both red and explicit text/`role="alert"`. Future implementation must verify
the final focus and error treatments meet WCAG 2.2 AA contrast rather than
assuming utility-color combinations do so.

## 3. Typography

### Scale

The app self-hosts Pretendard Variable through `next/font/local`, exposed as
the `--font-sans` CSS variable on `<html>`. Next.js serves the woff2 file from
the same origin as a static asset; the browser never requests a font CDN. The
system stack remains the fallback chain after `--font-sans` so text stays
legible if the variable is ever unset.

| Level | Size | Weight | Line height | Usage |
| --- | --- | --- | --- |
| Page title | 32px | 720 | 40px | Single helper heading |
| Brand label | 14px / `text-sm` | 600 | normal | `IMAGEWORK` eyebrow |
| Body | 16px | 400 | 1.75 / `leading-7` | Boundary and handoff explanation |
| Label/action | 16px | 500 | normal | Field labels, modes, launch button |
| Supporting/error text | 14px / `text-sm` | 400 | normal | Formats, limits, error recovery |

Font stack: `var(--font-sans), system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", sans-serif`, where `--font-sans` resolves to the self-hosted
Pretendard Variable font. The helper must retain Korean copy in plain
language, avoid all-caps instructional copy, and keep body text at or above
14px.

## 4. Spacing & Layout

### Base unit

All new spacing is a multiple of 4px.

| Token | Value | Current or future usage |
| --- | --- | --- |
| `--space-1` | 4px | Tight inline separation |
| `--space-2` | 8px | Label-to-control and radio spacing |
| `--space-3` | 12px | Inputs, alerts, button vertical padding |
| `--space-4` | 16px | Mode-card padding |
| `--space-5` | 20px | Mobile page inset |
| `--space-6` | 24px | Mobile card padding; form rhythm |
| `--space-8` | 32px | File section to action group |
| `--space-10` | 40px | Desktop card padding |
| `--space-12` | 48px | Mobile page vertical inset |
| `--space-20` | 80px | Tablet-and-up page vertical inset |

The panel is centered at `max-width: 680px`, with a 20px radius, white
background, and a two-layer restrained shadow. It is intentionally a narrow,
sequential form rather than a multi-column application shell. Astryx's
component grammar informs the compact eyebrow-plus-badge heading on each field
group, rather than a broad dashboard layout.

| Viewport | Layout contract |
| --- | --- |
| 375px | 20px page inset, 48px vertical inset, 24px card padding; file, explanation, modes, normalized box controls, notice, and launch action remain one column. No horizontal scroll. |
| 768px | 20px page inset, 80px vertical inset, 40px card padding; mode choices may become two columns (`sm` and above), while box controls stay legible and touchable. |
| 1280px | Keep the same 680px reading measure and centered card; do not widen into a dashboard. Three concise mode choices may remain inline. |

At 200% zoom, the form reflows to one column without clipped labels, hidden
help, or overlapping buttons. Breakpoints are content-driven; these three
viewport checks are the required manual QA set.

## 5. Components

### Helper card

- **Structure:** `main > section > eyebrow + h1 + explanatory paragraph + form`.
- **Spacing:** `--space-5/6/10`; existing mobile/desktop padding is preserved.
- **Depth:** white tonal surface with `shadow-sm`, no decorative gradients.
- **Accessibility:** one `h1`, sequential reading order, Korean document language.

### File choice and local metadata

- **Structure:** Astryx-inspired file field with a clear label and compact
  badge, native `input[type=file]`, concise allowed-format/size text, then
  selected name/size/**pixel dimensions** as in-memory metadata only.
- **Allowed contract:** PNG, JPG/JPEG, BMP, WebP, GIF first frame; maximum 10
  MiB and 20 MP. AVIF is explicitly rejected.
- **States:** default/empty; hover (a modest border or surface cue); active
  (native press feedback); focus-visible (the `--focus-ring` outline);
  selected-valid; selected-invalid; and disabled only when the browser cannot
  select files. Selecting a new file clears obsolete file errors. No preview
  is required.
- **Accessibility:** visible label, native file semantics, error connected via
  `aria-describedby`, and a text error that explains how to recover.
- **Truthfulness:** reading `naturalWidth × naturalHeight` locally helps check
  the 20 MP limit; it never detects the object, segmentation mask, or target
  box on the user's behalf.

### Asset-mode choice

- **Structure:** labelled `fieldset` and `legend` with three native radio
  choices: `logo`, `icon`, and `photo`.
- **Variants:** unselected (border), selected (zinc-900 border plus zinc-50
  surface), focus-visible, and invalid/required.
- **Responsive:** one column at 375px; implementation may use a compact
  two-or-three-column group only when labels and touch targets remain clear at
  200% zoom.
- **Accessibility:** arrow keys move between radios; label activates its input;
  chosen state is not communicated by color alone.

### Normalized box controls

- **Structure:** after a valid local file is chosen, a proportional image
  preview has a visible draggable selection rectangle. Dragging creates the
  normalized box; four labelled numeric fields for `BOX_CX`, `BOX_CY`,
  `BOX_W`, and `BOX_H` remain the keyboard and precision-adjustment path.
- **Synchronization:** drag changes immediately update all four fields;
  numeric edits immediately update the selection rectangle. The preview uses
  the image's measured aspect ratio, so the pointer and normalized coordinates
  agree.
- **States:** default centered values; hover (a modest border or surface cue);
  active/native press; focus-visible (the `--focus-ring` outline); edited-valid;
  out-of-range; nonnumeric; invalid geometry (an edge would fall outside 0–1);
  and disabled when the helper cannot accept edits. A launch attempt explains
  the first invalid field and keeps the user’s entered values.
- **Accessibility:** every field has a programmatic label and format hint;
  invalid fields expose `aria-invalid` and reference their error text. The
  preview states that dragging is optional; keyboard input never requires drag
  gestures or a visual coordinate picker.

### Boundary notice

- **Structure:** short plain-language text immediately before the action.
- **Content contract:** the selected image and settings are sent to the
  temporary server job only; its selected PNG, SVG, or ZIP result is returned
  and job data is removed afterwards. The Hugging Face and Google credentials
  remain on the worker and are never entered in this browser form.
- **Accessibility:** ordinary readable text, not an icon-only disclosure.

### Download-format choice, job action, and download

- **Structure:** a labelled fieldset with native `PNG`, `SVG`, and `ZIP` radio
  choices followed by one full-width native submit button. SVG is disabled for
  photo mode and switching from SVG to photo restores PNG. The valid multipart
  request includes the selected output format.
- **Variants:** PNG and ZIP are available for every mode; SVG is available for
  logo and icon only. ZIP contains every result available for the selected mode.
- **States:** disabled with a nearby reason before completion; preparing;
  processing; downloading; completed; failed; cancelled; hover; active; and
  focus-visible. The visible state must match the actual request lifecycle.
- **Accessibility:** native radios and button preserve keyboard operation and a
  visible focus ring. Status uses a polite live region; a separate cancel
  control appears only while an active request can be aborted.

### Validation summary

- **Structure:** concise alert near the affected controls, with field-level
  descriptions where needed.
- **States:** absent, file error, required-mode error, box error, and combined
  error summary. There is no success toast because navigation is the success
  outcome.
- **Accessibility:** `role="alert"` only for newly surfaced blocking errors;
  do not repeatedly announce unchanged guidance.

## 6. Motion & Interaction

The current interface has no motion language. Keep interactions immediate and
quiet. Hover, active, and focus states may use a 100–150ms color/opacity or
transform transition only when it clarifies interactivity. Do not animate
layout, create decorative loading, or simulate image processing. Respect
`prefers-reduced-motion` by removing non-essential transitions.

## 7. Depth & Surface

Depth strategy: **mixed, restrained**. The page uses a zinc tonal shift, the
helper card uses a small shadow, and input/mode cards use 1px borders. Keep
the contrast subtle: no glass effects, gradients, large shadows, dashboard
tiles, or status visualizations. The selected mode adds both a stronger border
and a near-white tonal change.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA: 4.5:1 for normal text and a persistent, obvious focus
  indicator on every interactive control.
- The complete task is keyboard-operable in visual order: file selection,
  radio selection, four box inputs, error recovery, job submission, and
  cancellation.
- Errors are specific, in Korean, announced once, associated with their fields,
  and preserve user input. Missing mode and invalid box values block launch.
- Plain-language boundary copy reduces cognitive load: what is sent to the
  temporary worker, when it is removed, and that provider credentials stay
  server-side are stated before the action.
- Touch targets remain practical at narrow widths; text reflows at 200% zoom.
- The output explanation must state: `result.png` is transparent; `result.svg`
  is available only for `logo` and `icon`; ZIP includes all results available
  for the selected mode; JPEG output is not offered.

### Personas and manual QA specification

| Persona / risk | Task and pass condition |
| --- | --- |
| Keyboard-only visitor | At 375, 768, and 1280px, tab through every control in order; every focused item is visible, radio keys work, numeric box fields remain the non-drag alternative, invalid fields receive clear feedback, and the worker action/cancel control can be activated. |
| Low-vision / zoom visitor | At 200% zoom at each required viewport, text, errors, labels, and action remain visible without horizontal scrolling or ambiguous color-only state. |
| Privacy-cautious visitor | Read the page before submitting and correctly understand that the image is sent only to a temporary server job, credentials remain server-side, and provider tokens are never entered on the website. |
| Error-recovery visitor | Test invalid extension, over-10-MiB/over-20-MP metadata, no mode, nonnumeric/out-of-range box, and invalid box geometry. Each blocks launch, names recovery, retains valid prior entries, and clears when corrected. |

Manual QA checklist, to run against the implemented worker form:

1. At 375/768/1280px, inspect the card, labels, help text, three modes, image
   selection preview, four box controls, error messages, and launch action for
   clipping, overlap, and horizontal scroll.
2. Drag a selection across the image and confirm all numeric box fields update;
   then keyboard-tab through the page, exercise radio arrow keys, edit all
   numeric inputs, trigger each invalid state, correct it, and confirm focus
   remains visible and errors are announced/associated.
3. Submit a valid request against a controlled worker and verify the real
   preparing, processing, downloading, completion, cancellation, and safe
   failure states.
4. Confirm the temporary-server-processing/no-provider-token explanation is
   visible before submission, SVG is unavailable for photo mode, and output
   wording distinguishes PNG, logo/icon-only SVG, and ZIP.

### Accepted debt

| Item | Location | Why accepted now | Owner / exit |
| --- | --- | --- | --- |
| Rendered responsive evidence is pending | Local worker form | Unit, type, lint, and build checks validate the implementation, but they do not replace real-browser checks at 375/768/1280px and 200% zoom. | Task 11 captures visual and keyboard evidence before release. |
| Browser-level file decoding varies | `components/image-processor.tsx` | The browser reads natural dimensions locally through a native `Image`; unusual/corrupt images may be rejected even if their filename has an allowed extension. | Keep the specific recovery message; the server validates actual image bytes before queuing. |

## Documentation Verification Record

- Source inspected: `app/page.tsx`, `app/globals.css`, `app/layout.tsx`, and
  `components/image-processor.tsx`, plus the server-worker input/output
  contract.
- Scope: the Astryx-informed token and component guidance now covers the
  implemented helper primitives; source implementation is tracked separately.
- Validation: Markdown was updated alongside the UI. Browser visual evidence
  remains a release gate, not a claim made by this document.
