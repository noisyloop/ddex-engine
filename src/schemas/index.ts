/**
 * Input contract for the DDEX builder.
 *
 * These Zod schemas describe what a caller must pass in to produce an ERN 4.3
 * NewReleaseMessage. The schemas are intentionally strict: required fields are
 * required, optional fields are clearly marked, and identifier formats are
 * checked at the input boundary rather than after they've been baked into XML.
 */

import { z } from 'zod';
import {
  isValidDate,
  isValidDateTime,
  isValidDuration,
  isValidIcpn,
  isValidIsrc,
  isValidTerritory,
} from '../validation/formats.js';

const isrcSchema = z
  .string()
  .refine(isValidIsrc, { message: 'ISRC must match CC-XXX-YY-NNNNN' });

const icpnSchema = z
  .string()
  .refine(isValidIcpn, { message: 'ICPN (UPC/EAN) must be 12 or 13 digits with valid check digit' });

const territorySchema = z
  .string()
  .refine(isValidTerritory, { message: 'Territory must be an ISO 3166-1 alpha-2 code or "Worldwide"' });

const durationSchema = z
  .string()
  .refine(isValidDuration, { message: 'Duration must be ISO 8601 form PTnHnMnS' });

const dateSchema = z
  .string()
  .refine(isValidDate, { message: 'Date must be YYYY-MM-DD' });

const dateTimeSchema = z
  .string()
  .refine(isValidDateTime, { message: 'DateTime must be ISO 8601 with timezone' });

// --- Parties ---------------------------------------------------------------

export const partyIdentifierSchema = z.object({
  dpid: z.string().optional(),
  isni: z.string().optional(),
  ipn: z.string().optional(),
  proprietaryId: z.string().optional(),
});

export const partySchema = z.object({
  /** Caller-supplied stable key; the builder mints PartyReference IDs (P1..) keyed by this. */
  key: z.string().min(1),
  name: z.string().min(1),
  /** Optional ASCII transcription for non-Latin scripts. */
  nameAsciiTranscribed: z.string().optional(),
  identifiers: partyIdentifierSchema.optional(),
});

export type Party = z.infer<typeof partySchema>;

export const contributorRoleSchema = z.enum([
  'MainArtist',
  'FeaturedArtist',
  'Producer',
  'Composer',
  'Lyricist',
  'Mixer',
  'Remixer',
  'Engineer',
  'Performer',
  'AssociatedPerformer',
]);

export const contributorSchema = z.object({
  partyKey: z.string().min(1),
  role: contributorRoleSchema,
});

// --- Resources -------------------------------------------------------------

export const audioCodecSchema = z.enum(['MP3', 'AAC', 'FLAC', 'WAV', 'PCM', 'OGG', 'OPUS']);

export const hashAlgorithmSchema = z.enum(['MD5', 'SHA1', 'SHA256']);

export const fileReferenceSchema = z.object({
  uri: z.string().min(1),
  hash: z
    .object({
      value: z.string().min(1),
      algorithm: hashAlgorithmSchema,
    })
    .optional(),
});

export const soundRecordingSchema = z.object({
  key: z.string().min(1),
  isrc: isrcSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  /** ISO 8601 duration, e.g. "PT3M42S". */
  duration: durationSchema,
  /** PartyKey(s) for the displayed artists, in display order. */
  displayArtists: z.array(z.string().min(1)).min(1),
  contributors: z.array(contributorSchema).default([]),
  audioCodec: audioCodecSchema,
  samplingRate: z.number().int().positive().optional(),
  bitsPerSample: z.number().int().positive().optional(),
  numberOfChannels: z.number().int().positive().optional(),
  file: fileReferenceSchema,
  parentalWarning: z.enum(['NotExplicit', 'Explicit', 'ExplicitContentEdited']).default('NotExplicit'),
});

export type SoundRecording = z.infer<typeof soundRecordingSchema>;

export const imageCodecSchema = z.enum(['JPEG', 'PNG', 'GIF', 'WEBP']);

export const imageSchema = z.object({
  key: z.string().min(1),
  /** Proprietary identifier emitted as Image/ResourceId/ProprietaryId. Defaults to `key`. */
  proprietaryId: z.string().min(1).optional(),
  imageCodec: imageCodecSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  file: fileReferenceSchema,
});

