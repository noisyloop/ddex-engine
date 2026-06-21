/**
 * DDEX ERN parser.
 *
 * Reads an ERN NewReleaseMessage and produces the same `ReleaseMessageInput`
 * shape the builder accepts, so a parsed message can be re-built losslessly
 * (round-trip tested in tests/roundtrip.test.ts).
 *
 * The parser sniffs the ERN version from the root namespace. References are
 * flattened: parties are addressed by their PartyReference (P1...) as the key,
 * sound recordings by ResourceReference (A1...), etc. This means a parsed
 * message rebuilt through the builder will produce the same references it had
 * originally, which makes diffing painless.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  Deal,
  Image,
  MessageHeader,
  Party,
  Release,
  ReleaseMessageInput,
  SoundRecording,
} from '../schemas/index.js';
import { versionFromNamespace, type ErnVersion } from '../templates/namespaces.js';
import { secondsToDuration } from '../validation/formats.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

interface AnyNode {
  [key: string]: unknown;
}

export interface ParseResult {
  input: ReleaseMessageInput;
  version: ErnVersion;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string | undefined {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node && typeof node === 'object' && '#text' in (node as object)) {
    const t = (node as { '#text': unknown })['#text'];
    return typeof t === 'string' ? t : t == null ? undefined : String(t);
  }
  return undefined;
}

function requireText(node: unknown, what: string): string {
  const value = textOf(node);
  if (value === undefined) throw new ParseError(`Missing required ${what}`);
  return value;
}

function findErnNamespace(root: AnyNode): string | undefined {
  for (const [k, v] of Object.entries(root)) {
    if (k.startsWith('@_xmlns:') && typeof v === 'string' && v.includes('ddex.net/xml/ern')) {
      return v;
    }
    if (k === '@_xmlns' && typeof v === 'string' && v.includes('ddex.net/xml/ern')) {
      return v;
    }
  }
  return undefined;
}

export function parseReleaseMessage(xml: string): ParseResult {
  const parsed = parser.parse(xml) as AnyNode;
  const rootKey = Object.keys(parsed).find(
    (k) => k.endsWith(':NewReleaseMessage') || k === 'NewReleaseMessage',
  );
  if (!rootKey) {
    throw new ParseError('Could not find NewReleaseMessage root element');
  }
  const root = parsed[rootKey] as AnyNode;

  const ernUri = findErnNamespace(root);
  const version = (ernUri ? versionFromNamespace(ernUri) : undefined) ?? '4.3';

  const header = parseHeader(root.MessageHeader as AnyNode);
  const parties = parsePartyList(root.PartyList as AnyNode | undefined);
  const { soundRecordings, images } = parseResourceList(root.ResourceList as AnyNode | undefined);
  const releases = parseReleaseList(root.ReleaseList as AnyNode | undefined);
  const deals = parseDealList(root.DealList as AnyNode | undefined);

  const input: ReleaseMessageInput = {
    config: { version: '4.3', pretty: true },
    header,
    parties,
    soundRecordings,
    images,
    releases,
    deals,
  };

  return { input, version };
}

function parseHeader(header: AnyNode | undefined): MessageHeader {
  if (!header) throw new ParseError('Missing MessageHeader');
  const sender = header.MessageSender as AnyNode | undefined;
  const recipient = header.MessageRecipient as AnyNode | undefined;
  if (!sender || !recipient) throw new ParseError('MessageHeader missing sender/recipient');

  return {
    messageId: requireText(header.MessageId, 'MessageId'),
    messageThreadId: textOf(header.MessageThreadId),
    messageFileName: textOf(header.MessageFileName),
    sender: {
      partyId: requireText(sender.PartyId, 'MessageSender.PartyId'),
      partyName: requireText(
        (sender.PartyName as AnyNode | undefined)?.FullName,
        'MessageSender.PartyName.FullName',
      ),
    },
    recipient: {
      partyId: requireText(recipient.PartyId, 'MessageRecipient.PartyId'),
      partyName: requireText(
        (recipient.PartyName as AnyNode | undefined)?.FullName,
        'MessageRecipient.PartyName.FullName',
      ),
    },
    createdDateTime: textOf(header.MessageCreatedDateTime),
    controlType: (textOf(header.MessageControlType) as 'LiveMessage' | 'TestMessage') ?? 'LiveMessage',
  };
}

function parsePartyList(partyList: AnyNode | undefined): Party[] {
  return asArray(partyList?.Party as AnyNode | AnyNode[] | undefined).map((p) => {
    const name = p.PartyName as AnyNode | undefined;
    const ids = p.PartyId as AnyNode | undefined;
    const party: Party = {
      key: requireText(p.PartyReference, 'PartyReference'),
      name: requireText(name?.FullName, 'PartyName.FullName'),
    };
    const asciiName = textOf(name?.FullNameAsciiTranscribed);
    if (asciiName !== undefined) party.nameAsciiTranscribed = asciiName;
    if (ids) {
      const identifiers: NonNullable<Party['identifiers']> = {};
      const dpid = textOf(ids.DPID);
      const isni = textOf(ids.ISNI);
      const ipn = textOf(ids.IPN);
      const proprietaryId = textOf(ids.ProprietaryId);
      if (dpid !== undefined) identifiers.dpid = dpid;
      if (isni !== undefined) identifiers.isni = isni;
      if (ipn !== undefined) identifiers.ipn = ipn;
      if (proprietaryId !== undefined) identifiers.proprietaryId = proprietaryId;
      if (Object.keys(identifiers).length > 0) party.identifiers = identifiers;
    }
    return party;
  });
}

function parseResourceList(
  list: AnyNode | undefined,
): { soundRecordings: SoundRecording[]; images: Image[] } {
  const soundRecordings: SoundRecording[] = [];
  const images: Image[] = [];

  for (const sr of asArray(list?.SoundRecording as AnyNode | AnyNode[] | undefined)) {
    soundRecordings.push(parseSoundRecording(sr));
  }
  for (const img of asArray(list?.Image as AnyNode | AnyNode[] | undefined)) {
    images.push(parseImage(img));
  }

  return { soundRecordings, images };
}

function parseSoundRecording(sr: AnyNode): SoundRecording {
  const edition = sr.SoundRecordingEdition as AnyNode | undefined;
  const td = edition?.TechnicalDetails as AnyNode | undefined;
  const resourceId = sr.ResourceId as AnyNode | undefined;
  const isrc = requireText(resourceId?.ISRC, 'SoundRecording ISRC');

  const displayArtists = asArray(sr.DisplayArtist as AnyNode | AnyNode[] | undefined).map((da) =>
    requireText(da.ArtistPartyReference, 'ArtistPartyReference'),
  );

  const contributors = asArray(sr.Contributor as AnyNode | AnyNode[] | undefined).map((c) => ({
    partyKey: requireText(c.ContributorPartyReference, 'ContributorPartyReference'),
    role: requireText(c.Role, 'Contributor.Role') as SoundRecording['contributors'][number]['role'],
  }));

  const file = (td?.File as AnyNode | undefined) ?? {};
  const hashNode = file.HashSum as AnyNode | undefined;

  const recording: SoundRecording = {
    key: requireText(sr.ResourceReference, 'ResourceReference'),
    isrc,
    title: requireText(sr.DisplayTitleText, 'DisplayTitleText'),
    duration: requireText(sr.Duration, 'Duration'),
    displayArtists,
    contributors,
    audioCodec: (textOf(td?.AudioCodecType) as SoundRecording['audioCodec']) ?? 'WAV',
    file: {
      uri: requireText(file.URI, 'File.URI'),
      ...(hashNode
        ? {
            hash: {
              value: requireText(hashNode.HashSum, 'HashSum.HashSum'),
              algorithm: requireText(
                hashNode.HashSumAlgorithmType,
                'HashSum.HashSumAlgorithmType',
              ) as 'MD5' | 'SHA1' | 'SHA256',
            },
          }
        : {}),
    },
    parentalWarning:
      (textOf(sr.ParentalWarningType) as SoundRecording['parentalWarning']) ?? 'NotExplicit',
  };

  const subtitle = textOf((sr.DisplayTitle as AnyNode | undefined)?.SubTitle);
  if (subtitle !== undefined) recording.subtitle = subtitle;
  const channels = textOf(td?.NumberOfChannels);
  const sampling = textOf(td?.SamplingRate);
  const bits = textOf(td?.BitsPerSample);
  if (channels !== undefined) recording.numberOfChannels = Number(channels);
  if (sampling !== undefined) recording.samplingRate = Number(sampling);
  if (bits !== undefined) recording.bitsPerSample = Number(bits);

  return recording;
}

function parseImage(img: AnyNode): Image {
  const td = img.TechnicalDetails as AnyNode | undefined;
  const file = (td?.File as AnyNode | undefined) ?? {};
  const hashNode = file.HashSum as AnyNode | undefined;
  const resourceId = img.ResourceId as AnyNode | undefined;
  const proprietaryId = textOf(resourceId?.ProprietaryId);
  return {
    key: requireText(img.ResourceReference, 'Image.ResourceReference'),
    ...(proprietaryId !== undefined ? { proprietaryId } : {}),
    imageCodec: (textOf(td?.ImageCodecType) as Image['imageCodec']) ?? 'JPEG',
    width: Number(requireText(td?.ImageWidth, 'ImageWidth')),
    height: Number(requireText(td?.ImageHeight, 'ImageHeight')),
    file: {
      uri: requireText(file.URI, 'Image File.URI'),
      ...(hashNode
        ? {
            hash: {
              value: requireText(hashNode.HashSum, 'HashSum.HashSum'),
              algorithm: requireText(
                hashNode.HashSumAlgorithmType,
                'HashSum.HashSumAlgorithmType',
              ) as 'MD5' | 'SHA1' | 'SHA256',
            },
          }
        : {}),
    },
  };
}

function parseReleaseList(list: AnyNode | undefined): Release[] {
  return asArray(list?.Release as AnyNode | AnyNode[] | undefined).map((rel) => {
    const id = rel.ReleaseId as AnyNode | undefined;
    const icpn = requireText(id?.ICPN, 'Release ICPN');
    const displayArtists = asArray(rel.DisplayArtist as AnyNode | AnyNode[] | undefined).map((da) =>
      requireText(da.ArtistPartyReference, 'Release.ArtistPartyReference'),
    );

    const refList = rel.ReleaseResourceReferenceList as AnyNode | undefined;
    const allRefs = asArray(refList?.ReleaseResourceReference as unknown).map((r) =>
      requireText(r, 'ReleaseResourceReference'),
    );
    const coverArtKey = allRefs.find((r) => r.startsWith('I'));

    const resourceGroup = rel.ResourceGroup as AnyNode | undefined;
    const tracks = asArray(
      resourceGroup?.ResourceGroupContentItem as AnyNode | AnyNode[] | undefined,
    ).map((item) => ({
      soundRecordingKey: requireText(item.ReleaseResourceReference, 'ResourceGroupContentItem ref'),
      position: Number(requireText(item.SequenceNumber, 'ResourceGroupContentItem.SequenceNumber')),
    }));

    const genre = rel.Genre as AnyNode | undefined;
    const release: Release = {
      key: requireText(rel.ReleaseReference, 'ReleaseReference'),
      upc: icpn,
      type: requireText(rel.ReleaseType, 'ReleaseType') as Release['type'],
      title: requireText(rel.DisplayTitleText, 'Release.DisplayTitleText'),
      displayArtists,
      labelPartyKey: requireText(rel.ReleaseLabelReference, 'ReleaseLabelReference'),
      genre: requireText(genre?.GenreText, 'Genre.GenreText'),
      tracks,
      parentalWarning:
        (textOf(rel.ParentalWarningType) as Release['parentalWarning']) ?? 'NotExplicit',
    };

    const subtitle = textOf((rel.DisplayTitle as AnyNode | undefined)?.SubTitle);
    if (subtitle !== undefined) release.subtitle = subtitle;
    const grid = textOf(id?.GRid);
    if (grid !== undefined) release.grid = grid;
    const subGenre = textOf(genre?.SubGenre);
    if (subGenre !== undefined) release.subGenre = subGenre;
    const pLine = textOf(rel.PLine);
    if (pLine !== undefined) release.pLine = pLine;
    const cLine = textOf(rel.CLine);
    if (cLine !== undefined) release.cLine = cLine;
    if (coverArtKey !== undefined) release.coverArtKey = coverArtKey;

    return release;
  });
}

function parseDealList(list: AnyNode | undefined): Deal[] {
  if (!list) return [];
  const out: Deal[] = [];
  for (const rd of asArray(list.ReleaseDeal as AnyNode | AnyNode[] | undefined)) {
    const releaseKeys = asArray(rd.DealReleaseReference as unknown).map((r) =>
      requireText(r, 'DealReleaseReference'),
    );
    for (const dealNode of asArray(rd.Deal as AnyNode | AnyNode[] | undefined)) {
      const terms = dealNode.DealTerms as AnyNode | undefined;
      if (!terms) continue;
      const useTypes = asArray(terms.Usage as AnyNode | AnyNode[] | undefined)
        .map((u) => textOf(u.UseType))
        .filter((v): v is string => v !== undefined) as Deal['useTypes'];
      const territories = asArray(terms.TerritoryCode as unknown)
        .map((t) => textOf(t))
        .filter((v): v is string => v !== undefined);
      const excluded = asArray(terms.ExcludedTerritoryCode as unknown)
        .map((t) => textOf(t))
        .filter((v): v is string => v !== undefined);
      const validity = terms.ValidityPeriod as AnyNode | undefined;
      const priceNode = (terms.PriceInformation as AnyNode | undefined)?.WholesalePricePerUnit as
        | AnyNode
        | string
        | undefined;

      const deal: Deal = {
        releaseKeys,
        commercialModel: requireText(
          terms.CommercialModelType,
          'CommercialModelType',
        ) as Deal['commercialModel'],
        useTypes,
        territories,
        startDate: requireText(validity?.StartDate, 'StartDate'),
      };
      if (excluded.length > 0) deal.excludedTerritories = excluded;
      const endDate = textOf(validity?.EndDate);
      if (endDate !== undefined) deal.endDate = endDate;
      if (priceNode && typeof priceNode === 'object') {
        const amountText = textOf(priceNode);
        const currency = (priceNode as AnyNode)['@_CurrencyCode'];
        if (amountText !== undefined && typeof currency === 'string') {
          deal.price = { amount: Number(amountText), currencyCode: currency };
        }
      }
      out.push(deal);
    }
  }
  return out;
}

/** Re-export the seconds→duration helper here for parser consumers. */
export { secondsToDuration };
