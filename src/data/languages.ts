export interface LanguageOption {
  code: string;
  label: string;
  nativeName: string;
  /** BCP-47 locale for speech synthesis. */
  tts: string;
}

/**
 * Languages offered in Settings. `code` is also the ISO code used by Google
 * Translate's free web endpoint.
 */
export const LANGUAGES: LanguageOption[] = [
  { code: 'vi', label: 'Vietnamese', nativeName: 'Tiếng Việt', tts: 'vi-VN' },
  { code: 'en', label: 'English', nativeName: 'English', tts: 'en-US' },
  { code: 'es', label: 'Spanish', nativeName: 'Español', tts: 'es-ES' },
  { code: 'fr', label: 'French', nativeName: 'Français', tts: 'fr-FR' },
  { code: 'de', label: 'German', nativeName: 'Deutsch', tts: 'de-DE' },
  { code: 'it', label: 'Italian', nativeName: 'Italiano', tts: 'it-IT' },
  { code: 'pt', label: 'Portuguese', nativeName: 'Português', tts: 'pt-BR' },
  { code: 'ja', label: 'Japanese', nativeName: '日本語', tts: 'ja-JP' },
  { code: 'ko', label: 'Korean', nativeName: '한국어', tts: 'ko-KR' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', nativeName: '简体中文', tts: 'zh-CN' },
  { code: 'th', label: 'Thai', nativeName: 'ไทย', tts: 'th-TH' },
  { code: 'id', label: 'Indonesian', nativeName: 'Bahasa Indonesia', tts: 'id-ID' },
  { code: 'ru', label: 'Russian', nativeName: 'Русский', tts: 'ru-RU' },
  { code: 'ar', label: 'Arabic', nativeName: 'العربية', tts: 'ar-SA' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', tts: 'hi-IN' },
  { code: 'tr', label: 'Turkish', nativeName: 'Türkçe', tts: 'tr-TR' },
  { code: 'nl', label: 'Dutch', nativeName: 'Nederlands', tts: 'nl-NL' },
  { code: 'pl', label: 'Polish', nativeName: 'Polski', tts: 'pl-PL' },
];

export function getLanguage(code: string): LanguageOption {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

const VOICE_SAMPLES: Record<string, string> = {
  vi: 'Xin chào, rất vui được gặp bạn.',
  en: 'Hello, nice to meet you.',
  es: 'Hola, mucho gusto.',
  fr: 'Bonjour, ravi de vous rencontrer.',
  de: 'Hallo, schön dich kennenzulernen.',
  it: 'Ciao, piacere di conoscerti.',
  pt: 'Olá, prazer em conhecer você.',
  ja: 'こんにちは、はじめまして。',
  ko: '안녕하세요, 반갑습니다.',
  'zh-CN': '你好，很高兴认识你。',
  th: 'สวัสดี ยินดีที่ได้รู้จัก',
  id: 'Halo, senang bertemu denganmu.',
  ru: 'Здравствуйте, приятно познакомиться.',
  ar: 'مرحبًا، سعيد بلقائك.',
  hi: 'नमस्ते, आपसे मिलकर खुशी हुई।',
  tr: 'Merhaba, tanıştığımıza memnun oldum.',
  nl: 'Hallo, leuk je te ontmoeten.',
  pl: 'Cześć, miło cię poznać.',
};

export function getVoiceSample(code: string): string {
  return VOICE_SAMPLES[code] ?? getLanguage(code).nativeName;
}
