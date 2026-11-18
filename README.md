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
- **Randomized new-word order** — by default the next word you study is picked fresh at random from
  the words you have not studied yet, so every pick feels like a new draw instead of a fixed
  sequence. Deck order follows the vocabulary file instead; you can switch in the level toolbar or
  Settings → Study, or reshuffle the list order at any time. Words you have opened but chose not to
  add to the
  review queue are remembered as seen and are skipped when Wordloom picks your next new word, so
  you never get re-served a word you already passed over.
- **Word pages** with audio pronunciation, part of speech, a native-language definition, an optional
  target-language definition, and AI-generated examples with native-language translations.
- **Translation exercises generated with AI** — example sentences and practice prompts are created
  for each word on demand, with free-text inputs (your typed answers are never saved, synced, or
  pre-filled — they live only on screen), and a **Reveal with Google Translate** button on every
  exercise. Solutions and direct links open without an API key.
- **Spaced repetition** (SM-2 style) for every studied word, with Again / Hard / Good / Easy
  grading, interval previews, due queues, extra practice, and review history.
- **Progress dashboard** with streaks, daily goals, a 14-day activity chart, a 7-day due
  forecast, a 12-week heat map, per-level coverage, and recent review history.
- **Per-level resume** — Wordloom remembers the last word you opened in each CEFR deck, so the
  Resume button and deck badge take you back to that term instead of the top of the list.
- **Optional Google Sheets sync** — each learner signs in with Google, picks or creates a
  spreadsheet they own, and Wordloom keeps it updated in the background. No Google Cloud project,
  OAuth client, or per-device Apps Script setup is needed.
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
    site.ts            ← data bridge, connect page, owner email, allowed origins
    storage.ts         ← defaults, normalization, backup, per-email local profiles
    sheets.ts          ← Google Sheets client + local sync state
    sheetConnect.ts    ← Google sign-in URL + returned connection
    wordloom-sheets.gs ← the Apps Script to paste into Google (one file, two deployments)
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
data file: they are generated with AI and cached in your browser's progress. When AI features are
enabled, opening a word you have not studied yet generates its example sentences automatically.
Anywhere examples or exercises appear, a **Generate examples** button and a **Generate exercises**
button let you create more of each kind independently.

The built-in deck covers A1–B2 everyday northern Vietnamese, with extra weight on conversation,
work, services, and texting shortcuts. C1 and C2 are left empty by design.

> Changing the language pair in Settings changes translation direction, speech, and exercise
> labels. It does **not** translate the vocabulary content. The built-in content is Vietnamese
> with English definitions. Add a separate content set if you want another target language.

## How the exercises work

1. Read the word, meaning, and AI-generated examples. Text-to-speech uses Google Translate's free
   web voice by default, so the pronunciation sounds consistent on every device; you can switch to
   your browser's built-in voice in Settings for offline use.
2. Example sentences are generated automatically for new words. Use **Generate examples** or
   **Generate exercises** wherever they appear to add more of either kind; the two requests are
   separate and cached, so existing content comes back on later visits.
3. Write your translation for each prompt. Answers are never saved or pre-filled; they disappear
   when you leave the page.
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

Wordloom saves everything in your browser first. Google Sheets is an optional backup that lives in a
spreadsheet you own. Signing in with Google confirms your account, then you pick an existing
spreadsheet or create a new one. Existing Wordloom tabs and progress are kept, and other tabs in the
sheet are never touched.

### Turn sync on

1. Open **Settings → Google Sheets**.
2. Press **Sign in with Google**.
3. On Google's page, approve access, then pick a spreadsheet or create a new one.
4. Wordloom returns to Settings and, if the sheet already has progress, asks which copy to keep.

There is no password, no Google Cloud project, and no spreadsheet URL to copy. Signing in on another
device with the same Google account reconnects to the same spreadsheet.

### Existing sheets and old progress

- Picking a sheet that already has Wordloom tabs keeps every tab and row. If the data belongs to an
  older email, Wordloom offers to move that progress to your Google account before connecting.
- Other tabs in the spreadsheet are left alone.
- Nothing is overwritten silently. When both sides have data, Wordloom shows **Use the sheet
  version** and **Use this browser's version**.
- **Import from the old shared sheet** in Settings copies progress saved under an email in the old
  shared spreadsheet into your own sheet. Enter the email you used there.

### What the buttons mean

