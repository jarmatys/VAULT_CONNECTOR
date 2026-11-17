// One page of ListObjectsV2 as the S3 API answers it, in XML. Only the fields the source needs are read (key, ETag,
// size, whether more pages follow and the token of the next one); anything else in the document is ignored. Values
// are XML-unescaped; an answer that is not a ListBucketResult is null.
export interface S3ListedObject {
  readonly key: string;
  /** Without the quotes S3 puts around it. */
  readonly etag: string;
  readonly size: number;
}

export interface S3ListPage {
  readonly objects: readonly S3ListedObject[];
  /** The token of the next page, or null on the last one. */
  readonly nextToken: string | null;
}

export function parseListObjectsPage(xml: string): S3ListPage | null {
  if (!/<ListBucketResult[\s>]/.test(xml)) return null;
  const objects: S3ListedObject[] = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const body = match[1] ?? "";
    const key = readTag(body, "Key");
    const etag = readTag(body, "ETag");
    const size = Number(readTag(body, "Size"));
    if (key === null || etag === null || !Number.isSafeInteger(size) || size < 0) return null;
    objects.push({ key, etag: etag.replace(/^"|"$/g, ""), size });
  }
  const isTruncated = readTag(xml, "IsTruncated") === "true";
  const nextToken = isTruncated ? readTag(xml, "NextContinuationToken") : null;
  if (isTruncated && (nextToken === null || nextToken === "")) return null;
  return { objects, nextToken };
}

function readTag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match?.[1] === undefined ? null : unescapeXml(match[1]);
}

function unescapeXml(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    switch (entity) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return String.fromCodePoint(entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    }
  });
}
