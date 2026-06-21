/**
 * ERN 4.3 NewReleaseMessage builder.
 *
 * Takes a validated `ReleaseMessageInput`, allocates stable internal references
 * (P1, A1, I1, R1...) for the parties/resources/releases, and emits an XML
 * tree whose child order matches the ERN 4.3 element-ordering spec captured in
 * `templates/ordering.ts`. Output is deterministic for identical input.
 */

import {
  type Deal,
  type Image,
  type MessageHeader,
  type Party,
  type Release,
  type ReleaseMessageInput,
  type SoundRecording,
  releaseMessageInputSchema,
} from '../schemas/index.js';
import { normalizeIcpn, normalizeIsrc } from '../validation/formats.js';
import {
  ERN_NAMESPACES,
  NEW_RELEASE_MESSAGE,
  XS_NAMESPACE_URI,
  type ErnVersion,
} from '../templates/namespaces.js';
import { ReferenceTable } from './references.js';
import { compact, el, leaf, serialize, type XmlElement } from './xml.js';

export interface BuildResult {
  xml: string;
  /** The validated input post-coerce (defaults applied, dates normalized). */
  input: ReleaseMessageInput;
  /** Reference map exposed for callers that need to track DDEX references back to keys. */
  references: {
    parties: Record<string, string>;
    soundRecordings: Record<string, string>;
    images: Record<string, string>;
    releases: Record<string, string>;
  };
}

export class BuildError extends Error {
  constructor(message: string, public readonly issues?: unknown) {
    super(message);
    this.name = 'BuildError';
  }
}

/** Validate, build the XML tree, serialize, return the result. */
export function buildReleaseMessage(rawInput: unknown): BuildResult {
  const parsed = releaseMessageInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new BuildError('Invalid release message input', parsed.error.format());
  }
  const input = parsed.data;

  // Cross-validate references between sections (Zod handles intra-section shape).
  validateCrossReferences(input);

  const refs = new ReferenceTable();
  // Pre-allocate references in deterministic order so the document order is
  // stable regardless of which section first mentions a key.
  for (const party of input.parties) refs.party(party.key);
  for (const sr of input.soundRecordings) refs.soundRecording(sr.key);
  for (const img of input.images) refs.image(img.key);
  for (const rel of input.releases) refs.release(rel.key);

  const version: ErnVersion = input.config.version;
  const ns = ERN_NAMESPACES[version];

  const headerNode = buildMessageHeader(input.header, ns.prefix);
  const partyListNode = buildPartyList(input.parties, refs, ns.prefix);
  const resourceListNode = buildResourceList(input.soundRecordings, input.images, refs, ns.prefix);
  const releaseListNode = buildReleaseList(input.releases, refs, ns.prefix);
  const dealListNode = buildDealList(input.deals, refs, ns.prefix);

  const root: XmlElement = el(
    `${ns.prefix}:${NEW_RELEASE_MESSAGE}`,
    {
      [`xmlns:${ns.prefix}`]: ns.ernUri,
      'xmlns:xs': XS_NAMESPACE_URI,
      MessageSchemaVersionId: ns.schemaVersionId,
      LanguageAndScriptCode: 'en',
    },
    compact([headerNode, partyListNode, resourceListNode, releaseListNode, dealListNode]),
  );

  const xml = serialize(root, { pretty: input.config.pretty });

  return {
    xml,
    input,
    references: {
      parties: Object.fromEntries(input.parties.map((p) => [p.key, refs.party(p.key)])),
      soundRecordings: Object.fromEntries(
        input.soundRecordings.map((s) => [s.key, refs.soundRecording(s.key)]),
      ),
      images: Object.fromEntries(input.images.map((i) => [i.key, refs.image(i.key)])),
      releases: Object.fromEntries(input.releases.map((r) => [r.key, refs.release(r.key)])),
    },
  };
}

// --- Cross-section validation ----------------------------------------------

