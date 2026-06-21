# CLAUDE.md

## Project: ddex-engine (private)

Private DDEX ERN 4.3 builder and parser for music distribution.
TypeScript/Node.js only. No Rust, no Python, no WASM.

### Architecture

- `src/builder/` — ERN 4.3 XML generation from typed config objects.
  - `index.ts` is the orchestrator. `xml.ts` is a tiny deterministic serializer.
    `references.ts` mints stable `P1`/`A1`/`I1`/`R1` IDs.
- `src/parser/` — DDEX XML → typed `ReleaseMessageInput` for round-trip.
- `src/schemas/` — Zod input contracts. Caller passes one of these in;
  invalid inputs are rejected before any XML is emitted.
- `src/validation/`
  - `formats.ts` — shared ISRC / UPC / territory / duration predicates.
  - `iso-territories.ts` — ISO 3166-1 alpha-2 set.
  - `structural.ts` — post-build / received-message validator. No XSD.
- `src/templates/` — namespace constants and the ERN 4.3 element-ordering map.
- `src/presets/` — partial config objects (e.g. `spotify-single`).
- `src/cli.ts` — `ddex build | validate | inspect` (citty).

### Key Constraints

- Element ordering in output XML must follow ERN 4.3 spec exactly. The
  builder enforces this structurally; the ordering map in
  `templates/ordering.ts` documents intent.
- All party/resource references must use stable ID generation (`P1`, `A1`,
  `I1`, `R1`). The allocator (`ReferenceTable`) assigns them in insertion
  order and never reuses them.
- No external XSD validation — structural validation only.
- Output must be deterministic: same input → byte-identical XML.
- Private repo, never published to npm or any registry.

### Round-trip property

`build(input) → parse → build` must yield byte-identical XML. The parser
emits PartyReferences (`P1`, `A1`...) as the keys for parties / recordings /
images / releases, which lines up with the builder's insertion-order
allocation. Any field that participates in the round-trip must be parseable
back into the schema — see `Image.proprietaryId` for an example of a field
added specifically to preserve round-trip identity.

### Testing

- vitest, run with `pnpm test`.
- Fixtures in `fixtures/` — known-good DDEX JSON inputs.
- Every builder change needs a snapshot test against fixture output.

### Standards Reference

- DDEX ERN 4.3 — https://kb.ddex.net/implementing/electronic-release-notification-message-suite-(ern)/
- ISRC format: `CC-XXX-YY-NNNNN`.
- UPC/EAN: 12 or 13 digits, EAN-13 check digit.
- Territory codes: ISO 3166-1 alpha-2 (plus `Worldwide`).
- Durations: ISO 8601 `PTnHnMnS`.
