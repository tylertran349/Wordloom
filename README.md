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
- **Per-level resume** — Wordloom remembers the last word you opened in each CEFR deck, so the
  Resume button and deck badge take you back to that term instead of the top of the list.
- **Optional shared Google Sheets sync** — the deployed site points at one spreadsheet owned by the
  site owner. Each learner saves locally first, then enters an email to back up their progress into
  that sheet. No Google Cloud project, OAuth client, or per-device Apps Script setup is needed.
- **Extensive settings** for language pair, theme, accent, font size, motion, exercise count,
  hints, audio, scheduling, Google Translate behavior, AI providers, and backup/restore. Provider
  defaults (temperature, thinking) are used automatically unless you override them. Every setting
  is saved to `localStorage` automatically.
- **Optional AI** through **Google Gemini** or a **custom OpenAI-compatible endpoint**. Model
  names are free text, the OpenAI-compatible thinking level is free text too, and Gemini offers
  thinking levels in a dropdown. AI generates example sentences and practice exercises, and gives
  feedback on a translation.
- **Local-first storage** with JSON export/import, optional Google Sheets sync, and two-step
  destructive resets.

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
    site.ts            ← shared Google Sheet endpoint and legacy owner email
    storage.ts         ← defaults, normalization, backup, per-email local profiles
    sheets.ts          ← Google Sheets client + local sync state
    sheetsScript.ts    ← Apps Script bridge source shown in Settings
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

1. Read the word, meaning, and AI-generated examples. Text-to-speech uses Google Translate's free
   web voice by default, so the pronunciation sounds consistent on every device; you can switch to
   your browser's built-in voice in Settings for offline use.
2. Press **Generate with AI** on a word page to create a set of example sentences and
   native-language practice prompts. Generation is cached, so the same exercises come back on
   later visits.
3. Write your translation for each prompt. Drafts are saved automatically.
4. Press **Reveal with Google Translate** to fetch the target-language solution. You can copy it,
   play it aloud, or open the same sentence on translate.google.com. A direct link is always
   available when the fetch fails. The reveal also checks whether the solution visibly contains
   the studied term and notes when Google Translate picked a synonym or a different form.
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

## Google Sheets sync

Wordloom saves everything in your browser first. Google Sheets is an optional backup: add an email and
Wordloom copies your progress to one shared spreadsheet, so you can pick it up on another device. You
can keep using Wordloom offline and without an email.

### Turn sync on

1. Open **Settings → Google Sheets**.
2. Enter the email you want to use for Wordloom.
3. Press **Start syncing**.

That's it. There is no password, Google sign-in, spreadsheet URL, or setup to copy. Use the same
email on another device to load the same progress.

### What the buttons mean

| Button | What it does |
| --- | --- |
| **Sync now** | Compares this browser and the sheet and saves the newer copy. |
| **Use the sheet version** | Replaces this browser's progress with the copy in the sheet. |
| **Use this browser's version** | Replaces this email's rows in the sheet with this browser's progress. |
| **Log out** | Removes the email/Sheets link from this browser. Your local data stays. |

Wordloom asks before either replacement when both copies have changes.

### Good to know

- Your data is saved in this browser first. If Google is unreachable, Wordloom keeps working locally
  and tries again later.
- Each email has its own rows in the shared sheet. Adding a different email on the same browser loads
  that email's own progress and settings instead of mixing accounts.
- Everyone's data lives in one spreadsheet. Email-only sync is convenient, not private
  authentication: anyone who knows an email can open that email's data. Use an address you don't mind
  sharing, and don't store secrets in drafts.
- API keys stay on the device and never go into the sheet.

### If something looks wrong

| Problem | What to do |
| --- | --- |
| **"Google Sheets sync needs a one-time update"** | The site owner needs to update the Apps Script bridge. See **For the sheet owner** below. |
| **"Which copy should Wordloom keep?"** | Choose **Use the sheet version** for a new device or to keep the sheet. Choose **Use this browser's version** if you studied here and the sheet is out of date. |
| **I signed in with the wrong email** | Press **Log out**, then add the correct email. |
| **I don't see my old progress** | The old single-user data belongs to the sheet owner's email. Sign in with that address and choose **Use the sheet version**. |
| **Sync keeps failing** | Check your internet connection and any ad blocker, then press **Sync now**. Your local data is safe. |

### For the sheet owner

Most users never need this section. It covers the one shared spreadsheet and the Apps Script bridge
that connects Wordloom to it.

#### Connection details