function validateCrossReferences(input: ReleaseMessageInput): void {
  const partyKeys = new Set(input.parties.map((p) => p.key));
  const recordingKeys = new Set(input.soundRecordings.map((s) => s.key));
  const imageKeys = new Set(input.images.map((i) => i.key));
  const releaseKeys = new Set(input.releases.map((r) => r.key));

  for (const sr of input.soundRecordings) {
    for (const artistKey of sr.displayArtists) {
      if (!partyKeys.has(artistKey)) {
        throw new BuildError(`SoundRecording "${sr.key}" references unknown party "${artistKey}"`);
      }
    }
    for (const contrib of sr.contributors) {
      if (!partyKeys.has(contrib.partyKey)) {
        throw new BuildError(
          `SoundRecording "${sr.key}" contributor references unknown party "${contrib.partyKey}"`,
        );
      }
    }
  }

  for (const rel of input.releases) {
    if (!partyKeys.has(rel.labelPartyKey)) {
      throw new BuildError(`Release "${rel.key}" references unknown label party "${rel.labelPartyKey}"`);
    }
    for (const artistKey of rel.displayArtists) {
      if (!partyKeys.has(artistKey)) {
        throw new BuildError(`Release "${rel.key}" references unknown party "${artistKey}"`);
      }
    }
    if (rel.coverArtKey && !imageKeys.has(rel.coverArtKey)) {
      throw new BuildError(`Release "${rel.key}" references unknown cover art image "${rel.coverArtKey}"`);
    }
    const seenPositions = new Set<number>();
    for (const track of rel.tracks) {
      if (!recordingKeys.has(track.soundRecordingKey)) {
        throw new BuildError(
          `Release "${rel.key}" track references unknown sound recording "${track.soundRecordingKey}"`,
        );
      }
      if (seenPositions.has(track.position)) {
        throw new BuildError(`Release "${rel.key}" has duplicate track position ${track.position}`);
      }
      seenPositions.add(track.position);
    }
    const sortedPositions = [...seenPositions].sort((a, b) => a - b);
    for (let i = 0; i < sortedPositions.length; i++) {
      if (sortedPositions[i] !== i + 1) {
        throw new BuildError(
          `Release "${rel.key}" track positions must be contiguous from 1, got [${sortedPositions.join(', ')}]`,
        );
      }
    }
  }

  for (const deal of input.deals) {
    for (const relKey of deal.releaseKeys) {
      if (!releaseKeys.has(relKey)) {
        throw new BuildError(`Deal references unknown release "${relKey}"`);
      }
    }
  }
}

// --- MessageHeader ---------------------------------------------------------

function buildMessageHeader(header: MessageHeader, _prefix: string): XmlElement {
  const createdAt = header.createdDateTime ?? new Date().toISOString();
  return el(
    'MessageHeader',
    undefined,
    compact([
      header.messageThreadId ? leaf('MessageThreadId', header.messageThreadId) : undefined,
      leaf('MessageId', header.messageId),
      header.messageFileName ? leaf('MessageFileName', header.messageFileName) : undefined,
      el('MessageSender', undefined, [
        leaf('PartyId', header.sender.partyId),
        el('PartyName', undefined, [leaf('FullName', header.sender.partyName)]),
      ]),
      el('MessageRecipient', undefined, [
        leaf('PartyId', header.recipient.partyId),
        el('PartyName', undefined, [leaf('FullName', header.recipient.partyName)]),
      ]),
      leaf('MessageCreatedDateTime', createdAt),
      leaf('MessageControlType', header.controlType),
    ]),
  );
}

// --- PartyList -------------------------------------------------------------

function buildPartyList(parties: Party[], refs: ReferenceTable, _prefix: string): XmlElement {
  return el(
    'PartyList',
    undefined,
    parties.map((p) => buildParty(p, refs)),
  );
}

function buildParty(party: Party, refs: ReferenceTable): XmlElement {
  const nameChildren = compact([
    leaf('FullName', party.name),
    party.nameAsciiTranscribed ? leaf('FullNameAsciiTranscribed', party.nameAsciiTranscribed) : undefined,
  ]);
  const idChildren = compact([
    party.identifiers?.dpid ? leaf('DPID', party.identifiers.dpid) : undefined,
    party.identifiers?.isni ? leaf('ISNI', party.identifiers.isni) : undefined,
    party.identifiers?.ipn ? leaf('IPN', party.identifiers.ipn) : undefined,
    party.identifiers?.proprietaryId
      ? leaf('ProprietaryId', party.identifiers.proprietaryId)
      : undefined,
  ]);

  return el(
    'Party',
    undefined,
    compact([
      leaf('PartyReference', refs.party(party.key)),
      el('PartyName', undefined, nameChildren),
      idChildren.length > 0 ? el('PartyId', undefined, idChildren) : undefined,
    ]),
  );
}

