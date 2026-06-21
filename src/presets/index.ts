/**
 * Preset registry.
 *
 * Presets are plain partial objects that get shallow-merged into the caller's
 * input. They exist to capture the "this is how a typical Spotify single is
 * billed" defaults without baking them into the schema. Nothing fancy — no
 * locks, no versioning, no inheritance chains.
 */

import type { ReleaseMessageInput } from '../schemas/index.js';

export type Preset = {
  /** Merged into input.config. */
  config?: Partial<ReleaseMessageInput['config']>;
  /** Each deal in input.deals is merged with these defaults. */
  dealDefaults?: Partial<ReleaseMessageInput['deals'][number]>;
};

export const presets = {
  'spotify-single': {
    config: { version: '4.3', pretty: true },
    dealDefaults: {
      commercialModel: 'PayAsYouGoModel',
      useTypes: ['OnDemandStream'],
      territories: ['Worldwide'],
    },
  },
  'apple-music-album': {
    config: { version: '4.3', pretty: true },
    dealDefaults: {
      commercialModel: 'SubscriptionModel',
      useTypes: ['OnDemandStream', 'PermanentDownload'],
      territories: ['Worldwide'],
    },
  },
} as const satisfies Record<string, Preset>;

export type PresetName = keyof typeof presets;

/** Apply a preset's defaults to a raw (pre-validation) input object. */
export function applyPreset(
  input: Record<string, unknown>,
  presetName: PresetName,
): Record<string, unknown> {
  const preset = presets[presetName];
  const merged: Record<string, unknown> = { ...input };

  if (preset.config) {
    merged.config = { ...preset.config, ...(input.config as object | undefined) };
  }

  if (preset.dealDefaults && Array.isArray(input.deals)) {
    merged.deals = (input.deals as Array<Record<string, unknown>>).map((d) => ({
      ...preset.dealDefaults,
      ...d,
    }));
  }

  return merged;
}
