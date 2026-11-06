import PostalMime from "postal-mime";

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: ArrayBuffer;
}

export interface ParsedEmail {
  messageId: string | null;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  text: string;
  html: string;
  attachments: ParsedAttachment[];
  sizeBytes: number;
}

const DEFAULT_MAX_ATTACHMENTS = 20;

/**
 * Read a bounded number of bytes from a stream.
 * Throws if stream exceeds maxBytes.
 */
export async function readStreamBounded(
  stream: ReadableStream,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error("PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

function formatAddress(
  addr:
    | { name?: string; address?: string }
    | Array<{ name?: string; address?: string }>
    | undefined,
): string {
  if (!addr) return "";
  const list = Array.isArray(addr) ? addr : [addr];
  return list
    .map((a) => {
      if (a.name && a.address) return `${a.name} <${a.address}>`;
      return a.address || a.name || "";
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Parse raw MIME with PostalMime under size and attachment quotas.
 */
export async function parseMime(
  raw: ArrayBuffer,
  options: {
    maxAttachmentSizeBytes: number;
    maxAttachments?: number;
  },
): Promise<ParsedEmail> {
  const parser = new PostalMime();
  const email = await parser.parse(raw);

  const maxAtt = options.maxAttachments ?? DEFAULT_MAX_ATTACHMENTS;
  const attachments: ParsedAttachment[] = [];

  for (const att of email.attachments ?? []) {
    if (attachments.length >= maxAtt) break;
    const content = att.content;
    let buf: ArrayBuffer;
    if (content instanceof ArrayBuffer) {
      buf = content;
    } else if (ArrayBuffer.isView(content)) {
      buf = content.buffer.slice(
        content.byteOffset,
        content.byteOffset + content.byteLength,
      ) as ArrayBuffer;
    } else if (typeof content === "string") {
      buf = new TextEncoder().encode(content).buffer as ArrayBuffer;
    } else {
      continue;
    }
    if (buf.byteLength > options.maxAttachmentSizeBytes) {
      continue; // skip oversized attachment rather than fail whole message
    }
    attachments.push({
      filename: att.filename || "attachment",
      contentType: att.mimeType || "application/octet-stream",
      size: buf.byteLength,
      content: buf,
    });
  }

  let date: string | null = null;
  const rawDate = email.date as unknown;
  if (rawDate instanceof Date) {
    date = rawDate.toISOString();
  } else if (typeof rawDate === "string") {
    date = rawDate;
  }

  return {
    messageId: email.messageId ?? null,
    from: formatAddress(email.from),
    to: formatAddress(email.to),
    subject: email.subject ?? "",
    date,
    text: email.text ?? "",
    html: email.html ?? "",
    attachments,
    sizeBytes: raw.byteLength,
  };
}