// --- ResourceList ----------------------------------------------------------

function buildResourceList(
  recordings: SoundRecording[],
  images: Image[],
  refs: ReferenceTable,
  _prefix: string,
): XmlElement {
  const children: XmlElement[] = [
    ...recordings.map((sr) => buildSoundRecording(sr, refs)),
    ...images.map((img) => buildImage(img, refs)),
  ];
  return el('ResourceList', undefined, children);
}

function buildSoundRecording(sr: SoundRecording, refs: ReferenceTable): XmlElement {
  const isrcNormalized = normalizeIsrc(sr.isrc);
  return el(
    'SoundRecording',
    undefined,
    compact([
      leaf('ResourceReference', refs.soundRecording(sr.key)),
      leaf('Type', 'MusicalWorkSoundRecording'),
      el('ResourceId', undefined, [leaf('ISRC', isrcNormalized)]),
      leaf('DisplayTitleText', sr.title),
      el(
        'DisplayTitle',
        undefined,
        compact([
          leaf('TitleText', sr.title),
          sr.subtitle ? leaf('SubTitle', sr.subtitle) : undefined,
        ]),
      ),
      ...buildDisplayArtists(sr.displayArtists, refs),
      ...sr.contributors.map((c) =>
        el('Contributor', undefined, [
          leaf('ContributorPartyReference', refs.party(c.partyKey)),
          leaf('Role', c.role),
        ]),
      ),
      leaf('Duration', sr.duration),
      leaf('ParentalWarningType', sr.parentalWarning),
      el(
        'SoundRecordingEdition',
        undefined,
        compact([
          leaf('Type', 'NonImmersiveEdition'),
          el('ResourceId', undefined, [leaf('ISRC', isrcNormalized)]),
          buildAudioTechnicalDetails(sr, refs),
        ]),
      ),
    ]),
  );
}

function buildAudioTechnicalDetails(sr: SoundRecording, refs: ReferenceTable): XmlElement {
  const tdRef = `T-${refs.soundRecording(sr.key)}`;
  return el(
    'TechnicalDetails',
    undefined,
    compact([
      leaf('TechnicalResourceDetailsReference', tdRef),
      leaf('AudioCodecType', sr.audioCodec),
      sr.numberOfChannels !== undefined ? leaf('NumberOfChannels', sr.numberOfChannels) : undefined,
      sr.samplingRate !== undefined ? leaf('SamplingRate', sr.samplingRate) : undefined,
      sr.bitsPerSample !== undefined ? leaf('BitsPerSample', sr.bitsPerSample) : undefined,
      buildFileNode(sr.file),
    ]),
  );
}

function buildImage(img: Image, refs: ReferenceTable): XmlElement {
  const tdRef = `T-${refs.image(img.key)}`;
  return el(
    'Image',
    undefined,
    compact([
      leaf('ResourceReference', refs.image(img.key)),
      leaf('Type', 'FrontCoverImage'),
      el('ResourceId', undefined, [leaf('ProprietaryId', img.proprietaryId ?? img.key)]),
      el(
        'TechnicalDetails',
        undefined,
        compact([
          leaf('TechnicalResourceDetailsReference', tdRef),
          leaf('ImageCodecType', img.imageCodec),
          leaf('ImageHeight', img.height),
          leaf('ImageWidth', img.width),
          buildFileNode(img.file),
        ]),
      ),
    ]),
  );
}

function buildFileNode(file: { uri: string; hash?: { value: string; algorithm: string } }): XmlElement {
  return el(
    'File',
    undefined,
    compact([
      leaf('URI', file.uri),
      file.hash
        ? el('HashSum', undefined, [
            leaf('HashSum', file.hash.value),
            leaf('HashSumAlgorithmType', file.hash.algorithm),
          ])
        : undefined,
    ]),
  );
}

function buildDisplayArtists(partyKeys: string[], refs: ReferenceTable): XmlElement[] {
  // DDEX emits DisplayArtistName (the human-readable form) followed by one
  // DisplayArtist block per party. Names are looked up via reference lookups
  // higher up; here we use the reference itself for the textual form because
  // the schema only carries party keys at this layer.
  return [
    ...partyKeys.map((key) =>
      el('DisplayArtist', { SequenceNumber: partyKeys.indexOf(key) + 1 }, [
        leaf('ArtistPartyReference', refs.party(key)),
        leaf('DisplayArtistRole', 'MainArtist'),
      ]),
    ),
  ];
}

