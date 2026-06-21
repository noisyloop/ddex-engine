/**
 * Stable reference allocator.
 *
 * DDEX uses internal cross-references (P1, A1, R1...) to wire parties to
 * resources to releases to deals. The same caller-supplied key must always map
 * to the same reference ID for a given build, otherwise references go dangling.
 *
 * The allocator is per-build (per ReferenceTable instance) and assigns IDs in
 * insertion order, which keeps output deterministic.
 */

export class ReferenceTable {
  private readonly parties = new Map<string, string>();
  private readonly soundRecordings = new Map<string, string>();
  private readonly images = new Map<string, string>();
  private readonly releases = new Map<string, string>();
  private nextParty = 1;
  private nextAudio = 1;
  private nextImage = 1;
  private nextRelease = 1;

  party(key: string): string {
    let ref = this.parties.get(key);
    if (!ref) {
      ref = `P${this.nextParty++}`;
      this.parties.set(key, ref);
    }
    return ref;
  }

  soundRecording(key: string): string {
    let ref = this.soundRecordings.get(key);
    if (!ref) {
      ref = `A${this.nextAudio++}`;
      this.soundRecordings.set(key, ref);
    }
    return ref;
  }

  image(key: string): string {
    let ref = this.images.get(key);
    if (!ref) {
      ref = `I${this.nextImage++}`;
      this.images.set(key, ref);
    }
    return ref;
  }

  release(key: string): string {
    let ref = this.releases.get(key);
    if (!ref) {
      ref = `R${this.nextRelease++}`;
      this.releases.set(key, ref);
    }
    return ref;
  }

  /** Lookup helpers used by deal/release wiring; throw on dangling references. */
  requirePartyKey(key: string): string {
    const ref = this.parties.get(key);
    if (!ref) throw new Error(`Unknown party key: ${key}`);
    return ref;
  }

  requireSoundRecordingKey(key: string): string {
    const ref = this.soundRecordings.get(key);
    if (!ref) throw new Error(`Unknown sound recording key: ${key}`);
    return ref;
  }

  requireImageKey(key: string): string {
    const ref = this.images.get(key);
    if (!ref) throw new Error(`Unknown image key: ${key}`);
    return ref;
  }

  requireReleaseKey(key: string): string {
    const ref = this.releases.get(key);
    if (!ref) throw new Error(`Unknown release key: ${key}`);
    return ref;
  }
}
