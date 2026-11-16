# Wordloom

**Words that stick.** A local-first vocabulary studio for deliberate language practice.

Wordloom shows you a word in the language you are learning, its meaning, AI-generated examples, and
native-language sentences to translate. It uses Google Translate's free web endpoint to reveal
solutions, schedules reviews with a spaced-repetition algorithm, and keeps every setting and every
answer in your browser.

Default language pair: **Northern Vietnamese (Hanoi standard) → English**.

---

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). To build a static site:

```bash
npm run build
npm run preview
```

The production build is in `dist/`. It uses hash routing (`#/level/A1`, `#/review`, …), so it
works on GitHub Pages, Netlify, Vercel, or any static host without server rewrites. Vite is
configured with `base: './'` so subpath deployments work too.

## What is included

- **CEFR decks** for A1, A2, B1, and B2 — 3,000 northern Vietnamese words in total (800 / 800 /
  750 / 650). The C1 and C2 decks are present but intentionally empty.
- **Word pages** with audio pronunciation, part of speech, a native-language definition, an optional
  target-language definition, and AI-generated examples with native-language translations.
- **Translation exercises generated with AI** — example sentences and practice prompts are created
  for each word on demand, with free-text inputs, saved drafts, and a **Reveal with Google
  Translate** button on every exercise. Solutions and direct links open without an API key.
- **Spaced repetition** (SM-2 style) for every studied word, with Again / Hard / Good / Easy
  grading, interval previews, due queues, extra practice, and review history.
- **Progress dashboard** with streaks, daily goals, a 14-day activity chart, a 7-day due
  forecast, a 12-week heat map, per-level coverage, and recent review history.
- **Extensive settings** for language pair, theme, accent, font size, motion, exercise count,
  hints, audio, scheduling, Google Translate behavior, AI providers, and backup/restore. Provider
  defaults (temperature, thinking) are used automatically unless you override them. Every setting
  is saved to `localStorage` automatically.
- **Optional AI** through **Google Gemini** or a **custom OpenAI-compatible endpoint**. Model
  names are free text, the OpenAI-compatible thinking level is free text too, and Gemini offers
  thinking levels in a dropdown. AI generates example sentences and practice exercises, and gives
  feedback on a translation.
- **Local-first storage** with JSON export/import and two-step destructive resets.

## Project structure

```
src/
  data/
    corpus/            ← compact source text for the 3,000-word northern Vietnamese deck
    vocabulary.ts      ← generated word arrays (do not edit directly)
    levels.ts          ← CEFR names and descriptions
    languages.ts       ← language pair options and TTS locales
  views/
    Dashboard.tsx
    Levels.tsx
    Study.tsx          ← word detail + AI-generated translation exercises
    Review.tsx         ← spaced-repetition session
    Progress.tsx
    Settings.tsx
  components/
    TranslationExercise.tsx
    SolutionReveal.tsx
    Sidebar.tsx, Toast.tsx, ui.tsx
  context/AppContext.tsx
  lib/
    srs.ts             ← scheduling algorithm
    googleTranslate.ts ← free endpoint + fallback + cache
    ai.ts              ← Gemini / OpenAI-compatible client
    modelDefaults.ts   ← per-model temperature defaults and suggestions
    storage.ts         ← defaults, normalization, backup
    router.ts, utils.ts, speech.ts
  types.ts
  index.css
```

## Editing vocabulary

The deck is generated from plain-text corpus files in `src/data/corpus/` — one folder and one
line per word. Edit or add a line, then rebuild:

```bash
npm run vocab:build
```

```text
term|part of speech|definition|tag, tag
thủ tục hành chính|noun|Administrative procedure; paperwork.|admin,government
```

The build slugs the term into a stable id, checks that all 3,000 lines are unique, and writes
`src/data/vocabulary.ts`. Add or remove files freely; they are read in filename order. Keep the
totals in `scripts/build-vocabulary.mjs` in sync if you deliberately change the deck size.

The deck uses northern Vietnamese (Hanoi standard) vocabulary and spelling. Prefer northern forms
and avoid southern regional words and southern-only chat spellings. Word ids are derived from the
term, so keeping a term unchanged keeps its existing study progress attached; changing a term
starts that word fresh.

Generated entries use this shape:

```ts
{
  id: 'thu-tuc-hanh-chinh',       // used in the URL and saved progress
  term: 'thủ tục hành chính',     // word in the language being learned
  partOfSpeech: 'noun',
  definition: 'Administrative procedure; paperwork.', // meaning in the native language
  tags: ['admin', 'government']
}
```

`pronunciation` and `definitionTarget` remain optional in the type, but the generated deck omits
them to keep the corpus compact. Every word page has a text-to-speech button, and the English
definition is the primary gloss.

The decks are vocabulary only. Example sentences and translation exercises are not stored in the
data file: they are generated with AI the first time you ask for exercises on a word page, then
cached in your browser's progress. A word you have never generated content for simply shows a
**Generate with AI** button.

