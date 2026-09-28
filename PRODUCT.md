# Product

<!-- impeccable:product-schema 1 -->

> Written from the master build brief without a separate interview (the brief asked not to stop
> for preference questions). Facts marked *(inferred)* are assumptions to confirm.

## Platform

web

## Stack

Delegated: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4, Supabase (Postgres, Auth,
Storage, pgvector), Gemini behind a provider abstraction. Chosen for server-rendered private data,
RLS-enforced tenancy, and a single deployable web app that works well on phones.

## Users

People who attend or watch sermons and want to remember and study them: they take notes during
the service (often on a phone, in a dim sanctuary, trying not to distract neighbors), photograph
slides or handouts, and return during the week — at a kitchen table, desk, or in a small group —
to review, ask questions, and study the passages more deeply. Ages span teenagers to older adults
*(inferred)*, so legibility and large touch targets matter.

## Product Purpose

Turn a sermon plus the listener's own notes, photos, and documents into a structured,
source-grounded study notebook (the Sermon Pack), then help the listener review, ask questions,
and study during the week. Success is understanding and retention, not time-in-app.

## Positioning

Every claim traces back to evidence: a timestamp in the sermon, a line in the listener's own
notes, a photo, or a document. The listener's voice, the preacher's voice, Scripture, and AI
inference are never merged into one authoritative voice.

## Operating Context

- During the sermon: Sunday Mode — quick notes, photos, Scripture, bookmarks, questions; flaky
  church Wi-Fi; no AI interruptions.
- After the sermon: Finish Sermon → staged processing → Overview.
- During the week: review items, Ask AI with citations that jump to the moment in the video,
  generated Bible studies for personal, family, youth, or small-group use.

## Capabilities and Constraints

- Public YouTube sermons are analyzed directly; private/unlisted videos fall back to an uploaded
  recording (with rights confirmation) or notes/photos only.
- AI timestamps are approximate (`~28:15`); user corrections are authoritative and never overwritten.
- Scripture verse text is shown only from a licensed/public-domain provider; otherwise the
  reference alone.
- Optional integrations (Gemini Notebook, Meta Muse, TTS, video) are adapters, never dependencies.

## Brand Commitments

From the brief: calm, premium, modern, warm, editorial, focused. Warm neutral ground, excellent
typography, one restrained accent color, high-quality dark mode. No church clipart, no decorative
crosses, no generic SaaS card grids, no neon "AI" styling, no cheap gradients, no excessive
animation. Spiritual context comes from content and workflow, not decoration. No gamification,
streaks, points, or leaderboards.

## Evidence on Hand

No real users, testimonials, church partners, or sermon recordings are available. The synthetic
test sermon ("Faith in the Waiting", Pastor Dana Reyes, Grace Fellowship) used by automated tests
is fictional and must never appear as real content.

## Product Principles

1. Evidence before eloquence: show where every AI statement came from.
2. The listener's words are authoritative.
3. Note-taking never waits for AI.
4. Uncertainty is shown, not hidden.
5. Help people listen, read, and reflect — never replace it.

## Accessibility & Inclusion

WCAG 2.2 AA: semantic HTML, keyboard access, visible focus, captions/transcripts for generated
media, reduced-motion support, adjustable text size, meaning never conveyed by color alone.
