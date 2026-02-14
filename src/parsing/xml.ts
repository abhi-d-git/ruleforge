import { XMLParser } from "fast-xml-parser";

/**
 * v1 XML normalization:
 * - repeated tags -> arrays
 * - text nodes flattened
 * - attributes under @
 * - ignore namespaces (strip prefix)
 */
export function parseXmlToObject(xml: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    textNodeName: "#text",
    removeNSPrefix: true,
    // flatten text-only nodes:
    alwaysCreateTextNode: false,
    // Make repeated nodes arrays when needed:
    isArray: (name, jpath, isLeafNode, isAttribute) => false,
  });

  const parsed = parser.parse(xml);

  // NOTE: fast-xml-parser already flattens many leaf nodes to string.
  // For strict determinism we may add a post-walk normalization later.
  return parsed;
}
