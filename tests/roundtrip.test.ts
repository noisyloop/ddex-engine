import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReleaseMessage } from '../src/builder/index.js';
import { parseReleaseMessage } from '../src/parser/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, '../fixtures/sample-single.json');

describe('round-trip: build -> parse -> rebuild', () => {
  it('rebuilds to byte-identical XML', async () => {
    const text = await readFile(fixture, 'utf8');
    const input = JSON.parse(text);
    const firstBuild = buildReleaseMessage(input);
    const { input: parsedInput, version } = parseReleaseMessage(firstBuild.xml);
    expect(version).toBe('4.3');
    // The parser flattens to PartyReferences (P1, A1...) as keys; rebuilding
    // from those keys must produce the same XML, because the reference allocator
    // visits them in the same insertion order.
    const secondBuild = buildReleaseMessage(parsedInput);
    expect(secondBuild.xml).toBe(firstBuild.xml);
  });

  it('parses all parties, recordings, and releases', async () => {
    const text = await readFile(fixture, 'utf8');
    const xml = buildReleaseMessage(JSON.parse(text)).xml;
    const { input } = parseReleaseMessage(xml);
    expect(input.parties).toHaveLength(3);
    expect(input.soundRecordings).toHaveLength(1);
    expect(input.images).toHaveLength(1);
    expect(input.releases).toHaveLength(1);
    expect(input.deals).toHaveLength(1);
    expect(input.soundRecordings[0]!.isrc).toBe('USRC12500001');
    expect(input.releases[0]!.upc).toBe('5060000000016');
  });

  it('preserves contributor roles', async () => {
    const text = await readFile(fixture, 'utf8');
    const xml = buildReleaseMessage(JSON.parse(text)).xml;
    const { input } = parseReleaseMessage(xml);
    expect(input.soundRecordings[0]!.contributors[0]!.role).toBe('Producer');
  });
});