The built-in deck covers A1–B2 everyday northern Vietnamese, with extra weight on conversation,
work, services, and texting shortcuts. C1 and C2 are left empty by design.

> Changing the language pair in Settings changes translation direction, speech, and exercise
> labels. It does **not** translate the vocabulary content. The built-in content is Vietnamese
> with English definitions. Add a separate content set if you want another target language.

## How the exercises work

1. Read the word, meaning, and AI-generated examples. Optional browser text-to-speech uses the
   target voice.
2. Press **Generate with AI** on a word page to create a set of example sentences and
   native-language practice prompts. Generation is cached, so the same exercises come back on
   later visits.
3. Write your translation for each prompt. Drafts are saved automatically.
4. Press **Reveal with Google Translate** to fetch the target-language solution. You can copy it,
   play it aloud, or open the same sentence on translate.google.com. A direct link is always
   available when the fetch fails.
5. Optionally use **Check with AI** for specific feedback (when a provider is configured).
6. Add the word to your review queue. Wordloom schedules its first check-in after the learning
   step (default 10 minutes).

The reveal button uses:

```
https://translate.googleapis.com/translate_a/single?client=gtx&sl=…&tl=…&dt=t&q=…
```

No API key or account is required. If that endpoint is blocked by a network or extension,
Wordloom tries MyMemory's free endpoint once, then falls back to the direct Google Translate
link. Successful translations are cached in local storage. You can test the endpoint and clear
the cache in **Settings → Translate**.

## Spaced repetition

`srs.ts` implements a lightly customized SM-2 schedule:

| Grade | Effect |
| --- | --- |
| **Again** | resets repetitions, lowers ease, returns after the learning step |
| **Hard** | 12 hours for a new card; later, restrained growth that stays below the Good interval |
| **Good** | 1 day for a new card; then max(current interval + 1 day, interval × ease) |
| **Easy** | 3 days for a new card; later, the Good interval × the easy bonus |

Cards are marked **mastered** once their interval reaches 21 days. Reviews due now feed the
review queue; **Practice anyway** on the empty review screen lets you revisit studied words
early. All scheduling values (starting ease, easy bonus, hard multiplier, max interval, learning
step, session limit) are editable in Settings.

## AI providers

AI is optional. Add credentials in **Settings → AI provider**.

### Advanced settings

Wordloom follows each provider's defaults unless you change them. The **Advanced sampling** section
keeps **temperature** greyed out and lets the model decide: known Gemini and OpenAI chat families
omit the parameter entirely, reasoning models that manage their own sampling never receive it, and
models without a published default get a suggested `0.7`. Flip **Use the model's default
temperature** off to send your own value. Thinking stays on **Auto (default)** for the same reason —
the parameter is omitted so the provider applies its own behaviour.

### Google Gemini

- API key (stored only in this browser's local storage)
- Free-text model name, e.g. `gemini-2.5-flash`
- Thinking level: Auto, Minimal, Low, Medium, High
- Gemini 2.5 models receive a mapped `thinkingBudget`; newer models receive `thinkingLevel`.
- Requests go directly to `generativelanguage.googleapis.com`.

### Custom OpenAI-compatible

- Base URL, e.g. `https://api.openai.com/v1`, an OpenRouter URL, or a local server
- API key (optional, for local endpoints that don't need one)
- Free-text model name
- Free-text thinking level, sent as `reasoning_effort` (for example `minimal`, `low`, `medium`, or
  `high`). Leave it blank or enter `auto` to omit the parameter and use the provider default.
- If a server rejects `reasoning_effort`, `temperature`, or `max_tokens`, the client retries with
  a compatible request shape.

Use **Test connection** to verify the provider, key, model, and thinking settings. Some hosted
providers block browser-origin requests; use a CORS-enabled endpoint or a small local proxy if
that happens.

Keys are stored in plain local storage — not encrypted. Don't use a sensitive key on a shared
computer.

## Data and privacy

- Settings: `wordloom.settings.v1`
- Study progress: `wordloom.progress.v1`
- Translation cache: `wordloom.translations.v1`
- Translation requests go to Google (and MyMemory only if Google fails).
- AI requests go directly to the provider you configure.
- There is no Wordloom server and no analytics.
- **Settings → Data** exports a complete JSON backup and can import it again. Deleting progress
  leaves vocabulary and settings intact. All resets require a second click.
- Backups contain any AI credentials saved in Settings. Store backup files privately.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check with TypeScript and build for production |
| `npm run preview` | Preview the production build |
| `npm run vocab:build` | Rebuild `src/data/vocabulary.ts` from `src/data/corpus/` |

## Tech

React 19, TypeScript, Vite, and plain CSS (no UI framework). Icons by lucide-react. Fonts:
Be Vietnam Pro and Inter from Google Fonts. All vocabulary, scheduling, and translation logic is
client-side.

---

Built to be filled with words. Add your own decks in `src/data/corpus/` and run
`npm run vocab:build`.
