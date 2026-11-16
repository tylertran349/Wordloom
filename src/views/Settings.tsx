import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Unplug,
  Upload,
  Volume2,
} from 'lucide-react';
import type { AccentColor, Settings as SettingsType, ThemeMode } from '../types';
import { ALL_WORDS } from '../data/vocabulary';
import { getLanguage, getVoiceSample, LANGUAGES } from '../data/languages';
import { useApp } from '../context/AppContext';
import {
  GEMINI_MODEL_SUGGESTIONS,
  GEMINI_THINKING_LEVELS,
  OPENAI_MODEL_SUGGESTIONS,
  OPENAI_THINKING_LEVELS,
  activeProviderLabel,
  testAiConnection,
} from '../lib/ai';
import {
  clearTranslationCache,
  translateFree,
  translationCacheSize,
} from '../lib/googleTranslate';
import { temperaturePlan } from '../lib/modelDefaults';
import {
  formatBytes,
  clearAllWordloomStorage,
  getStorageFootprint,
  parseBackup,
} from '../lib/storage';
import {
  WORDLOOM_BRIDGE_FILENAME,
  WORDLOOM_BRIDGE_SOURCE,
} from '../lib/sheetsScript';
import { buildSyncLink } from '../lib/sheets';
import {
  cn,
  dayKey,
  downloadJSON,
  downloadText,
  formatInterval,
  formatShortDate,
  formatTime,
  pluralize,
} from '../lib/utils';
import { speakText } from '../lib/speech';
import { AppLink, LevelBadge, PageHeader, Toggle } from '../components/ui';

type Tab = 'general' | 'appearance' | 'study' | 'review' | 'translate' | 'ai' | 'sheets' | 'data';

const TABS: Array<{ id: Tab; label: string; icon: typeof SlidersHorizontal }> = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'study', label: 'Study', icon: BookOpen },
  { id: 'review', label: 'Review', icon: Brain },
  { id: 'translate', label: 'Translate', icon: Languages },
  { id: 'ai', label: 'AI provider', icon: Sparkles },
  { id: 'sheets', label: 'Google Sheets', icon: Cloud },
  { id: 'data', label: 'Data', icon: Database },
];

const THEMES: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const ACCENTS: Array<{ value: AccentColor; label: string }> = [
  { value: 'jade', label: 'Jade' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'coral', label: 'Coral' },
  { value: 'amber', label: 'Amber' },
  { value: 'violet', label: 'Violet' },
];

const MAX_INTERVAL_OPTIONS = [30, 60, 90, 180, 365, 730, 1825];
const LEARNING_STEP_OPTIONS = [1, 5, 10, 20, 30, 60, 120];

function Section({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {aside}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="setting-row">
      {htmlFor ? (
        <label className="setting-row-copy" htmlFor={htmlFor}>
          <span className="setting-row-label">{label}</span>
          {hint && <span className="setting-row-hint">{hint}</span>}
        </label>
      ) : (
        <div className="setting-row-copy">
          <span className="setting-row-label">{label}</span>
          {hint && <span className="setting-row-hint">{hint}</span>}
        </div>
      )}
      <div className="setting-row-control">{children}</div>
    </div>
  );
}

function RangeSetting({
  label,
  hint,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <Row label={label} hint={hint}>
      <div className={cn('range-control', disabled && 'is-disabled')}>
        <input
          className="range-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={typeof label === 'string' ? label : 'Temperature'}
          aria-disabled={disabled}
          disabled={disabled}
        />
        <span className="range-readout">{display}</span>
      </div>
    </Row>
  );
}

