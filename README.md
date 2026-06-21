# ddex-engine

Private DDEX ERN 4.3 builder and parser for music distribution infrastructure.
TypeScript/Node only. Ships working XML, not a portfolio piece.

## Quick start

```bash
pnpm install
pnpm build                                                # tsup → dist/
pnpm ddex build fixtures/sample-single.json --out out.xml # build
pnpm ddex validate out.xml                                # structural check
pnpm ddex inspect out.xml                                 # parsed summary
pnpm test                                                 # vitest
```

### XSD conformance (dev-only)

`pnpm test:conformance` validates built fixture output against the vendored
ERN 4.3 XSD in `schemas/ddex/` using `libxmljs2`. It's split out from
`pnpm test` because libxmljs2 ships a native binding (prebuilt for most
platforms; falls back to `node-gyp rebuild`) that some CI images can't
compile. Run it locally before shipping conformance fixes.

## CLI

```
ddex build <input.json> [--preset spotify-single] [--out release.xml] [--compact]
ddex validate <message.xml> [--json]
ddex inspect <message.xml> [--json]
```

## Library

```ts
import { buildReleaseMessage, parseReleaseMessage, validateXml } from 'ddex-engine';

const { xml, references } = buildReleaseMessage(input);
const result = validateXml(xml);   // { ok, errors, warnings, version }
const { input: roundTripped } = parseReleaseMessage(xml);
```

See `src/schemas/index.ts` for the full input contract and `CLAUDE.md` for
architecture notes.

## Roadmap state

- **Phase 0** Scaffolding — done
- **Phase 1** ERN 4.3 builder + Zod schemas + presets — done
- **Phase 2** CLI + structural validation (no XSD) — done
- **Phase 3** Parser with round-trip tests — done
- **Phase 4** Catalog layer — deferred (only build when managing multiple
  releases)
- **Phase 5** Integration points (Cloudflare Worker, SFTP delivery, batch
  generation) — deferred

## License

MIT (see LICENSE).
