import type { AIProvider, TemperatureMode } from '../types';

/**
 * Value Wordloom suggests when a provider does not publish a default for the
 * selected model. It is tuned for exercise generation: varied enough to avoid
 * repeated sentences, steady enough to keep translations predictable.
 */
export const SUGGESTED_TEMPERATURE = 0.7;

export type TemperatureSource = 'model' | 'suggested' | 'unsupported';

export interface TemperaturePlan {
  /** The provider's own value, or Wordloom's suggestion when none is published. */
  defaultValue: number | null;
  /** What to send when the user has not overridden the setting. `null` omits it. */
  requestValue: number | null;
  source: TemperatureSource;
  /** One-line explanation shown in Settings. */
  detail: string;
}

/**
 * Reasoning-first models choose their own sampling and reject a temperature
 * value, so the parameter is always omitted for them.
 */
const NO_TEMPERATURE_MODELS = /(?:^|\/)(?:o[134](?:-|$)|gpt-5)|reasoner/i;

/** Gemini models accept a temperature and default to 1.0. */
const GEMINI_FAMILY = /(?:^|\/)gemini-/i;

/** OpenAI chat models accept a temperature and default to 1.0. */
const OPENAI_CHAT_FAMILY = /(?:^|\/)(?:gpt-|chatgpt-|text-|davinci|curie|babbage|ada)/i;

function modelSource(provider: AIProvider, model: string): TemperatureSource {
  if (provider === 'gemini' && GEMINI_FAMILY.test(model)) return 'model';
  if (provider === 'openai' && OPENAI_CHAT_FAMILY.test(model)) return 'model';
  return 'suggested';
}

/**
 * Work out which temperature applies to a provider/model pair. Known families
 * keep the provider default (the parameter is left out so the provider decides);
 * anything else falls back to a suggested value that is sent explicitly.
 */
export function temperaturePlan(provider: AIProvider, modelName: string): TemperaturePlan {
  const model = modelName.trim();

  if (model && NO_TEMPERATURE_MODELS.test(model)) {
    return {
      defaultValue: null,
      requestValue: null,
      source: 'unsupported',
      detail: 'This model manages sampling itself, so no temperature is sent.',
    };
  }

  if (model && modelSource(provider, model) === 'model') {
    const providerLabel = provider === 'gemini' ? 'Gemini' : 'the provider';
    return {
      defaultValue: 1,
      requestValue: null,
      source: 'model',
      detail: `${providerLabel} applies its own default temperature (1.0).`,
    };
  }

  return {
    defaultValue: SUGGESTED_TEMPERATURE,
    requestValue: SUGGESTED_TEMPERATURE,
    source: 'suggested',
    detail: `No published default for this model, so Wordloom suggests ${SUGGESTED_TEMPERATURE.toFixed(
      1,
    )}.`,
  };
}

/** The value to put in a request, or `null` to omit the parameter entirely. */
export function temperatureForRequest(
  provider: AIProvider,
  modelName: string,
  mode: TemperatureMode,
  customValue: number,
): number | null {
  const plan = temperaturePlan(provider, modelName);
  if (plan.source === 'unsupported') return null;
  return mode === 'custom' ? customValue : plan.requestValue;
}