export function Settings() {
  const {
    settings,
    updateSettings,
    resetSettings,
    progress,
    importBackup,
    exportBackup,
    resetProgress,
    notify,
    sheetSync,
    sheetPhase,
    sheetBusy,
    connectSheet,
    disconnectSheet,
    syncSheet,
    pullSheet,
    pushSheet,
    resolveSheetConflict,
  } = useApp();
  const [tab, setTab] = useState<Tab>('general');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [translationTest, setTranslationTest] = useState<{
    loading: boolean;
    text?: string;
    provider?: string;
    error?: string;
  }>({ loading: false });
  const [cacheCount, setCacheCount] = useState(() => translationCacheSize());
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<'progress' | 'settings' | 'all' | null>(null);
  const [sheetUrlInput, setSheetUrlInput] = useState(sheetSync.connection?.sheetUrl ?? '');
  const [sheetBridgeInput, setSheetBridgeInput] = useState(sheetSync.connection?.endpoint ?? '');
  const [sheetTokenInput, setSheetTokenInput] = useState(sheetSync.connection?.token ?? '');
  const [showSheetToken, setShowSheetToken] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<{
    tone: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [showBridgeScript, setShowBridgeScript] = useState(false);
  const [copiedBridge, setCopiedBridge] = useState(false);
  const [copiedSyncLink, setCopiedSyncLink] = useState(false);
  const [confirmSheetPull, setConfirmSheetPull] = useState(false);
  const [confirmSheetPush, setConfirmSheetPush] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const deviceBytes = getStorageFootprint(settings, progress);
  const previewWord = ALL_WORDS[0];
  const geminiThinking =
    GEMINI_THINKING_LEVELS.find((option) => option.value === settings.geminiThinking) ??
    GEMINI_THINKING_LEVELS[0];
  const activeModel =
    settings.aiProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;
  const temperatureSettings = temperaturePlan(settings.aiProvider, activeModel);
  const followsModelTemperature =
    settings.temperatureMode !== 'custom' || temperatureSettings.source === 'unsupported';
  const shownTemperature = followsModelTemperature
    ? (temperatureSettings.defaultValue ?? settings.temperature)
    : settings.temperature;
  const temperatureDisplay =
    temperatureSettings.source === 'unsupported' ? '—' : shownTemperature.toFixed(1);
  const temperatureBadge =
    temperatureSettings.source === 'unsupported'
      ? 'Not supported'
      : !followsModelTemperature
        ? 'Custom'
        : temperatureSettings.source === 'model'
          ? 'Model default'
          : 'Suggested default';
  const temperatureHint =
    temperatureSettings.source === 'unsupported'
      ? 'This model chooses its own sampling; the slider has no effect.'
      : followsModelTemperature
        ? temperatureSettings.detail
        : 'Sent with every request. Turn the switch back on to use the model default again.';
  const translationSource = getLanguage(target.code === 'en' ? 'vi' : 'en');
  const translationSample =
    translationSource.code === 'vi'
      ? 'Xin chào, rất vui được gặp bạn.'
      : 'I would like a cup of coffee, please.';
  const sheetPhaseLabel =
    sheetPhase === 'syncing'
      ? 'Syncing'
      : sheetPhase === 'unsaved'
        ? 'Waiting to save'
        : sheetPhase === 'needs-decision'
          ? 'Needs a choice'
          : sheetPhase === 'error'
            ? 'Sync issue'
            : sheetPhase === 'idle'
              ? 'Synced'
              : 'Local only';

  useEffect(() => {
    setTranslationTest({ loading: false });
  }, [settings.targetLanguage, settings.nativeLanguage]);

  function updateAiSettings(patch: Partial<SettingsType>) {
    updateSettings(patch);
    setTestResult(null);
  }

  async function handleTestAi() {
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await testAiConnection(settings);
      const model =
        settings.aiProvider === 'gemini' ? settings.geminiModel : settings.openaiModel;
      setTestResult({
        ok: true,
        message: `${activeProviderLabel(settings)} replied using ${model}: “${reply}”`,
      });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : 'The connection test failed.',
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleTestTranslation() {
    setTranslationTest({ loading: true });
    try {
      const result = await translateFree(translationSample, translationSource.code, target.code);
      setCacheCount(translationCacheSize());
      setTranslationTest({
        loading: false,
        text: result.text,
        provider:
          result.provider === 'google'
            ? 'Google Translate (free endpoint)'
            : result.provider === 'mymemory'
              ? 'MyMemory fallback'
              : 'Saved translation cache',
      });
    } catch {
      setTranslationTest({
        loading: false,
        error:
          'The free endpoint could not be reached. A network or browser extension may be blocking it; direct Google Translate links on word pages still work.',
      });
    }
  }

  function handleClearCache() {
    const cleared = clearTranslationCache();
    setCacheCount(0);
    notify(`Cleared ${cleared} cached ${cleared === 1 ? 'translation' : 'translations'}.`, 'info');
  }

  function handleExport() {
    const backup = exportBackup();
    downloadJSON(`wordloom-backup-${dayKey()}.json`, backup);
    notify('Backup downloaded.');
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      importBackup(backup);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : 'Could not import this file. Choose a Wordloom backup JSON file.',
      );
    }
  }

  useEffect(() => {
    if (!sheetSync.connection) return;
    setSheetUrlInput(sheetSync.connection.sheetUrl);
    setSheetBridgeInput(sheetSync.connection.endpoint);
    setSheetTokenInput(sheetSync.connection.token);
  }, [sheetSync.connection]);

  async function handleSheetConnect() {
    setSheetMessage(null);
    const result = await connectSheet({
      sheetUrl: sheetUrlInput,
      endpoint: sheetBridgeInput,
      token: sheetTokenInput,
    });
    setSheetMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
  }

  async function handleSheetSyncNow() {
    setSheetMessage(null);
    const result = await syncSheet();
    setSheetMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
  }

  async function handleSheetPull() {
    if (!confirmSheetPull) {
      setConfirmSheetPull(true);
      return;
    }
    setConfirmSheetPull(false);
    setSheetMessage(null);
    const result = await pullSheet(true);
    setSheetMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
  }

  async function handleSheetPush() {
    if (!confirmSheetPush) {
      setConfirmSheetPush(true);
      return;
    }
    setConfirmSheetPush(false);
    setSheetMessage(null);
    const result = await pushSheet(true);
    setSheetMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
  }

  async function handleSheetDecision(choice: 'pull' | 'push') {
    setSheetMessage(null);
    const result = await resolveSheetConflict(choice);
    setSheetMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
  }

  function handleSheetDisconnect() {
    disconnectSheet();
    setConfirmSheetPull(false);
    setConfirmSheetPush(false);
    setSheetMessage({
      tone: 'info',
      text: 'Stopped syncing on this device. Local data and the sheet are unchanged.',
    });
  }

  async function copyBridgeScript() {
    try {
      await navigator.clipboard.writeText(WORDLOOM_BRIDGE_SOURCE);
      setCopiedBridge(true);
      window.setTimeout(() => setCopiedBridge(false), 2000);
    } catch {
      setShowBridgeScript(true);
      setSheetMessage({
        tone: 'error',
        text: 'Copy failed. Show the script and select it manually.',
      });
    }
  }

  function downloadBridgeScript() {
    downloadText(WORDLOOM_BRIDGE_FILENAME, WORDLOOM_BRIDGE_SOURCE);
    notify('Bridge script downloaded.');
  }

  async function copySyncLink() {
    const connection = sheetSync.connection;
    if (!connection) return;
    try {
      await navigator.clipboard.writeText(buildSyncLink(connection));
      setCopiedSyncLink(true);
      window.setTimeout(() => setCopiedSyncLink(false), 2000);
    } catch {
      setSheetMessage({
        tone: 'error',
        text: 'Copy failed. Select the Web app URL above and copy it manually.',
      });
    }
  }

  function handleReset(kind: 'progress' | 'settings' | 'all') {
    if (confirmReset !== kind) {
      setConfirmReset(kind);
      return;
    }
    if (kind === 'progress') {
      resetProgress();
    } else if (kind === 'settings') {
      resetSettings();
      setTestResult(null);
      notify('Settings restored to defaults.');
    } else {
      resetProgress();
      resetSettings();
      clearTranslationCache();
      clearAllWordloomStorage();
      disconnectSheet();
      setSheetUrlInput('');
      setSheetBridgeInput('');
      setSheetTokenInput('');
      setSheetMessage(null);
      setConfirmSheetPull(false);
      setConfirmSheetPush(false);
      setCacheCount(0);
      setTranslationTest({ loading: false });
      setTestResult(null);
      setImportError(null);
      notify('Everything has been reset to a fresh start.', 'info');
    }
    setConfirmReset(null);
  }

  async function testVoice() {
    const sample = getVoiceSample(target.code);
    const ok = await speakText(sample, target.tts, settings.ttsRate, settings.ttsProvider);
    if (ok) {
      notify(`Playing “${sample}” in ${target.label}.`, 'info');
    } else {
      notify('Speech playback is not available in this browser.', 'error');
    }
  }

  return (
    <div className="view">
      <PageHeader
        eyebrow="Make it yours"
        title="Settings"
        description={
          sheetSync.connection
            ? 'Changes save to this browser and sync to your Google Sheet.'
            : 'Every option is saved automatically to this browser. Wordloom stays local-first by default.'
        }
        actions={
          <span className={cn('saved-indicator', sheetPhase === 'error' && 'is-error')}>
            {sheetSync.connection ? (
              <Cloud size={14} aria-hidden="true" />
            ) : (
              <Check size={14} aria-hidden="true" />
            )}
            {sheetSync.connection
              ? sheetPhase === 'error'
                ? 'Sync issue'
                : sheetPhase === 'syncing'
                  ? 'Syncing…'
                  : sheetPhase === 'unsaved'
                    ? 'Unsaved'
                    : sheetPhase === 'needs-decision'
                      ? 'Needs a choice'
                      : 'Google Sheets'
              : 'Saved locally'}
          </span>
        }
      />

      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Settings sections">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn('settings-tab', tab === item.id && 'is-active')}
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? 'true' : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="settings-panel">
          {tab === 'general' && (
            <>
              <Section title="Your profile" description="A small personal touch for the daily greeting.">
                <Row
                  label="Display name"
                  hint="Leave blank to keep the generic “learner” greeting."
                  htmlFor="display-name"
                >
                  <input
                    id="display-name"
                    className="text-input setting-input"
                    value={settings.displayName}
                    maxLength={40}
                    placeholder="e.g. Alex"
                    onChange={(event) => updateSettings({ displayName: event.target.value })}
                  />
                </Row>
              </Section>

              <Section
                title="Language pair"
                description="These control translation direction, speech, and exercise labels. Vocabulary content remains whatever is in your data file."
              >
                <div className="language-pair">
                  <div className="language-field">
                    <label htmlFor="target-language">I am learning</label>
                    <div className="select-wrap">
                      <select
                        id="target-language"
                        className="select-input"
                        value={settings.targetLanguage}
                        onChange={(event) => updateSettings({ targetLanguage: event.target.value })}
                      >
                        {LANGUAGES.map((language) => (
                          <option key={language.code} value={language.code}>
                            {language.label} · {language.nativeName}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="language-swap icon-button"
                    onClick={() =>
                      updateSettings({
                        targetLanguage: settings.nativeLanguage,
                        nativeLanguage: settings.targetLanguage,
                      })
                    }
                    title="Swap languages"
                    aria-label="Swap target and native languages"
                  >
                    <ArrowLeftRight size={16} aria-hidden="true" />
                  </button>
                  <div className="language-field">
                    <label htmlFor="native-language">My native language</label>
                    <div className="select-wrap">
                      <select
                        id="native-language"
                        className="select-input"
                        value={settings.nativeLanguage}
                        onChange={(event) => updateSettings({ nativeLanguage: event.target.value })}
                      >
                        {LANGUAGES.map((language) => (
                          <option key={language.code} value={language.code}>
                            {language.label} · {language.nativeName}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                    </div>
                  </div>
                </div>
                {(settings.targetLanguage !== 'vi' || settings.nativeLanguage !== 'en') && (
                  <div className="inline-alert is-info">
                    <AlertCircle size={15} aria-hidden="true" />
                    <span>
                      The built-in vocabulary is Vietnamese with English definitions. Your language
                      pair controls Google Translate and speech; add another content set under{' '}
                      <code>src/data/corpus/</code> for a different target.
                    </span>
                  </div>
                )}
              </Section>

              <Section
                title="Daily practice"
                description="These are targets and session limits, not hard locks. Extra practice always counts."
              >
                <RangeSetting
                  label="Daily goal"
                  hint="Study sessions and reviews counted together."
                  min={1}
                  max={50}
                  value={settings.dailyGoal}
                  display={`${settings.dailyGoal} practices`}
                  onChange={(value) => updateSettings({ dailyGoal: value })}
                />
                <RangeSetting
                  label="New words per day"
                  hint="A gentle ceiling for fresh vocabulary."
                  min={1}
                  max={30}
                  value={settings.newWordsPerDay}
                  display={`${settings.newWordsPerDay} words`}
                  onChange={(value) => updateSettings({ newWordsPerDay: value })}
                />
                <RangeSetting
                  label="Review session limit"
                  hint="How many due words can enter one session."
                  min={5}
                  max={150}
                  value={settings.maxReviewsPerDay}
                  display={`${settings.maxReviewsPerDay} reviews`}
                  onChange={(value) => updateSettings({ maxReviewsPerDay: value })}
                />
              </Section>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <Section title="Theme" description="Choose the light that suits your desk.">
                <div className="theme-options" role="group" aria-label="Color theme">
                  {THEMES.map((theme) => {
                    const Icon = theme.icon;
                    return (
                      <button
                        key={theme.value}
                        type="button"
                        className={cn('theme-option', settings.theme === theme.value && 'is-active')}
                        onClick={() => updateSettings({ theme: theme.value })}
                        aria-pressed={settings.theme === theme.value}
                      >
                        <span className="theme-option-icon"><Icon size={19} aria-hidden="true" /></span>
                        <strong>{theme.label}</strong>
                        <span>
                          {theme.value === 'light'
                            ? 'Warm and clear'
                            : theme.value === 'dark'
                              ? 'Easy at night'
                              : 'Follow your device'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Accent color" description="Used for highlights, progress, and primary actions.">
                <div className="accent-options" role="group" aria-label="Accent color">
                  {ACCENTS.map((accent) => (
                    <button
                      key={accent.value}
                      type="button"
                      className={cn(
                        'accent-option',
                        settings.accent === accent.value && 'is-active',
                      )}
                      data-accent-option={accent.value}
                      onClick={() => updateSettings({ accent: accent.value })}
                      aria-pressed={settings.accent === accent.value}
                    >
                      <span className="accent-dot" />
                      {accent.label}
                      {settings.accent === accent.value && <Check size={14} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </Section>

              <Section
                title="Reading comfort"
                description="Small adjustments that make long sessions easier."
              >
                <RangeSetting
                  label="Font size"
                  hint="Scales the whole interface."
                  min={0.9}
                  max={1.2}
                  step={0.05}
                  value={settings.fontScale}
                  display={`${Math.round(settings.fontScale * 100)}%`}
                  onChange={(value) => updateSettings({ fontScale: value })}
                />
                <Toggle
                  label="Reduce motion"
                  description="Minimize transitions and animated feedback."
                  checked={settings.reduceMotion}
                  onChange={(value) => updateSettings({ reduceMotion: value })}
                />
              </Section>

              {previewWord && (
                <Section title="Preview" description="A live sample of your theme and accent.">
                  <div className="theme-preview">
                    <div className="theme-preview-head">
                      <div>
                        <span className="eyebrow">A1 · Preview</span>
                        <h3 className="lang-target" lang={target.code}>{previewWord.term}</h3>
                        <p>{previewWord.definition}</p>
                      </div>
                      <LevelBadge level={previewWord.level} />
                    </div>
                    <div className="theme-preview-actions">
                      <span className="button button-primary">Primary action</span>
                      <span className="button button-ghost">Secondary</span>
                      <span className="progress-bar is-small">
                        <span style={{ width: '68%' }} />
                      </span>
                    </div>
                  </div>
                </Section>
              )}
            </>
          )}

          {tab === 'study' && (
            <>
              <Section
                title="Exercises"
                description="How much production practice you see on each word page."
              >
                <RangeSetting
                  label="Sentences per word"
                  hint="Sets how many practice sentences AI generates per batch. Examples are generated alongside the exercises."
                  min={3}
                  max={10}
                  value={settings.exercisesPerWord}
                  display={`${settings.exercisesPerWord} sentences`}
                  onChange={(value) => updateSettings({ exercisesPerWord: value })}
                />
                <Toggle
                  label="Show hints while translating"
                  description="Display the target word and its meaning above each input."
                  checked={settings.showExerciseHints}
                  onChange={(value) => updateSettings({ showExerciseHints: value })}
                />
              </Section>

              <Section title="Word display" description="Control what appears on study cards and word rows.">
                <Toggle
                  label="Pronunciation hints"
                  description="Show the phonetic hint beside words and headings."
                  checked={settings.showPronunciation}
                  onChange={(value) => updateSettings({ showPronunciation: value })}
                />
                <Toggle
                  label="Part of speech"
                  description="Show labels such as noun, verb, or phrase."
                  checked={settings.showPartOfSpeech}
                  onChange={(value) => updateSettings({ showPartOfSpeech: value })}
                />
                <Toggle
                  label="Example translations"
                  description="Reveal the native-language translation under each example by default."
                  checked={settings.showExampleTranslations}
                  onChange={(value) => updateSettings({ showExampleTranslations: value })}
                />
              </Section>

              <Section
                title="Audio"
                description="Choose how words are spoken. Google Translate sounds the same on every device; browser voices work offline."
              >
                <Row
                  label="Speech voice"
                  hint="Google Translate plays short audio clips from the web. Browser voices depend on what your device provides."
                  htmlFor="tts-provider"
                >
                  <div className="select-wrap">
                    <select
                      id="tts-provider"
                      className="select-input select-medium"
                      value={settings.ttsProvider}
                      onChange={(event) =>
                        updateSettings({
                          ttsProvider: event.target.value as SettingsType['ttsProvider'],
                        })
                      }
                    >
                      <option value="google">Google Translate</option>
                      <option value="browser">Browser voice</option>
                    </select>
                    <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                  </div>
                </Row>
                <Toggle
                  label="Speak words automatically"
                  description="Play the target word when a study page opens."
                  checked={settings.autoplayAudio}
                  onChange={(value) => updateSettings({ autoplayAudio: value })}
                />
                <RangeSetting
                  label="Speech speed"
                  hint="A slower pace can help with tonal languages."
                  min={0.5}
                  max={1.3}
                  step={0.05}
                  value={settings.ttsRate}
                  display={`${settings.ttsRate.toFixed(2)}×`}
                  onChange={(value) => updateSettings({ ttsRate: value })}
                />
                <div className="setting-action-row">
                  <span>Preview the {target.label} voice</span>
                  <button type="button" className="button button-ghost button-small" onClick={testVoice}>
                    <Volume2 size={14} aria-hidden="true" />
                    Test voice
                  </button>
                </div>
              </Section>
            </>
          )}

          {tab === 'review' && (
            <>
              <Section
                title="Spaced repetition"
                description="A lightly customized SM-2 schedule. Changes apply to future reviews; existing due dates stay as they are."
              >
                <RangeSetting
                  label="Starting ease"
                  hint="Higher values create longer intervals for new words."
                  min={1.3}
                  max={3.5}
                  step={0.05}
                  value={settings.startingEase}
                  display={settings.startingEase.toFixed(2)}
                  onChange={(value) => updateSettings({ startingEase: value })}
                />
                <RangeSetting
                  label="Easy bonus"
                  hint="Extra multiplier when you choose Easy."
                  min={1}
                  max={2}
                  step={0.05}
                  value={settings.easyBonus}
                  display={`×${settings.easyBonus.toFixed(2)}`}
                  onChange={(value) => updateSettings({ easyBonus: value })}
                />
                <RangeSetting
                  label="Hard multiplier"
                  hint="Interval growth when you choose Hard."
                  min={1}
                  max={2}
                  step={0.05}
                  value={settings.hardMultiplier}
                  display={`×${settings.hardMultiplier.toFixed(2)}`}
                  onChange={(value) => updateSettings({ hardMultiplier: value })}
                />
                <Row
                  label="Maximum interval"
                  hint="No word is scheduled farther than this."
                  htmlFor="max-interval"
                >
                  <div className="select-wrap">
                    <select
                      id="max-interval"
                      className="select-input select-medium"
                      value={settings.maxIntervalDays}
                      onChange={(event) =>
                        updateSettings({ maxIntervalDays: Number(event.target.value) })
                      }
                    >
                      {Array.from(new Set([...MAX_INTERVAL_OPTIONS, settings.maxIntervalDays]))
                        .sort((a, b) => a - b)
                        .map((days) => (
                          <option key={days} value={days}>
                            {formatInterval(days)}
                          </option>
                        ))}
                    </select>
                    <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                  </div>
                </Row>
                <Row
                  label="Learning step"
                  hint="How soon a lapsed card returns for another attempt."
                  htmlFor="learning-step"
                >
                  <div className="select-wrap">
                    <select
                      id="learning-step"
                      className="select-input select-medium"
                      value={settings.learningStepMinutes}
                      onChange={(event) =>
                        updateSettings({ learningStepMinutes: Number(event.target.value) })
                      }
                    >
                      {Array.from(new Set([...LEARNING_STEP_OPTIONS, settings.learningStepMinutes]))
                        .sort((a, b) => a - b)
                        .map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {minutes} {minutes === 1 ? 'minute' : 'minutes'}
                          </option>
                        ))}
                    </select>
                    <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                  </div>
                </Row>
              </Section>

              <Section title="Session content" description="Choose how much context and practice appears during a review.">
                <Toggle
                  label="Show an example sentence"
                  description="Reveal the first example after you flip a card."
                  checked={settings.reviewShowExample}
                  onChange={(value) => updateSettings({ reviewShowExample: value })}
                />
                <Toggle
                  label="Add a translation exercise"
                  description="Include one native-language sentence to produce before grading."
                  checked={settings.reviewExercise}
                  onChange={(value) => updateSettings({ reviewExercise: value })}
                />
              </Section>

              <Section title="Your current defaults" description="These numbers feed the interval preview on each grade button.">
                <div className="mini-metrics">
                  <div><span>Graduating</span><strong>1 day</strong></div>
                  <div><span>Hard cap</span><strong>90% of Good</strong></div>
                  <div><span>Mastery</span><strong>21+ days</strong></div>
                  <div><span>Learning step</span><strong>{settings.learningStepMinutes} min</strong></div>
                </div>
              </Section>
            </>
          )}

          {tab === 'translate' && (
            <>
              <Section
                title="Free Google Translate"
                description="Solutions use Google's free web endpoint — no API key and no account required."
              >
                <Toggle
                  label="Reveal solutions with Google Translate"
                  description="The reveal button fetches a translation in the browser and caches it locally."
                  checked={settings.googleTranslateEnabled}
                  onChange={(value) =>
                    updateSettings(
                      value
                        ? { googleTranslateEnabled: true }
                        : { googleTranslateEnabled: false, autoRevealSolutions: false },
                    )
                  }
                />
                <Toggle
                  label="Always show the direct link"
                  description="Offer an “Open in Google Translate” link alongside the fetched solution."
                  checked={settings.showTranslateLink}
                  onChange={(value) => updateSettings({ showTranslateLink: value })}
                />
                <Toggle
                  label="Reveal solutions automatically"
                  description="Fetch translations for every exercise as soon as it appears. This makes more requests and may feel less like a self-test."
                  checked={settings.autoRevealSolutions}
                  onChange={(value) =>
                    updateSettings(
                      value
                        ? { autoRevealSolutions: true, googleTranslateEnabled: true }
                        : { autoRevealSolutions: false },
                    )
                  }
                />
              </Section>

              <Section
                title="Connection test"
                description="Checks the endpoint directly from this browser."
                aside={
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => void handleTestTranslation()}
                    disabled={translationTest.loading}
                  >
                    {translationTest.loading ? (
                      <Loader2 size={14} className="spin" aria-hidden="true" />
                    ) : (
                      <Languages size={14} aria-hidden="true" />
                    )}
                    {translationTest.loading ? 'Testing…' : 'Test translation'}
                  </button>
                }
              >
                <p className="settings-muted">
                  Sample: <em lang={translationSource.code}>“{translationSample}”</em> ·{' '}
                  {translationSource.label} → {target.label}
                </p>
                {translationTest.text && (
                  <div className="translation-test-result" aria-live="polite">
                    <span>{translationTest.provider}</span>
                    <p className="lang-target" lang={target.code}>{translationTest.text}</p>
                    <ExternalLink size={15} aria-hidden="true" />
                  </div>
                )}
                {translationTest.error && (
                  <div className="inline-alert is-error" role="alert">
                    <AlertCircle size={15} aria-hidden="true" />
                    <span>{translationTest.error}</span>
                  </div>
                )}
                <div className="setting-action-row">
                  <span>
                    {cacheCount} {cacheCount === 1 ? 'translation' : 'translations'} cached locally
                  </span>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={handleClearCache}
                    disabled={cacheCount === 0}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Clear cache
                  </button>
                </div>
              </Section>

              <div className="settings-note">
                <ShieldCheck size={17} aria-hidden="true" />
                <div>
                  <strong>How the fallback works</strong>
                  <p>
                    Wordloom calls Google's free <code>translate.googleapis.com</code> endpoint. If
                    your network blocks it, it tries MyMemory's free endpoint once, then shows a
                    direct Google Translate link. No private server or API key is involved.
                  </p>
                </div>
              </div>
            </>
          )}

          {tab === 'ai' && (
            <>
              <Section
                title="Provider"
                description="AI is optional. Use it to generate example sentences and practice exercises, and to get feedback on your translations."
              >
                <div className="provider-options" role="group" aria-label="AI provider">
                  <button
                    type="button"
                    className={cn('provider-card', settings.aiProvider === 'gemini' && 'is-active')}
                    onClick={() => {
                      updateSettings({ aiProvider: 'gemini' });
                      setTestResult(null);
                    }}
                    aria-pressed={settings.aiProvider === 'gemini'}
                  >
                    <span className="provider-icon"><Sparkles size={19} aria-hidden="true" /></span>
                    <div>
                      <strong>Google Gemini</strong>
                      <span>Native Gemini API · API key required</span>
                    </div>
                    {settings.aiProvider === 'gemini' && <Check size={16} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className={cn('provider-card', settings.aiProvider === 'openai' && 'is-active')}
                    onClick={() => {
                      updateSettings({ aiProvider: 'openai' });
                      setTestResult(null);
                    }}
                    aria-pressed={settings.aiProvider === 'openai'}
                  >
                    <span className="provider-icon"><Cloud size={19} aria-hidden="true" /></span>
                    <div>
                      <strong>Custom OpenAI-compatible</strong>
                      <span>OpenAI, OpenRouter, local runtimes, and more</span>
                    </div>
                    {settings.aiProvider === 'openai' && <Check size={16} aria-hidden="true" />}
                  </button>
                </div>

                {settings.aiProvider === 'gemini' ? (
                  <div className="provider-form">
                    <div className="field-block">
                      <label htmlFor="gemini-key">Gemini API key</label>
                      <div className="password-field">
                        <input
                          id="gemini-key"
                          className="text-input"
                          type={showGeminiKey ? 'text' : 'password'}
                          value={settings.geminiApiKey}
                          onChange={(event) => updateAiSettings({ geminiApiKey: event.target.value.trim() })}
                          placeholder="AIza…"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          className="icon-button password-toggle"
                          onClick={() => setShowGeminiKey((value) => !value)}
                          aria-label={showGeminiKey ? 'Hide API key' : 'Show API key'}
                        >
                          {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="field-block">
                      <label htmlFor="gemini-model">Model name</label>
                      <input
                        id="gemini-model"
                        className="text-input"
                        list="gemini-model-options"
                        value={settings.geminiModel}
                        onChange={(event) => updateAiSettings({ geminiModel: event.target.value })}
                        placeholder="gemini-2.5-flash"
                        spellCheck={false}
                      />
                      <datalist id="gemini-model-options">
                        {GEMINI_MODEL_SUGGESTIONS.map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                      <span className="field-hint">Type any model name your key has access to.</span>
                    </div>
                    <div className="field-block">
                      <label htmlFor="gemini-thinking">Thinking level</label>
                      <div className="select-wrap">
                        <select
                          id="gemini-thinking"
                          className="select-input"
                          value={settings.geminiThinking}
                          onChange={(event) =>
                            updateAiSettings({
                              geminiThinking: event.target.value as SettingsType['geminiThinking'],
                            })
                          }
                        >
                          {GEMINI_THINKING_LEVELS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
                      </div>
                      <span className="field-hint">
                        {geminiThinking.hint}. Gemini 2.5 models receive a matching thinking budget;
                        newer models receive a thinking level.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="provider-form">
                    <div className="field-block">
                      <label htmlFor="openai-base">Base URL</label>
                      <input
                        id="openai-base"
                        className="text-input"
                        value={settings.openaiBaseUrl}
                        onChange={(event) => updateAiSettings({ openaiBaseUrl: event.target.value })}
                        placeholder="https://api.openai.com/v1"
                        spellCheck={false}
                      />
                      <span className="field-hint">
                        The chat completions path is appended automatically, or use a full
                        /chat/completions URL.
                      </span>
                    </div>
                    <div className="field-block">
                      <label htmlFor="openai-key">API key <span className="optional">optional</span></label>
                      <div className="password-field">
                        <input
                          id="openai-key"
                          className="text-input"
                          type={showOpenAiKey ? 'text' : 'password'}
                          value={settings.openaiApiKey}
                          onChange={(event) => updateAiSettings({ openaiApiKey: event.target.value })}
                          placeholder="sk-… or leave blank for a local server"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="button"
                          className="icon-button password-toggle"
                          onClick={() => setShowOpenAiKey((value) => !value)}
                          aria-label={showOpenAiKey ? 'Hide API key' : 'Show API key'}
                        >
                          {showOpenAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="field-block">
                      <label htmlFor="openai-model">Model name</label>
                      <input
                        id="openai-model"
                        className="text-input"
                        list="openai-model-options"
                        value={settings.openaiModel}
                        onChange={(event) => updateAiSettings({ openaiModel: event.target.value })}
                        placeholder="gpt-4o-mini"
                        spellCheck={false}
                      />
                      <datalist id="openai-model-options">
                        {OPENAI_MODEL_SUGGESTIONS.map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                      <span className="field-hint">Type any model available at your endpoint.</span>
                    </div>
                    <div className="field-block">
                      <label htmlFor="openai-thinking">Thinking level</label>
                      <input
                        id="openai-thinking"
                        className="text-input"
                        list="openai-thinking-options"
                        value={settings.openaiThinking}
                        onChange={(event) =>
                          updateAiSettings({ openaiThinking: event.target.value })
                        }
                        placeholder="auto"
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <datalist id="openai-thinking-options">
                        {OPENAI_THINKING_LEVELS.map((option) => (
                          <option key={option.value} value={option.value} />
                        ))}
                      </datalist>
                      <span className="field-hint">
                        Free text, sent as <code>reasoning_effort</code>. Leave it blank or type{' '}
                        <code>auto</code> to use the provider default. If a server rejects it, the
                        request is retried without it automatically.
                      </span>
                    </div>
                  </div>
                )}
              </Section>

              <Section
                title="Advanced sampling"
                description="Wordloom leaves these on the provider's defaults until you choose to override them."
              >
                <Toggle
                  label="Use the model's default temperature"
                  description={
                    temperatureSettings.source === 'unsupported'
                      ? temperatureSettings.detail
                      : 'Keep this on to let the provider decide. Turn it off to send your own value.'
                  }
                  checked={followsModelTemperature}
                  disabled={temperatureSettings.source === 'unsupported'}
                  onChange={(value) =>
                    updateAiSettings({ temperatureMode: value ? 'auto' : 'custom' })
                  }
                />
                <RangeSetting
                  label={
                    <span className="setting-label-with-badge">
                      Temperature
                      <span className="setting-badge">{temperatureBadge}</span>
                    </span>
                  }
                  hint={temperatureHint}
                  min={0}
                  max={2}
                  step={0.1}
                  value={shownTemperature}
                  display={temperatureDisplay}
                  disabled={followsModelTemperature}
                  onChange={(value) => updateAiSettings({ temperature: value })}
                />
              </Section>

              <Section title="AI features" description="Turn each optional feature on or off independently.">
                <Toggle
                  label="Generate examples and practice sentences"
                  description="Adds a “Generate with AI” button on word pages."
                  checked={settings.aiExercises}
                  onChange={(value) => updateSettings({ aiExercises: value })}
                />
                <Toggle
                  label="Translation feedback"
                  description="Adds a “Check with AI” button under each exercise."
                  checked={settings.aiFeedback}
                  onChange={(value) => updateSettings({ aiFeedback: value })}
                />
              </Section>

              <Section
                title="Connection test"
                description={`Currently using ${activeProviderLabel(settings)}.`}
                aside={
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => void handleTestAi()}
                    disabled={testing}
                  >
                    {testing ? (
                      <Loader2 size={14} className="spin" aria-hidden="true" />
                    ) : (
                      <Sparkles size={14} aria-hidden="true" />
                    )}
                    {testing ? 'Testing…' : 'Test connection'}
                  </button>
                }
              >
                {!testResult ? (
                  <p className="settings-muted">
                    Wordloom sends a tiny “reply OK” request to verify the endpoint, key, model,
                    and thinking settings.
                  </p>
                ) : (
                  <div
                    className={cn('inline-alert', testResult.ok ? 'is-success' : 'is-error')}
                    role="status"
                    aria-live="polite"
                  >
                    {testResult.ok ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <AlertCircle size={15} aria-hidden="true" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}
                <div className="settings-note is-compact">
                  <ShieldCheck size={17} aria-hidden="true" />
                  <div>
                    <strong>Your keys stay here</strong>
                    <p>
                      Requests go directly from this browser to the provider. Keys and settings are
                      stored in this browser's local storage, which is not encrypted — avoid shared
                      computers for sensitive keys.
                    </p>
                  </div>
                </div>
              </Section>
            </>
          )}

          {tab === 'sheets' && (
            <>
              <Section
                title="Google Sheets"
                description="Keep your progress in a spreadsheet you own. Wordloom still works offline; the sheet is the shared copy."
              >
                {sheetSync.connection ? (
                  <>
                    <div className="storage-card sheet-card">
                      <div className="storage-icon">
                        <Cloud size={22} aria-hidden="true" />
                      </div>
                      <div>
                        <strong>
                          {sheetSync.connection.sheetUrl ? 'Sheet connected' : 'Bridge connected'}
                        </strong>
                        <span>
                          {sheetSync.lastSyncedAt
                            ? `Last synced ${formatShortDate(sheetSync.lastSyncedAt)} at ${formatTime(sheetSync.lastSyncedAt)}`
                            : 'No sync yet'}
                          {' · '}
                          {Object.keys(progress.cards).length}{' '}
                          {pluralize(Object.keys(progress.cards).length, 'card')} on this device
                        </span>
                      </div>
                      <span
                        className={cn(
                          'storage-badge',
                          sheetPhase === 'error' && 'is-error',
                          (sheetPhase === 'needs-decision' || sheetPhase === 'unsaved') &&
                            'is-warn',
                        )}
                      >
                        {sheetPhaseLabel}
                      </span>
                    </div>

                    <p className="sheet-autosave">
                      <RefreshCw size={12} aria-hidden="true" />
                      {sheetSync.pendingDecision
                        ? 'Auto-save is paused until you choose which copy to keep.'
                        : sheetBusy
                          ? 'Syncing with Google Sheets…'
                          : sheetSync.lastError
                            ? 'The last upload failed. Edit again or use Sync now to retry.'
                            : sheetSync.dirty
                              ? 'Changes queued — uploading in a few seconds.'
                              : 'Auto-save is on — changes upload about 5 seconds after you stop editing.'}
                    </p>

                    {sheetSync.lastError && !sheetMessage && (
                      <div className="inline-alert is-error" role="alert">
                        <AlertCircle size={15} aria-hidden="true" />
                        <span>{sheetSync.lastError}</span>
                      </div>
                    )}

                    {sheetSync.connection.sheetUrl && (
                      <a
                        className="text-link sheet-open"
                        href={sheetSync.connection.sheetUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open the spreadsheet
                        <ExternalLink size={13} aria-hidden="true" />
                      </a>
                    )}

                    {sheetSync.pendingDecision && (
                      <div className="sheet-decision">
                        <div>
                          <strong>This sheet already has Wordloom data</strong>
                          <p>
                            Sheet:{' '}
                            {sheetSync.remoteSummary
                              ? `${sheetSync.remoteSummary.cards} cards · ${sheetSync.remoteSummary.reviews} reviews`
                              : 'data available'}
                            . This device: {Object.keys(progress.cards).length} cards.
                          </p>
                          <p>
                            Importing replaces this device. Uploading replaces the sheet. Choose the
                            copy you want to keep.
                          </p>
                        </div>
                        <div className="sheet-decision-actions">
                          <button
                            type="button"
                            className="button button-primary button-small"
                            onClick={() => void handleSheetDecision('pull')}
                            disabled={sheetBusy}
                          >
                            <Download size={14} aria-hidden="true" />
                            Import from sheet
                          </button>
                          <button
                            type="button"
                            className="button button-ghost button-small"
                            onClick={() => void handleSheetDecision('push')}
                            disabled={sheetBusy}
                          >
                            <Upload size={14} aria-hidden="true" />
                            Keep this device
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="data-actions">
                      <div className="data-action">
                        <div>
                          <strong>Sync now</strong>
                          <span>Compare this device with the sheet and use the newest copy.</span>
                        </div>
                        <button
                          type="button"
                          className="button button-primary button-small"
                          onClick={() => void handleSheetSyncNow()}
                          disabled={sheetBusy || sheetSync.pendingDecision}
                        >
                          {sheetBusy ? (
                            <Loader2 className="spin" size={14} aria-hidden="true" />
                          ) : (
                            <RefreshCw size={14} aria-hidden="true" />
                          )}
                          {sheetBusy ? 'Syncing…' : 'Sync now'}
                        </button>
                      </div>
                      <div className="data-action">
                        <div>
                          <strong>Import from sheet</strong>
                          <span>
                            {confirmSheetPull
                              ? 'This replaces local progress. Click again to confirm.'
                              : 'Replace this device with the sheet copy.'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={cn(
                            'button button-small',
                            confirmSheetPull ? 'button-danger-solid' : 'button-ghost',
                          )}
                          onClick={() => void handleSheetPull()}
                          disabled={sheetBusy || sheetSync.pendingDecision}
                        >
                          <Download size={14} aria-hidden="true" />
                          {confirmSheetPull ? 'Click again to import' : 'Import'}
                        </button>
                      </div>
                      <div className="data-action">
                        <div>
                          <strong>Upload this device</strong>
                          <span>
                            {confirmSheetPush
                              ? 'This replaces the sheet copy. Click again to confirm.'
                              : 'Replace the sheet copy with this device’s data.'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={cn(
                            'button button-small',
                            confirmSheetPush ? 'button-danger-solid' : 'button-ghost',
                          )}
                          onClick={() => void handleSheetPush()}
                          disabled={sheetBusy || sheetSync.pendingDecision}
                        >
                          <Upload size={14} aria-hidden="true" />
                          {confirmSheetPush ? 'Click again to upload' : 'Upload'}
                        </button>
                      </div>
                      <div className="data-action">
                        <div>
                          <strong>Sync link</strong>
                          <span>Copy the Sheet and Web app URLs for another device.</span>
                        </div>
                        <button
                          type="button"
                          className="button button-ghost button-small"
                          onClick={() => void copySyncLink()}
                        >
                          {copiedSyncLink ? (
                            <Check size={14} aria-hidden="true" />
                          ) : (
                            <Copy size={14} aria-hidden="true" />
                          )}
                          {copiedSyncLink ? 'Copied' : 'Copy sync link'}
                        </button>
                      </div>
                    </div>

                    <div className="sheet-connection-meta">
                      <span>Web app</span>
                      <code>{sheetSync.connection.endpoint}</code>
                      <span>This device</span>
                      <code>{sheetSync.deviceId.slice(0, 8)}</code>
                    </div>

                    <button
                      type="button"
                      className="text-link sheet-disconnect"
                      onClick={handleSheetDisconnect}
                    >
                      <Unplug size={14} aria-hidden="true" />
                      Disconnect this device
                    </button>
                  </>
                ) : (
                  <p className="settings-muted">
                    Not connected. Local browser storage is still the only copy of your progress.
                  </p>
                )}

                {sheetMessage && (
                  <div
                    className={cn(
                      'inline-alert',
                      sheetMessage.tone === 'error'
                        ? 'is-error'
                        : sheetMessage.tone === 'success'
                          ? 'is-success'
                          : 'is-info',
                    )}
                    role={sheetMessage.tone === 'error' ? 'alert' : 'status'}
                  >
                    {sheetMessage.tone === 'success' ? (
                      <Check size={15} aria-hidden="true" />
                    ) : sheetMessage.tone === 'error' ? (
                      <AlertCircle size={15} aria-hidden="true" />
                    ) : (
                      <Cloud size={15} aria-hidden="true" />
                    )}
                    <span>{sheetMessage.text}</span>
                  </div>
                )}
              </Section>

              <Section
                title="Connect a sheet"
                description="Paste the spreadsheet URL and the Web app URL from the bridge you installed below. Both are needed once per device; a sync link packs them together."
              >
                <p className="settings-muted">
                  New to this sheet? Install the bridge in <strong>One-time setup</strong> below,
                  then paste its URLs here.
                </p>
                <Row
                  label="Google Sheet URL"
                  hint="The normal link from your browser’s address bar."
                  htmlFor="sheet-url"
                >
                  <input
                    id="sheet-url"
                    className="text-input setting-input sheet-url-input"
                    value={sheetUrlInput}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setSheetUrlInput(event.target.value)}
                  />
                </Row>
                <Row
                  label="Web app URL"
                  hint="Ends in /exec. This is the bridge that reads and writes the sheet."
                  htmlFor="sheet-bridge"
                >
                  <input
                    id="sheet-bridge"
                    className="text-input setting-input sheet-url-input"
                    value={sheetBridgeInput}
                    placeholder="https://script.google.com/macros/s/…/exec"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setSheetBridgeInput(event.target.value)}
                  />
                </Row>
                <Row
                  label="Access token"
                  hint="Optional. Only needed if you set TOKEN in the script."
                  htmlFor="sheet-token"
                >
                  <div className="sheet-token-row">
                    <input
                      id="sheet-token"
                      className="text-input setting-input sheet-url-input"
                      type={showSheetToken ? 'text' : 'password'}
                      value={sheetTokenInput}
                      placeholder="Optional shared secret"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setSheetTokenInput(event.target.value)}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setShowSheetToken((value) => !value)}
                      aria-label={showSheetToken ? 'Hide token' : 'Show token'}
                    >
                      {showSheetToken ? (
                        <EyeOff size={16} aria-hidden="true" />
                      ) : (
                        <Eye size={16} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </Row>
                <div className="sheet-connect-actions">
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={() => void handleSheetConnect()}
                    disabled={sheetBusy}
                  >
                    {sheetBusy ? (
                      <Loader2 className="spin" size={14} aria-hidden="true" />
                    ) : (
                      <Cloud size={14} aria-hidden="true" />
                    )}
                    {sheetSync.connection ? 'Reconnect' : 'Connect'}
                  </button>
                  <span className="sheet-hint">
                    Pasting a “Wordloom sync” block into either field fills both links.
                  </span>
                </div>
                <p className="settings-muted">
                  After connecting, changes upload a few seconds after you stop editing. Use Sync
                  now to reconcile, or Import/Upload to force a direction. Requests go straight from
                  this browser to your Apps Script deployment.
                </p>
              </Section>

              <Section
                title="One-time setup in your sheet"
                description="Google does not allow a website to write to a sheet from a URL alone, so a short script has to live inside the sheet once. This uses Apps Script inside your own spreadsheet — no Google Cloud project and no server."
              >
                <ol className="sheet-steps">
                  <li>
                    <strong>Create a blank Google Sheet.</strong> Open it, then choose{' '}
                    <em>Extensions → Apps Script</em>.
                  </li>
                  <li>
                    <strong>Paste the bridge into the editor.</strong> Delete the placeholder and
                    paste the script from this page.
                  </li>
                  <li>
                    <strong>Deploy it.</strong> <em>Deploy → New deployment → Web app</em>. Execute
                    as <em>Me</em>, Who has access <em>Anyone</em>. Authorize, then copy the URL
                    ending in <code>/exec</code>.
                  </li>
                  <li>
                    <strong>Connect above.</strong> The first connection uploads this device if the
                    sheet is empty.
                  </li>
                </ol>
                <div className="sheet-setup-links">
                  <a
                    className="text-link"
                    href="https://sheets.new"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Create a blank sheet
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                  <a
                    className="text-link"
                    href="https://script.google.com/home"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Apps Script
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </div>
                <div className="data-actions">
                  <div className="data-action">
                    <div>
                      <strong>Bridge script</strong>
                      <span>
                        {WORDLOOM_BRIDGE_SOURCE.split('\n').length} lines · the same code for every
                        Wordloom sheet
                      </span>
                    </div>
                    <div className="sheet-script-actions">
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={() => void copyBridgeScript()}
                      >
                        <Copy size={14} aria-hidden="true" />
                        {copiedBridge ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={downloadBridgeScript}
                      >
                        <Download size={14} aria-hidden="true" />
                        Download
                      </button>
                      <button
                        type="button"
                        className="button button-ghost button-small"
                        onClick={() => setShowBridgeScript((value) => !value)}
                      >
                        <Eye size={14} aria-hidden="true" />
                        {showBridgeScript ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </div>
                {showBridgeScript && (
                  <pre className="sheet-script">
                    <code>{WORDLOOM_BRIDGE_SOURCE}</code>
                  </pre>
                )}
                <div className="inline-alert is-info">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>
                    Anyone with the /exec URL can read and write the sheet. Keep it private, or set
                    TOKEN in the script and paste the same phrase above. The copied sync link
                    contains that token, so treat it like a password. API keys never leave this
                    browser.
                  </span>
                </div>
                <p className="settings-muted">
                  The script creates readable tabs for cards, drafts, solutions, examples,
                  practice, activity, and review history. Re-uploading is safe: the newest copy
                  rewrites those tabs.
                </p>
              </Section>
            </>
          )}

          {tab === 'data' && (
            <>
              <Section
                title="Stored on this device"
                description={
                  sheetSync.connection
                    ? 'Local browser storage is the offline cache; your Google Sheet keeps the shared copy.'
                    : 'Wordloom is local-first: vocabulary schedules, drafts, and settings live in your browser.'
                }
              >
                <div className="storage-card">
                  <div className="storage-icon"><Database size={22} aria-hidden="true" /></div>
                  <div>
                    <strong>{formatBytes(deviceBytes)}</strong>
                    <span>
                      {progress.reviewCount} {pluralize(progress.reviewCount, 'review')} ·{' '}
                      {Object.keys(progress.responses).length}{' '}
                      {pluralize(Object.keys(progress.responses).length, 'draft')} ·{' '}
                      {Object.keys(progress.cards).length}{' '}
                      {pluralize(Object.keys(progress.cards).length, 'card')}
                    </span>
                  </div>
                  <span className={cn('storage-badge', sheetSync.connection && 'is-cloud')}>
                    {sheetSync.connection ? (
                      <Cloud size={14} aria-hidden="true" />
                    ) : (
                      <ShieldCheck size={14} aria-hidden="true" />
                    )}
                    {sheetSync.connection ? sheetPhaseLabel : 'Local only'}
                  </span>
                </div>
                <div className="data-actions">
                  <div className="data-action">
                    <div>
                      <strong>Google Sheets</strong>
                      <span>
                        {sheetSync.connection
                          ? 'Connected. Manage sync, import, or disconnect in the Google Sheets tab.'
                          : 'Save progress to a spreadsheet you own.'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      onClick={() => setTab('sheets')}
                    >
                      Open
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </Section>

              <Section
                title="Backup and restore"
                description="Export a single JSON file containing your settings, study schedule, drafts, and review history."
              >
                <div className="data-actions">
                  <div className="data-action">
                    <div>
                      <strong>Export backup</strong>
                      <span>Download everything as a Wordloom JSON file.</span>
                    </div>
                    <button type="button" className="button button-primary button-small" onClick={handleExport}>
                      <Download size={14} aria-hidden="true" />
                      Export
                    </button>
                  </div>
                  <div className="data-action">
                    <div>
                      <strong>Import backup</strong>
                      <span>Replace current settings and progress from a backup file.</span>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} aria-hidden="true" />
                      Import
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      onChange={(event) => {
                        void handleImport(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </div>
                </div>
                {importError && (
                  <div className="inline-alert is-error" role="alert">
                    <AlertCircle size={15} aria-hidden="true" />
                    <span>{importError}</span>
                  </div>
                )}
                <p className="settings-muted">
                  Tip: export a backup before trying a new schedule or clearing your progress.
                  Backups include any AI credentials saved in Settings, so keep the file private.
                </p>
              </Section>

              <Section
                title="Reset"
                description={
                  sheetSync.connection
                    ? 'Reset progress or settings. The change is saved here and synced to your connected sheet; if the sheet still contains progress, Wordloom asks before replacing it.'
                    : 'These actions affect this browser only. Download a backup first if you might want the data later.'
                }
              >
                <div className="danger-row">
                  <div>
                    <strong>Reset study progress</strong>
                    <span>Clear cards, review history, drafts, activity, and AI-generated exercises. Settings and vocabulary stay.</span>
                  </div>
                  <button
                    type="button"
                    className={cn('button button-small', confirmReset === 'progress' ? 'button-danger-solid' : 'button-danger')}
                    onClick={() => handleReset('progress')}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {confirmReset === 'progress' ? 'Click again to confirm' : 'Reset progress'}
                  </button>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>Reset settings</strong>
                    <span>Restore defaults for theme, study, scheduling, translation, and AI.</span>
                  </div>
                  <button
                    type="button"
                    className={cn('button button-small', confirmReset === 'settings' ? 'button-danger-solid' : 'button-danger')}
                    onClick={() => handleReset('settings')}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {confirmReset === 'settings' ? 'Click again to confirm' : 'Reset settings'}
                  </button>
                </div>
                <div className="danger-row">
                  <div>
                    <strong>Erase everything</strong>
                    <span>Progress, settings, and cached translations, back to a fresh install. Vocabulary is untouched.</span>
                  </div>
                  <button
                    type="button"
                    className={cn('button button-small', confirmReset === 'all' ? 'button-danger-solid' : 'button-danger')}
                    onClick={() => handleReset('all')}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {confirmReset === 'all' ? 'Click again to erase' : 'Erase all data'}
                  </button>
                </div>
                {confirmReset && (
                  <button
                    type="button"
                    className="text-link reset-cancel"
                    onClick={() => setConfirmReset(null)}
                  >
                    Cancel pending reset
                  </button>
                )}
              </Section>

              <Section title="About Wordloom" description="A local-first vocabulary studio for deliberate practice.">
                <div className="about-grid">
                  <div><span>Version</span><strong>1.0.0</strong></div>
                  <div><span>Target language</span><strong>{target.label}</strong></div>
                  <div><span>Native language</span><strong>{native.label}</strong></div>
                  <div>
                    <span>Vocabulary</span>
                    <strong>{ALL_WORDS.length.toLocaleString()} words · A1–B2</strong>
                  </div>
                </div>
                <div className="about-links">
                  <AppLink to={{ name: 'level', level: 'A1' }} className="text-link">
                    Browse vocabulary
                    <BookOpen size={14} aria-hidden="true" />
                  </AppLink>
                  <button type="button" className="text-link" onClick={testVoice}>
                    <Volume2 size={14} aria-hidden="true" />
                    Test {target.label} voice
                  </button>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