export type Image = z.infer<typeof imageSchema>;

// --- Release ---------------------------------------------------------------

export const releaseTypeSchema = z.enum(['Album', 'Single', 'EP', 'VideoSingle', 'VideoAlbum']);

export const trackEntrySchema = z.object({
  /** SoundRecording key; the track inherits the recording's resource reference. */
  soundRecordingKey: z.string().min(1),
  /** 1-based track position within the release. */
  position: z.number().int().positive(),
});

export const releaseSchema = z.object({
  /** Stable key for the release; builder mints a ReleaseReference (R1) from it. */
  key: z.string().min(1),
  /** UPC or EAN; normalized to a 13-digit ICPN in the output. */
  upc: icpnSchema,
  /** Optional GRid (global release ID, A1-XXX-XXXXXXX-X form). */
  grid: z.string().optional(),
  type: releaseTypeSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  displayArtists: z.array(z.string().min(1)).min(1),
  /** PartyKey for the label that owns this release. */
  labelPartyKey: z.string().min(1),
  genre: z.string().min(1),
  subGenre: z.string().optional(),
  /** Copyright (C-Line) text including year and owner. */
  cLine: z.string().optional(),
  /** Phonographic copyright (P-Line) text including year and owner. */
  pLine: z.string().optional(),
  parentalWarning: z.enum(['NotExplicit', 'Explicit', 'ExplicitContentEdited']).default('NotExplicit'),
  /** Cover art image key (must reference one of the images in resources). */
  coverArtKey: z.string().optional(),
  /** Ordered tracks. Positions must be unique and contiguous from 1. */
  tracks: z.array(trackEntrySchema).min(1),
});

export type Release = z.infer<typeof releaseSchema>;

// --- Deals -----------------------------------------------------------------

export const commercialModelSchema = z.enum([
  'PayAsYouGoModel',
  'SubscriptionModel',
  'AdvertisementSupportedModel',
  'FreeOfChargeModel',
  'AsPerContract',
]);

export const useTypeSchema = z.enum([
  'OnDemandStream',
  'PermanentDownload',
  'ConditionalDownload',
  'NonInteractiveStream',
  'TetheredDownload',
  'Ringtone',
]);

export const dealSchema = z.object({
  /** Release key(s) this deal applies to. */
  releaseKeys: z.array(z.string().min(1)).min(1),
  commercialModel: commercialModelSchema,
  useTypes: z.array(useTypeSchema).min(1),
  territories: z.array(territorySchema).min(1),
  excludedTerritories: z.array(territorySchema).optional(),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  price: z
    .object({
      amount: z.number().nonnegative(),
      currencyCode: z.string().length(3),
    })
    .optional(),
});

export type Deal = z.infer<typeof dealSchema>;

// --- Message envelope ------------------------------------------------------

export const messageHeaderSchema = z.object({
  messageId: z.string().min(1),
  messageThreadId: z.string().optional(),
  messageFileName: z.string().optional(),
  sender: z.object({
    partyId: z.string().min(1),
    partyName: z.string().min(1),
  }),
  recipient: z.object({
    partyId: z.string().min(1),
    partyName: z.string().min(1),
  }),
  /** Defaults to now() at build time if omitted. */
  createdDateTime: dateTimeSchema.optional(),
  /** "TestMessage" or "LiveMessage". */
  controlType: z.enum(['TestMessage', 'LiveMessage']).default('LiveMessage'),
});

export type MessageHeader = z.infer<typeof messageHeaderSchema>;

export const buildConfigSchema = z.object({
  version: z.enum(['4.3']).default('4.3'),
  /** Pretty-print output. Set to false for canonical, compact XML. */
  pretty: z.boolean().default(true),
});

export type BuildConfig = z.infer<typeof buildConfigSchema>;

export const releaseMessageInputSchema = z.object({
  config: buildConfigSchema.default({ version: '4.3', pretty: true }),
  header: messageHeaderSchema,
  parties: z.array(partySchema).min(1),
  soundRecordings: z.array(soundRecordingSchema).min(1),
  images: z.array(imageSchema).default([]),
  releases: z.array(releaseSchema).min(1),
  deals: z.array(dealSchema).default([]),
});

export type ReleaseMessageInput = z.infer<typeof releaseMessageInputSchema>;
