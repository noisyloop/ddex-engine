import { describe, expect, it } from 'vitest';
import {
  isValidDate,
  isValidDateTime,
  isValidDuration,
  isValidEan13,
  isValidIcpn,
  isValidIsrc,
  isValidTerritory,
  isValidUpc12,
  normalizeIcpn,
  normalizeIsrc,
  secondsToDuration,
} from '../src/validation/formats.js';

describe('ISRC', () => {
  it('accepts canonical ISRCs and normalizes hyphenated forms', () => {
    expect(isValidIsrc('USRC12500001')).toBe(true);
    expect(isValidIsrc('US-RC1-25-00001')).toBe(true);
    expect(normalizeIsrc('us-rc1-25-00001')).toBe('USRC12500001');
  });

  it('rejects bad ISRCs', () => {
    expect(isValidIsrc('XX-RC1-25-00001')).toBe(true); // valid
    expect(isValidIsrc('U-RC1-25-00001')).toBe(false); // 1-letter country
    expect(isValidIsrc('USRC125000')).toBe(false); // too short
  });
});

describe('UPC / EAN', () => {
  it('validates EAN-13 check digits', () => {
    expect(isValidEan13('5060000000016')).toBe(true);
    expect(isValidEan13('5060000000017')).toBe(false);
  });

  it('accepts 12-digit UPC-A and normalizes to 13-digit ICPN', () => {
    expect(isValidUpc12('012345678905')).toBe(true);
    expect(normalizeIcpn('012345678905')).toBe('0012345678905');
    expect(isValidIcpn('012345678905')).toBe(true);
  });
});

describe('territory codes', () => {
  it('accepts ISO 3166-1 alpha-2 codes and Worldwide', () => {
    expect(isValidTerritory('US')).toBe(true);
    expect(isValidTerritory('GB')).toBe(true);
    expect(isValidTerritory('Worldwide')).toBe(true);
    expect(isValidTerritory('USA')).toBe(false);
    expect(isValidTerritory('XX')).toBe(false);
  });
});

describe('ISO 8601 durations', () => {
  it('accepts standard DDEX durations', () => {
    expect(isValidDuration('PT3M42S')).toBe(true);
    expect(isValidDuration('PT1H')).toBe(true);
    expect(isValidDuration('PT42.5S')).toBe(true);
    expect(isValidDuration('PT')).toBe(false);
    expect(isValidDuration('3M42S')).toBe(false);
  });

  it('converts seconds to canonical duration strings', () => {
    expect(secondsToDuration(0)).toBe('PT0S');
    expect(secondsToDuration(42)).toBe('PT42S');
    expect(secondsToDuration(222)).toBe('PT3M42S');
    expect(secondsToDuration(3661)).toBe('PT1H1M1S');
  });
});

describe('dates', () => {
  it('validates YYYY-MM-DD form', () => {
    expect(isValidDate('2026-06-21')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2026-13-01')).toBe(false);
  });

  it('validates date-time with timezone', () => {
    expect(isValidDateTime('2026-06-21T12:00:00Z')).toBe(true);
    expect(isValidDateTime('2026-06-21T12:00:00+02:00')).toBe(true);
    expect(isValidDateTime('2026-06-21 12:00:00')).toBe(false);
  });
});