| Button | What it does |
| --- | --- |
| **Sync now** | Compares this browser and the sheet and saves the newer copy. |
| **Use the sheet version** | Replaces this browser's progress with the copy in the sheet. |
| **Use this browser's version** | Replaces your sheet's rows with this browser's progress. |
| **Change** | Opens Google to pick or create another spreadsheet. |
| **Log out** | Removes the connection from this browser. Your local data stays. The sheet remains shared with the site owner; remove that share in Google Drive if you want to revoke it. |

### Good to know

- Your data is saved in this browser first. If Google is unreachable, Wordloom keeps working locally
  and tries again later.
- Each learner's progress lives in their own spreadsheet. Signing in with a different Google account
  loads that account's own progress instead of mixing accounts.
- The site owner's Google account keeps edit access to each connected sheet, because the background
  bridge writes with that account. That is what makes sync work without a server. Remove the share in
  Google Drive to revoke access.
- API keys are saved in this browser and, when Google Sheets sync is on, in your own sheet's
  `Wordloom Settings` tab so your other devices can use them. Keep the sheet private. The legacy
  email-only shared sheet never receives API keys.
- Google may show an "unverified app" warning. Choose **Advanced → Continue**; the script is the one
  described below.

### If something looks wrong

| Problem | What to do |
| --- | --- |
| **"Google Sheets sync needs a one-time update"** | The site owner needs to update the Apps Script bridge. See **For the site owner** below. |
| **"Which copy should Wordloom keep?"** | Choose **Use the sheet version** for a new device or to keep the sheet. Choose **Use this browser's version** if you studied here and the sheet is out of date. |
| **"This spreadsheet already has Wordloom data for another account"** | Confirm the move when Google returns you to Wordloom, or pick a different sheet. |
| **I signed in with the wrong Google account** | Press **Log out**, then sign in again. |
| **Sync keeps failing** | Check your internet connection and any ad blocker, then press **Sync now**. Your local data is safe. |

### For the site owner

Most users never need this section. It covers the two Apps Script deployments and the Google account
that writes to everyone's sheets.

#### Connection details

The data web app URL and the connect page URL live in `src/lib/site.ts`. They can also be set at
build time:

```bash
VITE_WORDLOOM_BRIDGE_URL=https://script.google.com/macros/s/…/exec
VITE_WORDLOOM_CONNECT_URL=https://script.google.com/macros/s/…/exec
VITE_WORDLOOM_SHEET_URL=https://docs.google.com/spreadsheets/d/…
VITE_WORDLOOM_SYNC_TOKEN=optional-shared-secret
```

The owner email and the origins the connect page may redirect back to are at the top of
`src/lib/wordloom-sheets.gs`. If you set `VITE_WORDLOOM_SYNC_TOKEN`, put the same value in `TOKEN`
in that file.

#### Set up the script

One script, two web-app deployments.

1. Create a Google Sheet (or reuse an old Wordloom sheet) and open **Extensions → Apps Script**.
2. Delete the placeholder code, paste the contents of `src/lib/wordloom-sheets.gs`, and save.
   The owner email and allowed site origins are at the top of that file.
3. **Data deployment:** **Deploy → New deployment → Web app**, choose **Execute as: Me** and **Who
   has access: Anyone**, then deploy and authorize. Copy the URL ending in `/exec` into
   `src/lib/site.ts` (or `VITE_WORDLOOM_BRIDGE_URL`).
4. **Connect deployment:** **Deploy → New deployment → Web app** again, this time choose **Execute
   as: User accessing the web app** and **Who has access: Anyone with a Google account**. Deploy and
   authorize. Put that URL into `src/lib/site.ts` as `DEFAULT_CONNECT_URL` (or
   `VITE_WORDLOOM_CONNECT_URL`).
5. Rebuild the site.

Adding a version later keeps each deployment's URL. Use **Manage deployments → Edit → New version**
so the owner does not have to change the site config.

If Apps Script will not let the same project create a second deployment with a different **Execute
as**, create a standalone Apps Script project, paste the same script there, and use only the connect
deployment from it. The data deployment stays on the original project.

The script requests Google Drive access so it can list and share spreadsheets. Learners approve it
once per Google account. The connect page checks that it is running as the visiting user, so the
public data URL can never show another person's Drive contents.

#### What happens to existing data

- Picking a sheet with older single-user tabs (no `email` column) migrates those rows to the signed-in
  Google account in place.
- The legacy `Wordloom Responses` tab is deleted (or wiped) the next time the sheet is read or written.
  Typed translation attempts were never meant to be kept, and they are not stored anywhere anymore.
