/**
 * Public library entry point for the ddex-engine package.
 */

export {
  buildReleaseMessage,
  BuildError,
  type BuildResult,
} from './builder/index.js';

export { parseReleaseMessage, ParseError, type ParseResult } from './parser/index.js';

export { validateXml, type ValidationIssue, type ValidationResult } from './validation/structural.js';

export {
  isValidIsrc,
  isValidIcpn,
  isValidEan13,
  isValidUpc12,
  isValidTerritory,
  isValidDuration,
  isValidDate,
  isValidDateTime,
  normalizeIsrc,
  normalizeIcpn,
  secondsToDuration,
} from './validation/formats.js';

export {
  releaseMessageInputSchema,
  messageHeaderSchema,
  partySchema,
  soundRecordingSchema,
  imageSchema,
  releaseSchema,
  dealSchema,
  buildConfigSchema,
  type ReleaseMessageInput,
  type MessageHeader,
  type Party,
  type SoundRecording,
  type Image,
  type Release,
  type Deal,
  type BuildConfig,
} from './schemas/index.js';

export { presets, applyPreset, type PresetName, type Preset } from './presets/index.js';

export {
  ERN_NAMESPACES,
  versionFromNamespace,
  type ErnVersion,
} from './templates/namespaces.js';
