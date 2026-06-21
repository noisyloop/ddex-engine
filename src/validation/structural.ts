/**
 * Structural validator for DDEX ERN XML.
 *
 * Operates on parsed XML rather than the Zod input — this catches problems in
 * a message we *received* from a partner, not just in a message we built.
 * Checks: required elements present, identifier formats, territory codes,
 * date/duration shapes, and reference integrity (every PartyReference cited
 * elsewhere must appear in PartyList; same for resource/release refs).
 *
 * We deliberately skip XSD validation. Linking libxml is brittle and our
 * structural checks catch the failures that actually break partner ingestion.
 */

import { XMLParser } from 'fast-xml-parser';
import {
  isValidDate,
  isValidDateTime,
  isValidDuration,
  isValidEan13,
  isValidIsrc,
  isValidTerritory,
} from './formats.js';
import { versionFromNamespace } from '../templates/namespaces.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  version?: string;
}

interface AnyXmlNode {
  [key: string]: unknown;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  allowBooleanAttributes: true,
});

export function validateXml(xml: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  let parsed: AnyXmlNode;
  try {
    parsed = parser.parse(xml) as AnyXmlNode;
  } catch (e) {
    return {
      ok: false,
      errors: [{ severity: 'error', path: '/', message: `XML parse error: ${(e as Error).message}` }],
      warnings: [],
    };
  }

  // Find the root element regardless of namespace prefix.
  const rootKey = Object.keys(parsed).find((k) => k.endsWith(':NewReleaseMessage') || k === 'NewReleaseMessage');
  if (!rootKey) {
    errors.push({
      severity: 'error',
      path: '/',
      message: 'Root element must be NewReleaseMessage',
    });
    return { ok: false, errors, warnings };
  }

  const root = parsed[rootKey] as AnyXmlNode;
  const ernUri = findErnNamespace(root);
  const version = ernUri ? versionFromNamespace(ernUri) : undefined;

  // Required top-level sections.
  for (const required of ['MessageHeader', 'PartyList', 'ResourceList', 'ReleaseList']) {
    if (!root[required]) {
      errors.push({
        severity: 'error',
        path: `/${rootKey}/${required}`,
        message: `Missing required element ${required}`,
      });
    }
  }

  if (root.MessageHeader) validateMessageHeader(root.MessageHeader as AnyXmlNode, errors);

  const partyRefs = collectPartyReferences(root.PartyList as AnyXmlNode | undefined);
  const recordingRefs = new Set<string>();
  const imageRefs = new Set<string>();
  const releaseRefs = new Set<string>();

  if (root.ResourceList) {
    validateResourceList(root.ResourceList as AnyXmlNode, recordingRefs, imageRefs, errors);
  }
  if (root.ReleaseList) {
    validateReleaseList(
      root.ReleaseList as AnyXmlNode,
      partyRefs,
      recordingRefs,
      imageRefs,
      releaseRefs,
      errors,
    );
  }
  if (root.DealList) {
    validateDealList(root.DealList as AnyXmlNode, releaseRefs, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    version,
  };
}

function findErnNamespace(root: AnyXmlNode): string | undefined {
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

function validateMessageHeader(header: AnyXmlNode, errors: ValidationIssue[]): void {
  const base = '/NewReleaseMessage/MessageHeader';
  if (!textOf(header.MessageId)) {
    errors.push({ severity: 'error', path: `${base}/MessageId`, message: 'MessageId is required' });
  }
  const createdAt = textOf(header.MessageCreatedDateTime);
  if (!createdAt) {
    errors.push({
      severity: 'error',
      path: `${base}/MessageCreatedDateTime`,
      message: 'MessageCreatedDateTime is required',
    });
  } else if (!isValidDateTime(createdAt)) {
    errors.push({
      severity: 'error',
      path: `${base}/MessageCreatedDateTime`,
      message: `MessageCreatedDateTime "${createdAt}" is not valid ISO 8601`,
    });
  }
  if (!header.MessageSender || !header.MessageRecipient) {
    errors.push({
      severity: 'error',
      path: base,
      message: 'MessageSender and MessageRecipient are required',
    });
  }
}

function collectPartyReferences(partyList: AnyXmlNode | undefined): Set<string> {
  const refs = new Set<string>();
  if (!partyList) return refs;
  for (const party of asArray(partyList.Party) as AnyXmlNode[]) {
    const ref = textOf(party.PartyReference);
    if (ref) refs.add(ref);
  }
  return refs;
}

function validateResourceList(
  resourceList: AnyXmlNode,
  recordingRefs: Set<string>,
  imageRefs: Set<string>,
  errors: ValidationIssue[],
): void {
  for (const sr of asArray(resourceList.SoundRecording) as AnyXmlNode[]) {
    const ref = textOf(sr.ResourceReference);
    if (ref) recordingRefs.add(ref);
    const path = `/NewReleaseMessage/ResourceList/SoundRecording[${ref ?? '?'}]`;

    const isrc = textOf(((sr.ResourceId as AnyXmlNode) ?? {}).ISRC);
    if (!isrc) {
      errors.push({ severity: 'error', path: `${path}/ResourceId/ISRC`, message: 'ISRC is required' });
    } else if (!isValidIsrc(isrc)) {
      errors.push({
        severity: 'error',
        path: `${path}/ResourceId/ISRC`,
        message: `ISRC "${isrc}" does not match required format`,
      });
    }

    const duration = textOf(sr.Duration);
    if (!duration) {
      errors.push({ severity: 'error', path: `${path}/Duration`, message: 'Duration is required' });
    } else if (!isValidDuration(duration)) {
      errors.push({
        severity: 'error',
        path: `${path}/Duration`,
        message: `Duration "${duration}" is not a valid ISO 8601 duration`,
      });
    }
  }

  for (const img of asArray(resourceList.Image) as AnyXmlNode[]) {
    const ref = textOf(img.ResourceReference);
    if (ref) imageRefs.add(ref);
  }
}

function validateReleaseList(
  releaseList: AnyXmlNode,
  partyRefs: Set<string>,
  recordingRefs: Set<string>,
  imageRefs: Set<string>,
  releaseRefs: Set<string>,
  errors: ValidationIssue[],
): void {
  for (const rel of asArray(releaseList.Release) as AnyXmlNode[]) {
    const ref = textOf(rel.ReleaseReference);
    if (ref) releaseRefs.add(ref);
    const path = `/NewReleaseMessage/ReleaseList/Release[${ref ?? '?'}]`;

    const releaseId = rel.ReleaseId as AnyXmlNode | undefined;
    const icpn = releaseId ? textOf(releaseId.ICPN) : undefined;
    if (!icpn) {
      errors.push({ severity: 'error', path: `${path}/ReleaseId/ICPN`, message: 'ICPN is required' });
    } else if (!isValidEan13(icpn)) {
      errors.push({
        severity: 'error',
        path: `${path}/ReleaseId/ICPN`,
        message: `ICPN "${icpn}" failed EAN-13 check`,
      });
    }

    const labelRef = textOf(rel.ReleaseLabelReference);
    if (labelRef && !partyRefs.has(labelRef)) {
      errors.push({
        severity: 'error',
        path: `${path}/ReleaseLabelReference`,
        message: `Dangling party reference "${labelRef}"`,
      });
    }

    for (const da of asArray(rel.DisplayArtist) as AnyXmlNode[]) {
      const artistRef = textOf(da.ArtistPartyReference);
      if (artistRef && !partyRefs.has(artistRef)) {
        errors.push({
          severity: 'error',
          path: `${path}/DisplayArtist/ArtistPartyReference`,
          message: `Dangling party reference "${artistRef}"`,
        });
      }
    }

    const resourceGroup = rel.ResourceGroup as AnyXmlNode | undefined;
    for (const item of asArray(resourceGroup?.ResourceGroupContentItem) as AnyXmlNode[]) {
      const refValue = textOf(item.ReleaseResourceReference);
      if (refValue && !recordingRefs.has(refValue) && !imageRefs.has(refValue)) {
        errors.push({
          severity: 'error',
          path: `${path}/ResourceGroup/ResourceGroupContentItem/ReleaseResourceReference`,
          message: `Dangling resource reference "${refValue}"`,
        });
      }
    }
    for (const r of asArray(resourceGroup?.LinkedReleaseResourceReference) as unknown[]) {
      const refValue = textOf(r);
      if (refValue && !recordingRefs.has(refValue) && !imageRefs.has(refValue)) {
        errors.push({
          severity: 'error',
          path: `${path}/ResourceGroup/LinkedReleaseResourceReference`,
          message: `Dangling resource reference "${refValue}"`,
        });
      }
    }
  }
}

function validateDealList(
  dealList: AnyXmlNode,
  releaseRefs: Set<string>,
  errors: ValidationIssue[],
): void {
  for (const releaseDeal of asArray(dealList.ReleaseDeal) as AnyXmlNode[]) {
    const path = '/NewReleaseMessage/DealList/ReleaseDeal';
    for (const refNode of asArray(releaseDeal.DealReleaseReference) as unknown[]) {
      const ref = textOf(refNode);
      if (ref && !releaseRefs.has(ref)) {
        errors.push({
          severity: 'error',
          path: `${path}/DealReleaseReference`,
          message: `Dangling release reference "${ref}"`,
        });
      }
    }
    const deals = asArray(releaseDeal.Deal) as AnyXmlNode[];
    for (const deal of deals) {
      const terms = deal.DealTerms as AnyXmlNode | undefined;
      if (!terms) continue;
      for (const t of asArray(terms.TerritoryCode) as unknown[]) {
        const code = textOf(t);
        if (code && !isValidTerritory(code)) {
          errors.push({
            severity: 'error',
            path: `${path}/Deal/DealTerms/TerritoryCode`,
            message: `Territory "${code}" is not a valid ISO 3166-1 alpha-2 code`,
          });
        }
      }
      const validity = terms.ValidityPeriod as AnyXmlNode | undefined;
      if (validity) {
        const start = textOf(validity.StartDate);
        if (start && !isValidDate(start)) {
          errors.push({
            severity: 'error',
            path: `${path}/Deal/DealTerms/ValidityPeriod/StartDate`,
            message: `StartDate "${start}" is not YYYY-MM-DD`,
          });
        }
        const end = textOf(validity.EndDate);
        if (end && !isValidDate(end)) {
          errors.push({
            severity: 'error',
            path: `${path}/Deal/DealTerms/ValidityPeriod/EndDate`,
            message: `EndDate "${end}" is not YYYY-MM-DD`,
          });
        }
      }
    }
  }
}