- Schema 6 adds the `Wordloom Seen` tab, which syncs the set of opened-but-skipped words. Re-paste
  the latest script and deploy a new version to bring an existing sheet up to date; missing tabs are
  created automatically on the next sync.
- Picking a sheet whose Wordloom rows belong to another email asks first, then re-keys those rows to
  the signed-in account.
- A sheet that already contains progress for several accounts is not merged silently; the connect
  page asks which account's progress to move.
- Other tabs in the sheet are never edited or deleted.

#### What the sheet contains

The script creates readable tabs with an `email` column on every row:

| Tab | Rows |
| --- | --- |
| `Wordloom Meta` | per-account revision, device id, review totals, per-level resume positions; global `schema`, `email`, and the sheet `token` |
| `Wordloom Settings` | every setting, JSON-encoded, per account |
| `Wordloom Cards` | one row per scheduled word, per account |
| `Wordloom Solutions` | cached Google Translate solutions, per account |
| `Wordloom Seen` | every opened word, per account; seen-but-skipped words are never offered as new |
| `Wordloom Examples` / `Practice` | AI-generated sentences, per account |
| `Wordloom Activity` | daily studied/review counts, per account |
| `Wordloom Review Log` | recent review grades, per account |
| `Wordloom Users` | first seen, last seen, last device, card count, review count |

Editing cells by hand is not supported; change progress in Wordloom instead.

#### Limits

Apps Script web apps have execution and concurrency quotas. The bridge takes a script lock and
rewrites only the affected tabs. That is comfortable for a personal or small-group deployment, but it
is not a high-traffic multi-tenant backend. The connect deployment also has a rate limit on new user
authorizations, and Google caps unverified apps at roughly 100 users.

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

- API key (saved in this browser and synced to your own Google Sheet when sync is on)
- Free-text model name, e.g. `gemini-2.5-flash`
- Thinking level: Auto, Minimal, Low, Medium, High
- Gemini 2.5 models receive a mapped `thinkingBudget`; newer models receive `thinkingLevel`.
- Requests go directly to `generativelanguage.googleapis.com`.

### Custom OpenAI-compatible

- Base URL, e.g. `https://api.openai.com/v1`, an OpenRouter URL, or a local server
- API key (optional, for local endpoints that don't need one; synced to your own Google Sheet when
  sync is on)
- Free-text model name
- Free-text thinking level, sent as `reasoning_effort` (for example `minimal`, `low`, `medium`, or
  `high`). Leave it blank or enter `auto` to omit the parameter and use the provider default.
- If a server rejects `reasoning_effort`, `temperature`, or `max_tokens`, the client retries with
  a compatible request shape.

Use **Test connection** to verify the provider, key, model, and thinking settings. Some hosted
providers block browser-origin requests; use a CORS-enabled endpoint or a small local proxy if
that happens.

Keys are stored in plain local storage and, when Google Sheets sync is on, in your own sheet — not
encrypted. Don't use a sensitive key on a shared computer or a shared sheet.

## Data and privacy

- Local-only settings and progress: `wordloom.settings.v1`, `wordloom.progress.v1`
- Per-email offline caches: `wordloom.settings.v1::<email>`, `wordloom.progress.v1::<email>`
- Translation cache: `wordloom.translations.v1`
- Google Sheets connection, sheet id, and per-sheet secret: `wordloom.sheets.v1`
- Translation requests go to Google (and MyMemory only if Google fails).
- AI requests go directly to the provider you configure.
- Sheet sync requests go to the Apps Script data bridge baked into the build. The bridge runs as the
  site owner's Google account, which is why each connected sheet is shared with it. Learners can
  remove that share in Google Drive at any time.
- The legacy email-only sheet (`TOKEN` blank) is still readable by anyone who knows an email address.
  New Google sign-ins use a per-sheet secret instead. API keys are never written to the legacy
  shared sheet.
- There is no Wordloom server and no analytics.
- **Settings → Data** exports a complete JSON backup and can import it again. Deleting progress
  leaves vocabulary and settings intact. All resets require a second click.
- Local data is kept per profile. Logging out copies the current profile to the local-only keys; it
  does not delete local data. Signing in with another Google account swaps to that account's cache
  instead of mixing accounts.
- Backups contain any AI credentials saved in Settings. The same keys are written to your Google
  Sheet when sync is on, so keep both the backup file and the sheet private.

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
