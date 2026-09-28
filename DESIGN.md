---
name: Sermon Notebook
description: A field notebook kept alongside a study Bible — every line knows who said it and where it came from.
colors:
  paper: "oklch(0.972 0.006 80)"
  paper-raised: "oklch(0.992 0.003 80)"
  paper-sunk: "oklch(0.944 0.008 78)"
  paper-deep: "oklch(0.915 0.01 76)"
  ink: "oklch(0.235 0.012 60)"
  ink-muted: "oklch(0.44 0.012 62)"
  ink-faint: "oklch(0.53 0.01 65)"
  rule: "oklch(0.875 0.008 72)"
  rule-strong: "oklch(0.77 0.01 70)"
  field: "oklch(0.64 0.01 70)"
  pen: "oklch(0.45 0.135 262)"
  pen-strong: "oklch(0.39 0.14 262)"
  pen-wash: "oklch(0.935 0.03 262)"
  on-pen: "oklch(0.985 0.004 262)"
  highlighter: "oklch(0.92 0.075 96)"
  danger: "oklch(0.5 0.16 28)"
  danger-wash: "oklch(0.95 0.025 28)"
  caution: "oklch(0.5 0.1 70)"
  caution-wash: "oklch(0.95 0.035 85)"
  ok: "oklch(0.48 0.09 150)"
typography:
  display:
    fontFamily: "Literata Variable, Iowan Old Style, Georgia, serif"
    fontSize: "3.25rem"
    fontWeight: 600
    lineHeight: 1.1
  display-compact:
    fontFamily: "Literata Variable, Iowan Old Style, Georgia, serif"
    fontSize: "2.4rem"
    fontWeight: 600
    lineHeight: 1.1
  title:
    fontFamily: "Literata Variable, Iowan Old Style, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: "2.45rem"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: "1.75rem"
  reading:
    fontFamily: "Literata Variable, Iowan Old Style, Georgia, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.65rem"
  big-idea:
    fontFamily: "Literata Variable, Iowan Old Style, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: "1rem"
    letterSpacing: "0.08em"
  time:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, SF Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: "1.15rem"
    fontFeature: "tnum"
rounded:
  hair: "2px"
  focus: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "9999px"
spacing:
  gutter: "16px"
  time-column: "4.75rem"
  section-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.pen}"
    textColor: "{colors.on-pen}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.pen-strong}"
  button-secondary:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  button-secondary-hover:
    backgroundColor: "{colors.paper-sunk}"
  input:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 14px"
  source-chip:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 10px"
  source-chip-you:
    backgroundColor: "{colors.pen-wash}"
    textColor: "{colors.pen}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 10px"
  tab-active:
    textColor: "{colors.ink}"
    height: "48px"
    padding: "0 12px"
  tab:
    textColor: "{colors.ink-muted}"
    height: "48px"
    padding: "0 12px"
---

# Design System: Sermon Notebook

> Recorded from the shipped code (`app/globals.css`, `components/ui/*`, `components/sources/*`,
> `components/sermon/*`) on 2026-09-28. Tokens are normative; the prose explains how to apply
> them. The qualitative language below was inferred from PRODUCT.md and the built
> world, not from a design interview (see "Provenance" at the end).

## Overview

**Creative North Star: "The Field Notebook Beside the Study Bible"**

A listener's notebook, not a content feed. The page is warm paper; the only color that
*acts* is a blue-black fountain-pen ink, and it marks the listener's own hand (their notes,
their corrections), links, and the next action. Everything the app generated sits in the same
paper-and-ink world but always wears a label that says who is speaking: *You*, *Sermon*,
*Scripture*, *Photo*, or *AI summary*. Trust is the aesthetic: provenance chips, approximate
times marked with "~", and corrections labelled "edited by you" are part of the look, not
decoration layered on top.

The system is calm and dense in the way a well-kept notebook is dense: generous line length
for reading, tight metadata, a mono time column down the left edge like a log, and rules
(hairlines) instead of boxes. Long-form text the listener *reads* (the sermon's big idea,
summaries, quotes, notes) is set in Literata; everything they *operate* is set in Atkinson
Hyperlegible, chosen for legibility in a dim sanctuary on a phone. Sunday Mode drops to a
low-luminance palette so the screen does not light up a pew.

The warm paper ground is deliberate: it is the notebook metaphor that runs through every
token name (`paper`, `ink`, `pen`, `rule`, `highlighter`, the dot grid), not a default
off-white. A detector rule that flags cream backgrounds was reviewed and consciously kept.

