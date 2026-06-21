/**
 * XSD conformance check for built ERN 4.3 output.
 *
 * Loads the vendored DDEX XSDs from `schemas/ddex/` and validates the XML the
 * builder produces from `fixtures/sample-single.json`. Gated behind
 * `pnpm test:conformance` because libxmljs2 needs a native build (prebuilt
 * binary or `node-gyp rebuild`) that isn't always available in CI.
 *
 * The XSD itself is offline: `schemas/ddex/release-notification-43.xsd`
 * imports `../allowed-value-sets.xsd`, so both files live in `schemas/`.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as libxml from 'libxmljs2';
import { buildReleaseMessage } from '../../src/builder/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const xsdPath = resolve(repoRoot, 'schemas/ddex/release-notification-43.xsd');
const fixturePath = resolve(repoRoot, 'fixtures/sample-single.json');

describe('ERN 4.3 XSD conformance', () => {
  it('the fixture builds and validates against release-notification-43.xsd', async () => {
    const xsdSource = await readFile(xsdPath, 'utf8');
    // baseUrl resolves the `../allowed-value-sets.xsd` import relative to the
    // XSD's on-disk location.
    const schema = libxml.parseXml(xsdSource, { baseUrl: xsdPath });

    const inputJson = await readFile(fixturePath, 'utf8');
    const built = buildReleaseMessage(JSON.parse(inputJson)).xml;
    const doc = libxml.parseXml(built);

    const ok = doc.validate(schema);
    if (!ok) {
      const errors = (doc.validationErrors ?? []).map(
        (e) => `  - line ${e.line}: ${e.message?.trim() ?? String(e)}`,
      );
      throw new Error(
        `Built ERN 4.3 XML failed XSD validation:\n${errors.join('\n')}`,
      );
    }
    expect(ok).toBe(true);
  });
});
