import type { TtsProvider } from '../types';

/**
 * Google Translate's free web TTS endpoint. It needs no API key; the browser
 * simply plays the MP3 it returns. Requests are split into short chunks because
 * the endpoint rejects long `q` values.
 */
const GOOGLE_TTS_ENDPOINT = 'https://translate.google.com/translate_tts';
const GOOGLE_TTS_CHAR_LIMIT = 190;
const GOOGLE_TTS_MAX_CHUNKS = 12;
const GOOGLE_TTS_LOAD_TIMEOUT_MS = 10_000;
const MIN_RATE = 0.5;
const MAX_RATE = 1.5;

let activeAudio: HTMLAudioElement | null = null;
let activeFinish: (() => void) | null = null;
let playbackToken = 0;

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function browserSpeak(text: string, lang: string, rate: number): boolean {
  if (!speechSupported() || !text.trim()) return false;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
    const prefix = lang.split('-')[0].toLowerCase();
    const voice = window.speechSynthesis
      .getVoices()
      .find((candidate) => candidate.lang.toLowerCase().replace('_', '-').startsWith(prefix));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Stops any speech that is currently playing, from either provider. */
export function cancelSpeech(): void {
  playbackToken += 1;
  const audio = activeAudio;
  activeAudio = null;
  if (audio) {
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch {
      // Ignore teardown failures.
    }
  }
  activeFinish?.();
  activeFinish = null;
  if (speechSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore teardown failures.
    }
  }
}

function googleTtsLanguage(lang: string): string {
  const [base, region] = lang.replace('_', '-').split('-');
  const normalized = base.toLowerCase();
  // Chinese needs its script/region qualifier; every other supported language
  // is fine with the base code.
  if (normalized === 'zh') return `zh-${(region ?? 'CN').toUpperCase()}`;
  return normalized;
}

function buildGoogleTtsUrl(text: string, lang: string): string {
  const params = new URLSearchParams({
    ie: 'UTF-8',
    q: text,
    tl: googleTtsLanguage(lang),
    client: 'tw-ob',
    ttsspeed: '1',
  });
  return `${GOOGLE_TTS_ENDPOINT}?${params.toString()}`;
}

function splitForGoogleTts(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining && chunks.length < GOOGLE_TTS_MAX_CHUNKS) {
    if (remaining.length <= GOOGLE_TTS_CHAR_LIMIT) {
      chunks.push(remaining);
      break;
    }

    const windowText = remaining.slice(0, GOOGLE_TTS_CHAR_LIMIT);
    let cut = -1;
    for (let index = windowText.length - 1; index >= 0; index -= 1) {
      if (/[.!?。！？;；,，、:：\s]/.test(windowText[index])) {
        cut = index + 1;
        break;
      }
    }
    // Avoid making a tiny chunk when the only separator sits near the start.
    if (cut < GOOGLE_TTS_CHAR_LIMIT * 0.4) cut = windowText.length;
    // Never split a surrogate pair.
    const lastCode = remaining.charCodeAt(cut - 1);
    if (cut > 1 && lastCode >= 0xd800 && lastCode <= 0xdbff) cut -= 1;

    const chunk = remaining.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(cut).trim();
  }

  return chunks;
}

function playChunk(
  url: string,
  rate: number,
  onStarted?: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio();
    let settled = false;
    let started = false;
    let timer: number | undefined;

    const clearTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = undefined;
    };

    const cleanup = () => {
      clearTimer();
      if (activeAudio === audio) activeAudio = null;
      if (activeFinish === finish) activeFinish = null;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {
        // Ignore teardown failures.
      }
      reject(error instanceof Error ? error : new Error('Audio playback failed.'));
    };

    const markStarted = () => {
      if (started) return;
      started = true;
      // The timeout only guards loading; playback can take longer than 10s.
      clearTimer();
      onStarted?.();
    };

    audio.preload = 'auto';
    audio.playbackRate = Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
    // Keep the voice natural when the user adjusts the speed.
    if ('preservesPitch' in audio) {
      audio.preservesPitch = true;
    } else if ('webkitPreservesPitch' in audio) {
      (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
    }

    activeAudio = audio;
    activeFinish = finish;
    audio.addEventListener('playing', markStarted, { once: true });
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener(
      'error',
      () => fail(new Error('Google Translate audio could not be loaded.')),
      { once: true },
    );

    // Start the load timer before setting `src`: cached audio can begin
    // playing very quickly, and markStarted() must be able to clear it.
    timer = window.setTimeout(
      () => fail(new Error('Google Translate audio timed out.')),
      GOOGLE_TTS_LOAD_TIMEOUT_MS,
    );
    audio.src = url;

    try {
      const startedPlaying = audio.play();
      if (startedPlaying && typeof startedPlaying.then === 'function') {
        startedPlaying.then(markStarted, fail);
      }
    } catch (error) {
      fail(error);
    }
  });
}

async function googleSpeak(
  text: string,
  lang: string,
  rate: number,
  token: number,
  onStarted?: () => void,
): Promise<boolean> {
  const chunks = splitForGoogleTts(text);
  if (chunks.length === 0) return false;

  for (let index = 0; index < chunks.length; index += 1) {
    if (token !== playbackToken) return true;
    await playChunk(
      buildGoogleTtsUrl(chunks[index], lang),
      rate,
      index === 0 ? onStarted : undefined,
    );
  }

  return true;
}

/**
 * Speaks `text` with the selected provider.
 *
 * Google Translate TTS is used by default because it sounds the same on every
 * platform. If it is unreachable (offline, blocked network, autoplay policy),
 * this falls back to the browser's built-in voice so study cards stay usable.
 *
 * Resolves once playback has started (or failed), not when it finishes, so
 * callers can report errors promptly.
 */
export async function speakText(
  text: string,
  lang: string,
  rate: number,
  provider: TtsProvider = 'google',
): Promise<boolean> {
  cancelSpeech();
  const clean = text.trim();
  if (!clean) return false;

  if (provider === 'browser') return browserSpeak(clean, lang, rate);

  const token = playbackToken;
  let reported = false;
  let resolveStarted: (ok: boolean) => void = () => {};
  const started = new Promise<boolean>((resolve) => {
    resolveStarted = resolve;
  });

  const reportStarted = (ok: boolean) => {
    if (reported) return;
    reported = true;
    resolveStarted(ok);
  };

  // Keep playing the remaining chunks in the background while the promise
  // resolves as soon as the first one is audible.
  void (async () => {
    try {
      await googleSpeak(clean, lang, rate, token, () => reportStarted(true));
      reportStarted(true);
    } catch {
      if (token !== playbackToken) {
        reportStarted(true);
        return;
      }
      // If sound already started, don't restart the whole sentence in another
      // voice just because a later chunk failed.
      if (!reported) reportStarted(browserSpeak(clean, lang, rate));
    }
  })();

  return started;
}