**Key Characteristics:**
- One accent (pen blue); everything else is paper, ink, and hairline rules.
- Two voices of type: a reading serif for content, a hyperlegible sans for controls.
- Mono, tabular times in a left gutter; "~" means estimated, no "~" means the listener set it.
- Provenance chips under every generated item; voice labels above every generated block.
- Flat at rest; only floating layers (sheet, toast, composer, popover) cast a shadow.

## Colors

Warm neutral paper and near-black ink, with a single blue-black pen accent and three quiet
status hues.

### Primary
- **Pen Ink** (`oklch(0.45 0.135 262)`): primary actions, links, focus rings, the active tab
  underline, and anything written by the listener (the "You" voice, "edited by you",
  "Your note" chips). **Pen Ink Pressed** (`oklch(0.39 0.14 262)`) is its hover/pressed state.
- **Pen Wash** (`oklch(0.935 0.03 262)`): the background of "You" chips, selected format
  cards, text selection, and the brief flash when a citation jumps to a note block.

### Neutral
- **Notebook Paper** (`oklch(0.972 0.006 80)`): the page.
- **Fresh Sheet** (`oklch(0.992 0.003 80)`): raised surfaces: inputs, chips, cards, the player.
- **Sunk Paper** (`oklch(0.944 0.008 78)`) / **Deep Paper** (`oklch(0.915 0.01 76)`):
  segmented controls, hover fills, skeletons, timeline bands.
- **Ink** (`oklch(0.235 0.012 60)`): all primary text. **Faded Ink** (`oklch(0.44 0.012 62)`):
  secondary text, labels, inactive tabs. **Pencil** (`oklch(0.53 0.01 65)`): placeholders only.
- **Hairline** (`oklch(0.875 0.008 72)`) / **Ruled Line** (`oklch(0.77 0.01 70)`): dividers and
  borders; **Field Edge** (`oklch(0.64 0.01 70)`): input borders (≥3:1 against paper).
- **Highlighter** (`oklch(0.92 0.075 96)`): `<mark>` in notes only.

### Status
- **Correction Red** (`oklch(0.5 0.16 28)`) with its wash: errors and destructive actions.
- **Caution Ochre** (`oklch(0.5 0.1 70)`) with its wash: the test-provider banner, attention notices.
- **Margin Green** (`oklch(0.48 0.09 150)`): check marks for completed processing stages and available integrations; always paired with a word, never color alone.

Dark theme and Sunday Mode redefine the same custom properties (never new names): dark raises
the pen to `oklch(0.76 0.1 258)` on `oklch(0.2 0.007 70)` paper; Sunday Mode lowers paper to
`oklch(0.155 0.005 70)` and ink to `oklch(0.86 0.006 80)` regardless of the chosen theme.

### Named Rules
**The One Pen Rule.** Pen Ink is the only accent. It means "yours" or "act here": never use it
for decoration, illustration, or to make generated content look important.

**The Voice Label Rule.** Every block of generated text carries a voice label (`VoiceTag`):
the AI label is a dashed rule plus "AI summary"/"AI answer"; the listener's voice is pen blue
with a pen icon. Generated text is never left unlabelled, and AI text never wears pen blue.

## Typography

**Reading Font:** Literata Variable (with Iowan Old Style, Georgia)
**UI Font:** Atkinson Hyperlegible Next Variable (with system-ui)
**Time Font:** Atkinson Hyperlegible Mono Variable (with ui-monospace)

**Character:** a bookish, optically sized serif for what the sermon said and what the
listener wrote, paired with a sans designed for low-vision legibility for every control; the
mono is measurement (times, ranges), never costume.

### Hierarchy
- **Display** (Literata 600, 2.4rem on phones → 3.25rem from 640px, line-height 1.1): the landing page headline only.
- **Title** (Literata 600, 1.625rem on phones → 2rem from 640px, tight leading): the sermon title in the notebook header.
- **Headline** (Atkinson 700, 1.1875rem / 1.75rem): main-idea titles, outline items, page headings in app chrome.
- **Big idea** (Literata 400, 1.375rem on phones → 1.5rem from 640px, line-height 1.5): the
  sermon's big idea at the top of the overview, the largest reading text in a notebook.
- **Reading** (Literata 400, 1.0625–1.375rem, line-height ≈1.6): summaries, quotes, answers,
  note text. Keep to `max-w-prose` (~65ch).