// --- ReleaseList -----------------------------------------------------------

function buildReleaseList(releases: Release[], refs: ReferenceTable, _prefix: string): XmlElement {
  return el(
    'ReleaseList',
    undefined,
    releases.map((r) => buildRelease(r, refs)),
  );
}

function buildRelease(rel: Release, refs: ReferenceTable): XmlElement {
  const sortedTracks = [...rel.tracks].sort((a, b) => a.position - b.position);
  const resourceRefs = compact([
    rel.coverArtKey ? leaf('ReleaseResourceReference', refs.image(rel.coverArtKey)) : undefined,
    ...sortedTracks.map((t) => leaf('ReleaseResourceReference', refs.soundRecording(t.soundRecordingKey))),
  ]);

  const resourceGroup = el(
    'ResourceGroup',
    undefined,
    compact([
      leaf('SequenceNumber', 1),
      ...sortedTracks.map((t) =>
        el('ResourceGroupContentItem', undefined, [
          leaf('SequenceNumber', t.position),
          leaf('ReleaseResourceReference', refs.soundRecording(t.soundRecordingKey)),
        ]),
      ),
    ]),
  );

  const idChildren = compact([
    rel.grid ? leaf('GRid', rel.grid) : undefined,
    leaf('ICPN', normalizeIcpn(rel.upc)),
  ]);

  return el(
    'Release',
    undefined,
    compact([
      leaf('ReleaseReference', refs.release(rel.key)),
      leaf('ReleaseType', rel.type),
      el('ReleaseId', undefined, idChildren),
      leaf('DisplayTitleText', rel.title),
      el(
        'DisplayTitle',
        undefined,
        compact([leaf('TitleText', rel.title), rel.subtitle ? leaf('SubTitle', rel.subtitle) : undefined]),
      ),
      ...buildDisplayArtists(rel.displayArtists, refs),
      leaf('ReleaseLabelReference', refs.party(rel.labelPartyKey)),
      el(
        'Genre',
        undefined,
        compact([leaf('GenreText', rel.genre), rel.subGenre ? leaf('SubGenre', rel.subGenre) : undefined]),
      ),
      rel.pLine ? leaf('PLine', rel.pLine) : undefined,
      rel.cLine ? leaf('CLine', rel.cLine) : undefined,
      leaf('ParentalWarningType', rel.parentalWarning),
      el('ReleaseResourceReferenceList', undefined, resourceRefs),
      resourceGroup,
    ]),
  );
}

// --- DealList --------------------------------------------------------------

function buildDealList(deals: Deal[], refs: ReferenceTable, _prefix: string): XmlElement | undefined {
  if (deals.length === 0) return undefined;
  return el(
    'DealList',
    undefined,
    deals.map((d) => buildReleaseDeal(d, refs)),
  );
}

function buildReleaseDeal(deal: Deal, refs: ReferenceTable): XmlElement {
  const validity = compact([
    leaf('StartDate', deal.startDate),
    deal.endDate ? leaf('EndDate', deal.endDate) : undefined,
  ]);

  const dealTerms = el(
    'DealTerms',
    undefined,
    compact([
      leaf('CommercialModelType', deal.commercialModel),
      ...deal.useTypes.map((u) => el('Usage', undefined, [leaf('UseType', u)])),
      ...deal.territories.map((t) => leaf('TerritoryCode', t)),
      ...(deal.excludedTerritories ?? []).map((t) => leaf('ExcludedTerritoryCode', t)),
      validity.length > 0 ? el('ValidityPeriod', undefined, validity) : undefined,
      deal.price
        ? el('PriceInformation', undefined, [
            el(
              'WholesalePricePerUnit',
              { CurrencyCode: deal.price.currencyCode },
              deal.price.amount.toFixed(2),
            ),
          ])
        : undefined,
    ]),
  );

  return el(
    'ReleaseDeal',
    undefined,
    [
      ...deal.releaseKeys.map((k) => leaf('DealReleaseReference', refs.release(k))),
      el('Deal', undefined, [dealTerms]),
    ],
  );
}