The shared web app URL, spreadsheet URL, and the email that inherits the old single-user data live in
`src/lib/site.ts`. They can also be set at build time:

```bash
VITE_WORDLOOM_BRIDGE_URL=https://script.google.com/macros/s/…/exec
VITE_WORDLOOM_SHEET_URL=https://docs.google.com/spreadsheets/d/…
VITE_WORDLOOM_LEGACY_OWNER_EMAIL=owner@example.com
VITE_WORDLOOM_SYNC_TOKEN=optional-shared-secret
```

#### Set up a new sheet

1. Create a Google Sheet, for example at [sheets.new](https://sheets.new).
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the placeholder code, paste the bridge from **Settings → Google Sheets → Site owner setup**,
   and save.
4. Open **Deploy → New deployment → Web app**. Choose **Execute as: Me** and
   **Who has access: Anyone**, then deploy and authorize it. If Google warns that the app isn't
   verified, choose **Advanced → Go to … (unsafe)** — the script is yours and only accesses this
   spreadsheet.
5. Copy the web app URL ending in `/exec` into `src/lib/site.ts` (or
   `VITE_WORDLOOM_BRIDGE_URL`).

#### Update an existing sheet

1. Open the sheet and choose **Extensions → Apps Script**.
2. Replace the code with the latest bridge script from
   **Settings → Google Sheets → Site owner setup**.
3. Open **Deploy → Manage deployments**, edit the existing web app, choose **New version**, and click
   **Deploy**. Keep **Execute as: Me** and **Who has access: Anyone**.
4. The `/exec` URL stays the same, so no frontend change is needed.

The site checks the bridge version and refuses to sync with the old single-user script, so users do
not accidentally see the owner's data.

#### What happens to existing data

The first sync after the update migrates the old tabs in place:

- Every tab gets an `email` column.
- Old rows are assigned to the configured legacy owner email (`LEGACY_OWNER_EMAIL` in
  `src/lib/site.ts`).
- A `Wordloom Users` tab lists every email, when it was first and last seen, its last device, and its
  card/review counts.

Nothing is deleted. On the owner's browser, enter the legacy owner email in
**Settings → Google Sheets** and choose **Use the sheet version** if Wordloom asks. Your local data
stays in the browser; the sheet copy keeps the migrated progress. No browser is associated with the
owner email automatically.

#### What the sheet contains

The bridge creates readable tabs with an `email` column on every row:

| Tab | Rows |
| --- | --- |
| `Wordloom Meta` | per-email revision, device id, review totals, per-level resume positions; global `app`/`schema` |
| `Wordloom Settings` | every setting, JSON-encoded, per email |
| `Wordloom Cards` | one row per scheduled word, per email |
| `Wordloom Responses` / `Solutions` | saved drafts and revealed translations, per email |
| `Wordloom Examples` / `Practice` | AI-generated sentences, per email |
| `Wordloom Activity` | daily studied/review counts, per email |
| `Wordloom Review Log` | recent review grades, per email |
| `Wordloom Users` | email, first seen, last seen, last device, card count, review count |

Each sync rewrites only that email's rows. Editing cells by hand is not supported; change progress in
Wordloom instead. Other learners' rows are preserved.

#### Limits

Apps Script web apps have execution and concurrency quotas. The bridge takes a document lock and
rewrites only the affected tabs. That is comfortable for a personal or small-group deployment, but it
is not a high-traffic multi-tenant backend.

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

- Local-only settings and progress: `wordloom.settings.v1`, `wordloom.progress.v1`
- Per-email offline caches: `wordloom.settings.v1::<email>`, `wordloom.progress.v1::<email>`
- Translation cache: `wordloom.translations.v1`
- Google Sheets account, shared URL, and device id: `wordloom.sheets.v1`
- Translation requests go to Google (and MyMemory only if Google fails).
- AI requests go directly to the provider you configure.
- Sheet sync requests go to the shared Apps Script deployment baked into the build. The sheet owner
  can see every learner's rows, and anyone who knows the `/exec` URL or an email address can read
  that account's data when `TOKEN` is blank.
- There is no Wordloom server and no analytics.
- **Settings → Data** exports a complete JSON backup and can import it again. Deleting progress
  leaves vocabulary and settings intact. All resets require a second click.
- Local data is kept per profile. Logging out copies the current profile to the local-only keys; it
  does not delete local data. Adding another email swaps to that email's cache instead of mixing
  accounts.
- Backups contain any AI credentials saved in Settings. Store backup files privately. Sheets never
  receive those credentials.

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