- **Control** (Atkinson 600, 0.9375rem): button labels (md), notebook tabs, sidebar navigation,
  library row titles, the Ask AI input.
- **Body** (Atkinson 400, 1rem / 1.5rem): descriptions, forms, lists.
- **Label** (Atkinson 650, 0.75rem, 0.08em tracking, uppercase, Faded Ink): the notebook's
  printed field names: section headings ("MAIN IDEAS", "SERMON TIMELINE"), kind labels
  ("INTRODUCTION", "PARAPHRASE"). They are real headings or field names, never kickers above a headline.
- **Time** (Atkinson Mono, 0.8125rem, tabular): every timestamp and range.

Users can scale all type from Profile (93.75% – 125%) via `html[data-text-size]`; every size
is in rem so the scale holds.

### Named Rules
**The Reading Serif Rule.** Literata is for content a person reads; Atkinson is for anything a
person operates. A button, tab, chip, or form label is never serif.

**The Approximate Time Rule.** AI-derived times are prefixed "~" and set in the mono; times the
listener captured or corrected drop the "~". A time is never shown without that distinction.

## Layout

Mobile-first. A 16px side gutter on phones; content columns cap at `max-w-6xl` (72rem).

- **App shell:** phones get a fixed four-item bottom nav (Home, Library, Study, Profile) with
  safe-area padding; from `md` (768px) it becomes a 15.5rem left rail read like a notebook's inside cover: the wordmark (pen dot + Literata), a quiet "New sermon" entry, a ruled contents list whose active entry carries a pen-ink dot, the five most recent sermons in Literata, and a verse at the foot.
- **Notebook:** a sticky header (back link, title, metadata, tab row: Overview · Notes · Sermon ·
  Study · More). Tabs scroll horizontally and never wrap. On phones the player collapses to a
  slim sticky bar under the tabs; from `lg` (1024px) it moves to a sticky right rail beside the
  main column.
- **The log column:** timestamped lists (main ideas, outline, timeline) use a
  `4.75rem | 1fr` grid: the mono time sits in the left gutter, content to the right, items
  separated by hairline rules rather than cards.
- **Rhythm:** sections are separated by ~40px (`gap-10`) with a label-caps heading; within an
  item, 4–12px steps. Writing surfaces (notes, Sunday Mode) carry the 22px dot grid.
- **Touch:** interactive targets are ≥40px tall (chips 32px minimum with surrounding space);
  primary buttons are 44–56px.

## Elevation & Depth

Flat at rest. Depth comes from tonal paper layers (sunk → paper → raised) and hairline rules.
Shadows exist only for things that float above the page.

### Shadow Vocabulary
- **Float** (`0 10px 28px -14px rgb(40 30 20 / 0.35), 0 2px 6px -2px rgb(40 30 20 / 0.12)`):
  toasts, the Ask AI composer pinned to the bottom, and popover forms in the editor.
- **Sheet** (`0 -8px 30px -12px rgb(40 30 20 / 0.28), 0 -1px 0 rgb(40 30 20 / 0.04)`):
  bottom sheets ("More in this notebook", confirmations).
- **Button lip** (`0 1px 0 rgb(0 0 0 / 0.08)`): primary buttons only.

### Named Rules
**The Paper Edge Rule.** A resting card is an edge (a hairline or ruled border on raised
paper), not a shadow. Only floating layers get a shadow, and they may keep their edge because
they sit on paper of nearly the same value.

## Shapes

Soft, small radii that read as paper cut with scissors, not app-icon squircles: 2px for
highlighter marks in notes, 4px for the focus outline, 6px for small marks and skeletons, 10px for buttons and inputs, 14px for cards and the player,
16–18px only for the floating composer and sample card. Chips are full pills. Borders are 1px;
dashed rules appear only in the AI voice label. Photos keep their own aspect ratio; nothing is
clipped into circles.

## Components

### Buttons
- **Shape:** 10px radius; heights 36 (sm), 44 (md), 56px (lg).
- **Primary:** Pen Ink fill, On-Pen text, semibold, 1px lip; hover and active go to Pen Ink Pressed.
- **Secondary:** Fresh Sheet fill with a Ruled Line border, Ink text; hover sinks the fill.
- **Quiet:** text-only in Faded Ink; hover shows a Sunk Paper fill.
- **Danger:** secondary shape with Correction Red text; hover washes red.
- **Focus:** a 2px Pen Ink outline offset 2px (global `:focus-visible`).
- **Disabled:** 55% opacity. Reserve for true unavailability; forms validate on submit and
  explain the problem beside the field instead of disabling submit.

