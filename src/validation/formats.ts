/**
 * Shared format predicates and normalizers for DDEX-relevant identifiers.
 *
 * These live in their own module so the Zod schemas (input contract) and the
 * structural validator (post-build / parsed XML) draw from the same rules. If
 * a rule changes, both ends of the pipeline update in lockstep.
 */

import { ISO_3166_1_ALPHA_2 } from './iso-territories.js';

/** Strict ISRC format: CCXXX-YY-NNNNN (12 chars, no dashes in canonical form). */
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;

/** Strip hyphens and uppercase before checking ISRC shape. */
export function normalizeIsrc(value: string): string {
  return value.replace(/-/g, '').toUpperCase();
}

export function isValidIsrc(value: string): boolean {
  return ISRC_RE.test(normalizeIsrc(value));
}

/**
 * EAN-13/UPC check digit. UPC-A is 12 digits but is conventionally padded with
 * a leading zero to fit the 13-digit ICPN slot in DDEX, so we validate the
 * 13-digit form. The check digit is `(10 - sum % 10) % 10` where odd-index
 * (1-based from the left) digits get weight 1 and even-index digits weight 3.
 */
export function isValidEan13(value: string): boolean {
  if (!/^[0-9]{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = value.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === value.charCodeAt(12) - 48;
}

/** UPC-A is a 12-digit barcode. Accept either form on input. */
export function isValidUpc12(value: string): boolean {
  if (!/^[0-9]{12}$/.test(value)) return false;
  return isValidEan13('0' + value);
}

/** Normalize a UPC/EAN identifier to the 13-digit DDEX ICPN form. */
export function normalizeIcpn(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length === 12) return '0' + digits;
  return digits;
}

export function isValidIcpn(value: string): boolean {
  const normalized = normalizeIcpn(value);
  return isValidEan13(normalized);
}

export function isValidTerritory(code: string): boolean {
  // ERN also recognizes "Worldwide" as a TIS territory shorthand.
  if (code === 'Worldwide') return true;
  return ISO_3166_1_ALPHA_2.has(code);
}

/**
 * ISO 8601 duration in the restricted form DDEX uses: PTnHnMnS, where any of
 * the H/M/S components may be omitted but at least one must appear.
 */
const DURATION_RE = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;

export function isValidDuration(value: string): boolean {
  const match = DURATION_RE.exec(value);
  if (!match) return false;
  // Reject "PT" with no components — regex would otherwise allow it.
  return match[1] !== undefined || match[2] !== undefined || match[3] !== undefined;
}

/** Convert a number of seconds into the canonical PTnHnMnS string. */
export function secondsToDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new RangeError(`Invalid duration seconds: ${totalSeconds}`);
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;
  // Drop trailing zeros from fractional seconds while keeping integer S.
  const secondsStr = Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  let out = 'PT';
  if (hours > 0) out += `${hours}H`;
  if (minutes > 0) out += `${minutes}M`;
  if (seconds > 0 || (hours === 0 && minutes === 0)) out += `${secondsStr}S`;
  return out;
}

/** ISO 8601 date (YYYY-MM-DD). */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

/** ISO 8601 date-time used in MessageCreatedDateTime, e.g. 2025-01-15T10:30:00Z. */
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidDateTime(value: string): boolean {
  if (!DATETIME_RE.test(value)) return false;
  const ms = Date.parse(value);
  return !Number.isNaN(ms);
}
