/**
 * Namespace and version constants for ERN message construction.
 *
 * ERN 4.3 is the primary target. The 4.x namespaces are version-coded in the
 * URI (".../ern/43", ".../ern/42") which is how a parser sniffs the version
 * from the root element.
 */

export type ErnVersion = '4.3' | '4.2' | '3.8.2';

export interface NamespaceConfig {
  /** Default namespace prefix used throughout the document, e.g. "ern". */
  prefix: string;
  /** The ern namespace URI. */
  ernUri: string;
  /** Value of the MessageSchemaVersionId root attribute. */
  schemaVersionId: string;
}

export const ERN_NAMESPACES: Record<ErnVersion, NamespaceConfig> = {
  '4.3': {
    prefix: 'ern',
    ernUri: 'http://ddex.net/xml/ern/43',
    schemaVersionId: 'ern/43',
  },
  '4.2': {
    prefix: 'ern',
    ernUri: 'http://ddex.net/xml/ern/42',
    schemaVersionId: 'ern/42',
  },
  '3.8.2': {
    prefix: 'ern',
    ernUri: 'http://ddex.net/xml/ern/382',
    schemaVersionId: 'ern/382',
  },
};

/** XML Schema namespace, declared as xs per the roadmap's namespace convention. */
export const XS_NAMESPACE_URI = 'http://www.w3.org/2001/XMLSchema';

/** Root element local name for a New Release notification. */
export const NEW_RELEASE_MESSAGE = 'NewReleaseMessage';

/** Map a namespace URI back to an ERN version (used by the parser). */
export function versionFromNamespace(uri: string): ErnVersion | undefined {
  const match = (Object.entries(ERN_NAMESPACES) as [ErnVersion, NamespaceConfig][]).find(
    ([, cfg]) => cfg.ernUri === uri,
  );
  return match?.[0];
}