### Source chips (signature component)
- **Style:** 32px pills, 1px Ruled Line border on Fresh Sheet, 0.8125rem semibold; a 12px icon
  names the voice (play = sermon moment, image = photo, file = document, pen = your note).
- **Sermon moment:** the label is the mono time range ("~18:42–20:10"); tapping seeks the
  player; hover turns border and text Pen Ink. Low confidence adds "unsure".
- **Your note:** Pen Wash fill with Pen Ink text: the listener's voice, deep-linking to the exact note block.

### Voice tags
- Label-caps text above generated blocks. AI: a 12px dashed rule + "AI SUMMARY" in Faded Ink.
  You: pen icon + text in Pen Ink. Sermon, Scripture, Photo use their chip icons in Faded Ink.

### Cards / containers
- **Corner:** 14px. **Background:** Fresh Sheet. **Border:** 1px Hairline or Ruled Line.
  **Shadow:** none (Paper Edge Rule). **Padding:** 16–20px (24–28px on the landing sample).

### Inputs / fields
- **Style:** Fresh Sheet fill, 1px Field Edge border, 10px radius, 48px tall, 16px text.
- **Focus:** border turns Pen Ink with a 2px Pen Wash ring.
- **Error:** border turns Correction Red; the message sits under the field with `role="alert"`
  and the input points at it with `aria-describedby`.

### Navigation
- **Notebook tabs:** 48px tall, 0.9375rem semibold, Faded Ink; the active tab is Ink with a
  2px Pen Ink underline inset 12px. Overflow tabs live in "More ···" (a bottom sheet).
- **Bottom nav (phones):** four 64px icon-over-label items (0.75rem semibold) on 95% paper with
  a backdrop blur and a top hairline; the active item is Pen Ink with a heavier icon stroke.

### Player dock
- A 14px-radius raised panel: the embed (or native `<audio>`/`<video>`) above a ~52px control row
  (play/pause, title, mono current time, expand). On phones only the control row shows until a
  timestamp is tapped. When the player cannot load, the row says "Player unavailable ·
  Open on YouTube" instead of a dead time.

### Correction affordances
- "Correct" and "Hide" (and "Correct time" on the timeline) are 32px quiet text buttons with a
  12px icon, placed under the item they change. Edited items gain an "edited by you" label in
  Pen Ink; hiding shows a toast with Undo.

## Do's and Don'ts

### Do:
- **Do** put a voice label above every generated block and provenance chips under every generated item.
- **Do** mark AI-estimated times with "~" in the mono, and drop the "~" once the listener sets the time.
- **Do** use Pen Ink only for the listener's own voice, links, focus, and the primary action.
- **Do** separate list items with hairline rules and a left time gutter instead of stacking cards.
- **Do** set content people read in Literata at ≤ ~65ch, and every control in Atkinson Hyperlegible.
- **Do** keep tap targets ≥ 40px and respect safe-area insets on phones.
- **Do** redefine the same custom properties for dark and Sunday Mode rather than adding new color names.

### Don't:
- **Don't** add a second accent color or tint generated content blue.
- **Don't** give resting cards a drop shadow; shadows are for sheets, toasts, the composer, and popovers.
- **Don't** show verse text unless a licensed Bible text provider supplied it. The one exception is the fixed public-domain World English Bible verses in `lib/bible/verses.ts` (sidebar foot, sign-in, study, empty states), set with `Verse`: italic Literata in Faded Ink, reference and "WEB" beneath.
- **Don't** present a quote in quotation marks unless its evidence says it was heard or written word-for-word; paraphrases are labelled "PARAPHRASE" without quote marks.
- **Don't** disable a submit button to signal validation; explain the problem beside the field.
- **Don't** let tab labels or chip labels wrap; they scroll or truncate.
- **Don't** use the dot grid outside writing surfaces.

## Provenance

- Written by the documenter pass inline (no subagent available in this harness). The
  qualitative interview (North Star, color names, component philosophy) was substituted with
  language inferred from PRODUCT.md and the shipped code, per the build brief's instruction to
  choose defaults rather than stop for preference questions. Revise freely.
- Not canonized: the cream-background detector finding is a deliberate world choice
  (see Overview); the landing sample card's former float shadow and the auth forms'
  disabled-until-valid submit buttons were defects and were fixed rather than recorded.
