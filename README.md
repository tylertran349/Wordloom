# Wordloom

**Words that stick.** A local-first vocabulary studio for deliberate language practice.

Wordloom shows you a word in the language you are learning, its meaning and examples in your
native language, and five native-language sentences to translate. It uses Google Translate's
free web endpoint to reveal solutions, schedules reviews with a spaced-repetition algorithm, and
keeps every setting and every answer in your browser.

Default language pair: **Vietnamese → English**.

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

- **CEFR decks** split into A1, A2, B1, B2, C1, and C2.
- **Word pages** with pronunciation, part of speech, a native-language definition, an optional
  target-language definition, and examples with native-language translations.
- **Five translation exercises per word** with free-text inputs, saved drafts, and a
  **Reveal with Google Translate** button on every exercise. Solutions and direct links open
  without an API key.
- **Spaced repetition** (SM-2 style) for every studied word, with Again / Hard / Good / Easy
  grading, interval previews, due queues, extra practice, and review history.
- **Progress dashboard** with streaks, daily goals, a 14-day activity chart, a 7-day due
  forecast, a 12-week heat map, per-level coverage, and recent review history.
- **Extensive settings** for language pair, theme, accent, font size, motion, exercise count,
  hints, audio, scheduling, Google Translate behavior, AI providers, and backup/restore. Every
  setting is saved to `localStorage` automatically.
- **Optional AI** through **Google Gemini** or a **custom OpenAI-compatible endpoint**. Model
  names are free text; thinking levels are available in provider-specific dropdowns. AI can add
  extra practice sentences and give feedback on a translation.
- **Local-first storage** with JSON export/import and two-step destructive resets.

## Project structure

```
src/
  data/
    vocabulary.ts      ← your CEFR word arrays live here
    levels.ts          ← CEFR names and descriptions
    languages.ts       ← language pair options and TTS locales
  views/
    Dashboard.tsx
    Levels.tsx
    Study.tsx          ← word detail + 5 translation exercises
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
    storage.ts         ← defaults, normalization, backup
    router.ts, utils.ts, speech.ts
  types.ts
  index.css
```

## Adding vocabulary

Open `src/data/vocabulary.ts`. Each CEFR level is an array. Add entries using this shape:

```ts
{
  id: 'unique-slug',              // used in the URL and saved progress — keep it stable
  term: 'xin chào',               // word in the language being learned
  pronunciation: 'sin chow',      // optional
  partOfSpeech: 'greeting',       // optional
  definition: 'Hello…',           // meaning in the learner's native language
  definitionTarget: 'Lời chào…',  // optional meaning in the target language
  examples: [
    { target: 'Xin chào! Tôi tên là Lan.', native: 'Hello! My name is Lan.' }
  ],
  practice: [                     // native-language sentences to translate
    'Hello, my name is Minh.',
    'She smiled and said hello to everyone.',
    'Hello! How are you today?',
    'He always says hello when he enters the office.',
    'I said hello to my new neighbor this morning.'
  ],
  tags: ['greetings', 'basics']   // optional
}
```

The seed decks contain three Vietnamese words per level (18 words, each with five practice
sentences and multiple examples) so every screen has something to explore immediately. Add as
many words as you like. If a word has fewer than five practice sentences, examples are used to
fill the list; the AI generator can add more.

> Changing the language pair in Settings changes translation direction, speech, and exercise
> labels. It does **not** translate the vocabulary content. The seed content is Vietnamese with
> English definitions. Add a separate content set if you want another target language.

## How the exercises work

1. Read the word, meaning, and examples. Optional browser text-to-speech uses the target voice.
2. Write your translation for each of the five native-language sentences. Drafts are saved
   automatically.
3. Press **Reveal with Google Translate** to fetch the target-language solution. You can copy it,
   play it aloud, or open the same sentence on translate.google.com. A direct link is always
   available when the fetch fails.
4. Optionally use **Check with AI** for specific feedback (when a provider is configured).
5. Add the word to your review queue. Wordloom schedules its first check-in after the learning
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
- Thinking level: Auto, None, Minimal, Low, Medium, High — sent as `reasoning_effort`
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

## Tech

React 19, TypeScript, Vite, and plain CSS (no UI framework). Icons by lucide-react. Fonts:
Be Vietnam Pro and Inter from Google Fonts. All vocabulary, scheduling, and translation logic is
client-side.

---

Built to be filled with words. Add your own decks in `src/data/vocabulary.ts`.
