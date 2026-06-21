import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReleaseMessage } from '../src/builder/index.js';
import { validateXml } from '../src/validation/structural.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, '../fixtures/sample-single.json');

async function buildSample(): Promise<string> {
  const text = await readFile(fixture, 'utf8');
  return buildReleaseMessage(JSON.parse(text)).xml;
}

describe('validateXml', () => {
  it('passes a freshly built message', async () => {
    const xml = await buildSample();
    const result = validateXml(xml);
    expect(result.ok).toBe(true);
    expect(result.version).toBe('4.3');
    expect(result.errors).toHaveLength(0);
  });

  it('flags a non-DDEX root element', () => {
    const result = validateXml('<?xml version="1.0"?><Foo/>');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /NewReleaseMessage/.test(e.message))).toBe(true);
  });

  it('flags malformed XML with a parse error', () => {
    const result = validateXml('<not xml');
    expect(result.ok).toBe(false);
  });

  it('flags a bad ISRC inside an otherwise-valid message', async () => {
    let xml = await buildSample();
    xml = xml.replace('<ISRC>USRC12500001</ISRC>', '<ISRC>NOTANISRC</ISRC>');
    const result = validateXml(xml);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /ISRC/.test(e.message))).toBe(true);
  });

  it('flags an ICPN with bad check digit', async () => {
    let xml = await buildSample();
    xml = xml.replace('<ICPN>5060000000016</ICPN>', '<ICPN>5060000000017</ICPN>');
    const result = validateXml(xml);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /ICPN/.test(e.message))).toBe(true);
  });

  it('flags a dangling release reference in DealList', async () => {
    let xml = await buildSample();
    xml = xml.replace('<DealReleaseReference>R1</DealReleaseReference>', '<DealReleaseReference>R99</DealReleaseReference>');
    const result = validateXml(xml);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /R99/.test(e.message))).toBe(true);
  });

  it('flags an unknown territory code', async () => {
    let xml = await buildSample();
    xml = xml.replace('<TerritoryCode>Worldwide</TerritoryCode>', '<TerritoryCode>ZZ</TerritoryCode>');
    const result = validateXml(xml);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /Territory/.test(e.message))).toBe(true);
  });
});
