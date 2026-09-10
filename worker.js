// --- Constants ---
const INBOX_TTL = 3600; // 1 Hour (Seconds)
const MAX_MESSAGES_PER_INBOX = 50;
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
const MAX_NAME_LENGTH = 32;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json"
};

// --- Helpers ---
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function handleOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 3 || name.length > MAX_NAME_LENGTH) return false;
  return /^[a-zA-Z0-9_-]+$/.test(name); // Prevents path traversal & injection
}

// --- Crypto & Security ---
async function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomName() {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token) {
  const buffer = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// --- Minimal MIME Parser (No Dependencies) ---
function parseHeaders(text) {
  const headers = {};
  const lines = text.split(/\r?\n/);
  let currentKey = '';
  for (let line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (currentKey) headers[currentKey] += ' ' + line.trim();
    } else {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        currentKey = line.substring(0, colonIndex).trim().toLowerCase();
        headers[currentKey] = line.substring(colonIndex + 1).trim();
      }
    }
  }
  return headers;
}

function decodeBody(body, encoding) {
  if (!encoding) return body;
  const enc = encoding.toLowerCase();
  if (enc === 'base64') {
    try {
      const binary = atob(body.replace(/\s/g, ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { return body; }
  }
  if (enc === 'quoted-printable') {
    return body.replace(/=\r?\n/g, '').replace(/=([A-F0-9]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body;
}

async function parseMIME(rawStream) {
  try {
    const rawText = await new Response(rawStream).text();
    let splitIndex = rawText.indexOf('\r\n\r\n');
    let headerEndLen = 4;
    if (splitIndex === -1) { splitIndex = rawText.indexOf('\n\n'); headerEndLen = 2; }
    if (splitIndex === -1) return { text: rawText, html: '', subject: '' };

    const headers = parseHeaders(rawText.substring(0, splitIndex));
    const body = rawText.substring(splitIndex + headerEndLen);
    const contentType = headers['content-type'] || '';
    const encoding = headers['content-transfer-encoding'] || '';
    let text = '', html = '';

    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const parts = body.split('--' + boundary);
      for (let part of parts) {
        if (part.trim() === '' || part.trim() === '--') continue;
        let partSplit = part.indexOf('\r\n\r\n');
        let partEndLen = 4;
        if (partSplit === -1) { partSplit = part.indexOf('\n\n'); partEndLen = 2; }
        if (partSplit === -1) continue;

        const partHeaders = parseHeaders(part.substring(0, partSplit));
        const partBody = part.substring(partSplit + partEndLen);
        const partType = (partHeaders['content-type'] || '').toLowerCase();
        const partEnc = partHeaders['content-transfer-encoding'] || '';

        if (partType.includes('text/plain') && !text) text = decodeBody(partBody, partEnc);
        else if (partType.includes('text/html') && !html) html = decodeBody(partBody, partEnc);
      }
    } else {
      if (contentType.includes('text/html')) html = decodeBody(body, encoding);
      else text = decodeBody(body, encoding);
    }
    return { text: text.trim(), html: html.trim(), subject: headers['subject'] || '' };
  } catch (e) {
    return { text: "", html: "", subject: "" };
  }
}

// --- API Handlers ---
async function handleHealth(env) {
  return jsonResponse({ status: "ok", ready: !!(env.KV && env.DOMAIN), service: "temp-mail-api" });
}

async function handleCreateEmail(request, env) {
  if (!env.DOMAIN) return jsonResponse({ success: false, error: "DOMAIN_NOT_CONFIGURED" }, 500);
  let body = {};
  try { body = await request.json(); } catch (e) {}

  let name = body.name || generateRandomName();
  if (!isValidName(name)) return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);

  const inboxKey = `inbox:${name}`;
  if (await env.KV.get(inboxKey)) return jsonResponse({ success: false, error: "NAME_TAKEN" }, 409);

  const token = await generateToken();
  const expiresAtMs = Date.now() + (INBOX_TTL * 1000);

  const inboxData = {
    name, email: `${name}@${env.DOMAIN}`,
    token_hash: await hashToken(token),
    created_at: new Date().toISOString(),
    expires_at: expiresAtMs, messages: []
  };

  await env.KV.put(inboxKey, JSON.stringify(inboxData), { expiration: Math.floor(expiresAtMs / 1000) });
  return jsonResponse({ success: true, email: inboxData.email, token, expires_at: new Date(expiresAtMs).toISOString() }, 201);
}

async function handleCheckEmail(request, env) {
  const name = new URL(request.url).searchParams.get("name");
  if (!isValidName(name)) return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
  return jsonResponse({ available: !(await env.KV.get(`inbox:${name}`)), name });
}

async function handleGetInbox(request, env, name) {
  if (!isValidName(name)) return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
  const inboxStr = await env.KV.get(`inbox:${name}`);
  if (!inboxStr) return jsonResponse({ success: false, error: "INBOX_NOT_FOUND" }, 404);

  const inbox = JSON.parse(inboxStr);
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
  
  const hash = await hashToken(auth.substring(7));
  if (!constantTimeCompare(hash, inbox.token_hash)) return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);

  const messages = [];
  for (const msgId of inbox.messages) {
    const msgStr = await env.KV.get(`message:${name}:${msgId}`);
    if (msgStr) messages.push(JSON.parse(msgStr));
  }
  return jsonResponse({ success: true, email: inbox.email, messages });
}

async function handleDeleteInbox(request, env, name) {
  if (!isValidName(name)) return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
  const inboxStr = await env.KV.get(`inbox:${name}`);
  if (!inboxStr) return jsonResponse({ success: false, error: "INBOX_NOT_FOUND" }, 404);

  const inbox = JSON.parse(inboxStr);
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
  
  const hash = await hashToken(auth.substring(7));
  if (!constantTimeCompare(hash, inbox.token_hash)) return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);

  for (const msgId of inbox.messages) await env.KV.delete(`message:${name}:${msgId}`);
  await env.KV.delete(`inbox:${name}`);
  return jsonResponse({ success: true, deleted: true });
}

// --- Main Export ---
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return handleOptions();
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/health" && request.method === "GET") return await handleHealth(env);
      if (path === "/email" && request.method === "POST") return await handleCreateEmail(request, env);
      if (path === "/email/check" && request.method === "GET") return await handleCheckEmail(request, env);
      
      const match = path.match(/^\/email\/([a-zA-Z0-9_-]+)$/);
      if (match) {
        if (request.method === "GET") return await handleGetInbox(request, env, match[1]);
        if (request.method === "DELETE") return await handleDeleteInbox(request, env, match[1]);
      }
      return jsonResponse({ success: false, error: "NOT_FOUND" }, 404);
    } catch (err) {
      return jsonResponse({ success: false, error: "INTERNAL_ERROR", message: err.message }, 500);
    }
  },

  async email(message, env, ctx) {
    const toAddress = message.to;
    const name = toAddress.split("@")[0];

    if (!isValidName(name)) return message.setReject("Invalid recipient");

    const inboxStr = await env.KV.get(`inbox:${name}`);
    if (!inboxStr) return message.setReject("Inbox not found");

    const inbox = JSON.parse(inboxStr);
    if (inbox.messages.length >= MAX_MESSAGES_PER_INBOX) return message.setReject("Inbox full");

    try {
      const { text, html, subject } = await parseMIME(message.raw);
      const messageId = crypto.randomUUID();
      
      const msgObj = {
        id: messageId, from: message.from, to: toAddress,
        subject: subject || "(No Subject)", date: new Date().toISOString(),
        text: text.slice(0, MAX_MESSAGE_SIZE), html: html.slice(0, MAX_MESSAGE_SIZE)
      };

      const expirationSec = Math.floor(inbox.expires_at / 1000);
      await env.KV.put(`message:${name}:${messageId}`, JSON.stringify(msgObj), { expiration: expirationSec });

      inbox.messages.push(messageId);
      // Crucial: Re-pass expiration to prevent TTL removal on update
      await env.KV.put(`inbox:${name}`, JSON.stringify(inbox), { expiration: expirationSec });
    } catch (e) {
      message.setReject("Parse error");
    }
  }
};
