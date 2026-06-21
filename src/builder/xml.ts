/**
 * Minimal, deterministic XML serializer.
 *
 * DDEX cares deeply about element ordering, so we model the document as an
 * explicitly ordered tree of nodes and serialize it ourselves. This gives us
 * byte-identical output for identical input — no dependency on a third-party
 * builder's attribute/child ordering heuristics.
 */

export interface XmlElement {
  /** Element/tag name, e.g. "MessageHeader" or "ern:NewReleaseMessage". */
  tag: string;
  /** Attributes in insertion order. Undefined/null values are dropped. */
  attrs?: Record<string, string | number | undefined>;
  /** Child elements, in document order. Mutually exclusive with `text`. */
  children?: XmlNode[];
  /** Leaf text content. Mutually exclusive with `children`. */
  text?: string | number;
}

export type XmlNode = XmlElement;

/** Construct an element node. Falsy `children`/`text` are normalized away. */
export function el(
  tag: string,
  attrs?: Record<string, string | number | undefined>,
  childrenOrText?: XmlNode[] | string | number,
): XmlElement {
  const node: XmlElement = { tag };
  if (attrs && Object.keys(attrs).length > 0) node.attrs = attrs;
  if (Array.isArray(childrenOrText)) {
    node.children = childrenOrText;
  } else if (childrenOrText !== undefined) {
    node.text = childrenOrText;
  }
  return node;
}

/** A text-only element, e.g. `<TitleText>Hello</TitleText>`. */
export function leaf(tag: string, text: string | number): XmlElement {
  return { tag, text };
}

/** Drop undefined entries from a child list (helper for conditional elements). */
export function compact(children: Array<XmlNode | undefined | null | false>): XmlNode[] {
  return children.filter((c): c is XmlNode => Boolean(c));
}

const ESCAPE_TEXT: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

const ESCAPE_ATTR: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeText(value: string | number): string {
  return String(value).replace(/[&<>]/g, (c) => ESCAPE_TEXT[c]!);
}

function escapeAttr(value: string | number): string {
  return String(value).replace(/[&<>"]/g, (c) => ESCAPE_ATTR[c]!);
}

function renderAttrs(attrs: XmlElement['attrs']): string {
  if (!attrs) return '';
  let out = '';
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    out += ` ${key}="${escapeAttr(value)}"`;
  }
  return out;
}

export interface SerializeOptions {
  /** Pretty-print with indentation. When false, output is compact (canonical). */
  pretty?: boolean;
  /** Indent string per depth level (only used when pretty). */
  indent?: string;
  /** Emit the `<?xml ... ?>` declaration. */
  declaration?: boolean;
}

function renderNode(node: XmlElement, depth: number, pretty: boolean, indent: string): string {
  const pad = pretty ? indent.repeat(depth) : '';
  const open = `${pad}<${node.tag}${renderAttrs(node.attrs)}`;

  const hasChildren = node.children && node.children.length > 0;
  const hasText = node.text !== undefined;

  if (!hasChildren && !hasText) {
    return `${open}/>`;
  }

  if (hasText && !hasChildren) {
    return `${open}>${escapeText(node.text!)}</${node.tag}>`;
  }

  const nl = pretty ? '\n' : '';
  const inner = node
    .children!.map((child) => renderNode(child, depth + 1, pretty, indent))
    .join(nl);
  return `${open}>${nl}${inner}${nl}${pad}</${node.tag}>`;
}

/** Serialize a root element to an XML string. Deterministic for a given input. */
export function serialize(root: XmlElement, options: SerializeOptions = {}): string {
  const pretty = options.pretty ?? true;
  const indent = options.indent ?? '  ';
  const declaration = options.declaration ?? true;

  const body = renderNode(root, 0, pretty, indent);
  const decl = declaration ? `<?xml version="1.0" encoding="UTF-8"?>${pretty ? '\n' : ''}` : '';
  return `${decl}${body}${pretty ? '\n' : ''}`;
}
