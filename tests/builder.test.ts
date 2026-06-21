import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReleaseMessage, BuildError } from '../src/builder/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, '../fixtures/sample-single.json');

async function loadFixture(): Promise<Record<string, unknown>> {
  const text = await readFile(fixture, 'utf8');
  return JSON.parse(text);
}

describe('buildReleaseMessage', () => {
  it('builds well-formed ERN 4.3 XML from the sample fixture', async () => {
    const input = await loadFixture();
    const result = buildReleaseMessage(input);
    expect(result.xml).toMatch(/^<\?xml version="1.0"/);
    expect(result.xml).toContain('xmlns:ern="http://ddex.net/xml/ern/43"');
    expect(result.xml).toContain('MessageSchemaVersionId="ern/43"');
    expect(result.xml).toContain('<ISRC>USRC12500001</ISRC>');
    expect(result.xml).toContain('<ICPN>5060000000016</ICPN>');
  });

  it('mints stable references in insertion order', async () => {
    const input = await loadFixture();
    const result = buildReleaseMessage(input);
    expect(result.references.parties['label-noisyloop']).toBe('P1');
    expect(result.references.parties['artist-aria']).toBe('P2');
    expect(result.references.parties['producer-kai']).toBe('P3');
    expect(result.references.soundRecordings['track-1']).toBe('A1');
    expect(result.references.images['cover']).toBe('I1');
    expect(result.references.releases['rel-1']).toBe('R1');
  });

  it('is deterministic (same input -> byte-identical XML)', async () => {
    const input = await loadFixture();
    const a = buildReleaseMessage(input).xml;
    const b = buildReleaseMessage(JSON.parse(JSON.stringify(input))).xml;
    expect(a).toBe(b);
  });

  it('places sections in the canonical ERN 4.3 order', async () => {
    const input = await loadFixture();
    const xml = buildReleaseMessage(input).xml;
    const headerIdx = xml.indexOf('<MessageHeader>');
    const partyIdx = xml.indexOf('<PartyList>');
    const resourceIdx = xml.indexOf('<ResourceList>');
    const releaseIdx = xml.indexOf('<ReleaseList>');
    const dealIdx = xml.indexOf('<DealList>');
    expect(headerIdx).toBeGreaterThan(0);
    expect(headerIdx).toBeLessThan(partyIdx);
    expect(partyIdx).toBeLessThan(resourceIdx);
    expect(resourceIdx).toBeLessThan(releaseIdx);
    expect(releaseIdx).toBeLessThan(dealIdx);
  });

  it('rejects dangling party references', async () => {
    const input = await loadFixture();
    (input.releases as Array<{ labelPartyKey: string }>)[0]!.labelPartyKey = 'no-such-party';
    expect(() => buildReleaseMessage(input)).toThrow(BuildError);
  });

  it('rejects non-contiguous track positions', async () => {
    const input = await loadFixture();
    const release = (input.releases as Array<{ tracks: { position: number; soundRecordingKey: string }[] }>)[0]!;
    release.tracks[0]!.position = 5;
    expect(() => buildReleaseMessage(input)).toThrow(BuildError);
  });

  it('rejects an invalid ISRC at the schema boundary', async () => {
    const input = await loadFixture();
    (input.soundRecordings as Array<{ isrc: string }>)[0]!.isrc = 'BOGUS';
    expect(() => buildReleaseMessage(input)).toThrow(/Invalid release message input/);
  });

  it('emits compact XML when pretty=false', async () => {
    const input = await loadFixture();
    (input.config as { pretty: boolean }).pretty = false;
    const xml = buildReleaseMessage(input).xml;
    expect(xml).not.toMatch(/\n  /);
  });

  it('emits DisplayArtistName on both SoundRecording and Release before DisplayArtist', async () => {
    const input = await loadFixture();
    const xml = buildReleaseMessage(input).xml;

    // Count once per parent (the fixture has one of each).
    const occurrences = (xml.match(/<DisplayArtistName>Aria Vance<\/DisplayArtistName>/g) ?? []).length;
    expect(occurrences).toBe(2);

    // SoundRecording: DisplayArtistName precedes DisplayArtist within the
    // SoundRecording element.
    const srStart = xml.indexOf('<SoundRecording>');
    const srEnd = xml.indexOf('</SoundRecording>', srStart);
    const srBlock = xml.slice(srStart, srEnd);
    const srNameIdx = srBlock.indexOf('<DisplayArtistName>');
    const srArtistIdx = srBlock.indexOf('<DisplayArtist ');
    expect(srNameIdx).toBeGreaterThan(0);
    expect(srNameIdx).toBeLessThan(srArtistIdx);

    // Release: DisplayArtistName precedes DisplayArtist within the Release element.
    const relStart = xml.indexOf('<Release>');
    const relEnd = xml.indexOf('</Release>', relStart);
    const relBlock = xml.slice(relStart, relEnd);
    const relNameIdx = relBlock.indexOf('<DisplayArtistName>');
    const relArtistIdx = relBlock.indexOf('<DisplayArtist ');
    expect(relNameIdx).toBeGreaterThan(0);
    expect(relNameIdx).toBeLessThan(relArtistIdx);
  });

  it('emits PLine and CLine as composites with Year and text', async () => {
    const input = await loadFixture();
    const xml = buildReleaseMessage(input).xml;
    expect(xml).toMatch(/<PLine>[\s\S]*?<Year>2026<\/Year>[\s\S]*?<PLineText>\(P\) 2026 Noisyloop Records<\/PLineText>[\s\S]*?<\/PLine>/);
    expect(xml).toMatch(/<CLine>[\s\S]*?<Year>2026<\/Year>[\s\S]*?<CLineText>\(C\) 2026 Noisyloop Records<\/CLineText>[\s\S]*?<\/CLine>/);
  });

  it('does not emit ReleaseResourceReferenceList (removed in ERN 4.3)', async () => {
    const input = await loadFixture();
    const xml = buildReleaseMessage(input).xml;
    expect(xml).not.toContain('ReleaseResourceReferenceList');
  });

  it('requires createdDateTime (no implicit now() fallback)', async () => {
    const input = await loadFixture();
    delete (input.header as Record<string, unknown>).createdDateTime;
    expect(() => buildReleaseMessage(input)).toThrow(/Invalid release message input/);
  });

  it('escapes special characters in text content', async () => {
    const input = await loadFixture();
    (input.soundRecordings as Array<{ title: string }>)[0]!.title = 'Static & Light <demo>';
    const xml = buildReleaseMessage(input).xml;
    expect(xml).toContain('Static &amp; Light &lt;demo&gt;');
  });
});
