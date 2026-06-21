/**
 * `ddex` CLI entry point.
 *
 * Three commands:
 *   build    — read JSON input, validate it, emit ERN 4.3 XML to file or stdout
 *   validate — structural check on an existing DDEX XML message
 *   inspect  — parse a DDEX message and print a summary of its contents
 */

import { defineCommand, runMain } from 'citty';
import { readFile, writeFile } from 'node:fs/promises';
import { buildReleaseMessage } from './builder/index.js';
import { parseReleaseMessage } from './parser/index.js';
import { validateXml } from './validation/structural.js';
import { applyPreset, presets, type PresetName } from './presets/index.js';

const buildCmd = defineCommand({
  meta: {
    name: 'build',
    description: 'Build ERN 4.3 XML from a JSON release definition.',
  },
  args: {
    input: {
      type: 'positional',
      description: 'Path to the JSON input file.',
      required: true,
    },
    preset: {
      type: 'string',
      description: `Apply a named preset before building. One of: ${Object.keys(presets).join(', ')}.`,
    },
    out: {
      type: 'string',
      description: 'Output file path. If omitted, XML is written to stdout.',
    },
    compact: {
      type: 'boolean',
      description: 'Emit canonical compact XML (no indentation).',
      default: false,
    },
  },
  async run({ args }) {
    const raw = await readJson(args.input);
    const withPreset = args.preset ? applyPreset(raw, args.preset as PresetName) : raw;
    if (args.compact) {
      withPreset.config = { ...(withPreset.config as object | undefined), pretty: false };
    }
    const result = buildReleaseMessage(withPreset);
    if (args.out) {
      await writeFile(args.out, result.xml, 'utf8');
      process.stderr.write(`Wrote ${result.xml.length} bytes to ${args.out}\n`);
    } else {
      process.stdout.write(result.xml);
    }
  },
});

const validateCmd = defineCommand({
  meta: {
    name: 'validate',
    description: 'Validate the structure of a DDEX ERN XML file.',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Path to the XML file to validate.',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Emit the validation report as JSON.',
      default: false,
    },
  },
  async run({ args }) {
    const xml = await readFile(args.file, 'utf8');
    const result = validateXml(xml);
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      formatValidationReport(result, args.file);
    }
    if (!result.ok) process.exitCode = 1;
  },
});

const inspectCmd = defineCommand({
  meta: {
    name: 'inspect',
    description: 'Parse a DDEX message and print a human-readable summary.',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Path to the XML file to inspect.',
      required: true,
    },
    json: {
      type: 'boolean',
      description: 'Emit the parsed input shape as JSON.',
      default: false,
    },
  },
  async run({ args }) {
    const xml = await readFile(args.file, 'utf8');
    const { input, version } = parseReleaseMessage(xml);
    if (args.json) {
      process.stdout.write(JSON.stringify(input, null, 2) + '\n');
      return;
    }
    process.stdout.write(`ERN version:  ${version}\n`);
    process.stdout.write(`Message ID:   ${input.header.messageId}\n`);
    process.stdout.write(`Sender:       ${input.header.sender.partyName} (${input.header.sender.partyId})\n`);
    process.stdout.write(`Recipient:    ${input.header.recipient.partyName} (${input.header.recipient.partyId})\n`);
    process.stdout.write(`Parties:      ${input.parties.length}\n`);
    process.stdout.write(`Recordings:   ${input.soundRecordings.length}\n`);
    process.stdout.write(`Images:       ${input.images.length}\n`);
    process.stdout.write(`Releases:     ${input.releases.length}\n`);
    process.stdout.write(`Deals:        ${input.deals.length}\n`);
    for (const rel of input.releases) {
      process.stdout.write(`  - ${rel.type} "${rel.title}" (${rel.upc}) [${rel.tracks.length} tracks]\n`);
    }
  },
});

const main = defineCommand({
  meta: {
    name: 'ddex',
    version: '0.1.0',
    description: 'Build, validate, and inspect DDEX ERN 4.3 messages.',
  },
  subCommands: {
    build: buildCmd,
    validate: validateCmd,
    inspect: inspectCmd,
  },
});

async function readJson(path: string): Promise<Record<string, unknown>> {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${path}: ${(e as Error).message}`);
  }
}

function formatValidationReport(
  result: { ok: boolean; errors: { path: string; message: string }[]; warnings: { path: string; message: string }[]; version?: string },
  path: string,
): void {
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${result.ok ? 'OK' : 'FAIL'}  ${path}${result.version ? `  (ern/${result.version})` : ''}\n`);
  for (const err of result.errors) {
    stream.write(`  error   ${err.path}  ${err.message}\n`);
  }
  for (const warn of result.warnings) {
    stream.write(`  warn    ${warn.path}  ${warn.message}\n`);
  }
}

runMain(main);
