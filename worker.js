// worker.js
// TempMail Infrastructure - Secure Single File Worker

const INBOX_TTL = 3600;
const MAX_MESSAGES_PER_INBOX = 50;
const MAX_MESSAGE_SIZE = 1024 * 1024;
const MAX_NAME_LENGTH = 32;
const SESSION_TTL = 43200; // 12 Hours
const LOGIN_RATE_LIMIT_WINDOW = 600; // 10 Minutes
const LOGIN_RATE_LIMIT_MAX = 5;

// --- HELPERS ---

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...extraHeaders
        }
    });
}

function htmlResponse(html, status = 200) {
    return new Response(html, {
        status,
        headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer"
        }
    });
}

function isValidName(name) {
    if (!name || typeof name !== "string") return false;
    if (name.length < 3 || name.length > MAX_NAME_LENGTH) return false;
    return /^[a-zA-Z0-9_-]+$/.test(name);
}

async function generateToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

function generateRandomName() {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token) {
    const buffer = new TextEncoder().encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeCompare(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}

function getCookieValue(cookieHeader, name) {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(";");
    for (const part of parts) {
        const trimmed = part.trim();
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0 && trimmed.slice(0, eqIndex) === name) {
            return decodeURIComponent(trimmed.slice(eqIndex + 1));
        }
    }
    return null;
}

function getClientIp(request) {
    return (
        request.headers.get("CF-Connecting-IP") ||
        (request.cf && request.cf.connectingIp) ||
        "unknown"
    );
}

function getBearerToken(request) {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return null;
    return auth.slice(7).trim();
}

function parseHeaders(text) {
    const headers = {};
    const lines = text.split(/\r?\n/);
    let currentKey = "";

    for (const line of lines) {
        if (line.startsWith(" ") || line.startsWith("\t")) {
            if (currentKey) headers[currentKey] += " " + line.trim();
        } else {
            const colonIndex = line.indexOf(":");
            if (colonIndex > 0) {
                currentKey = line.substring(0, colonIndex).trim().toLowerCase();
                headers[currentKey] = line.substring(colonIndex + 1).trim();
            } else {
                currentKey = "";
            }
        }
    }

    return headers;
}

function decodeBody(body, encoding) {
    if (!encoding) return body;
    const enc = encoding.toLowerCase();

    if (enc === "base64") {
        try {
            const binary = atob(body.replace(/\s/g, ""));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder("utf-8").decode(bytes);
        } catch (e) {
            return body;
        }
    }

    if (enc === "quoted-printable") {
        return body
        .replace(/=\r?\n/g, "")
        .replace(/=([A-F0-9]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
    }

    return body;
}

async function parseMIME(rawStream) {
    try {
        const rawText = await new Response(rawStream).text();

        let splitIndex = rawText.indexOf("\r\n\r\n");
        let headerEndLen = 4;

        if (splitIndex === -1) {
            splitIndex = rawText.indexOf("\n\n");
            headerEndLen = 2;
        }

        if (splitIndex === -1) {
            return { text: rawText, html: "", subject: "" };
        }

        const headers = parseHeaders(rawText.substring(0, splitIndex));
        const body = rawText.substring(splitIndex + headerEndLen);
        const contentType = headers["content-type"] || "";
        const encoding = headers["content-transfer-encoding"] || "";

        let text = "";
        let html = "";

        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (boundaryMatch) {
            const boundary = boundaryMatch[1] || boundaryMatch[2];
            const parts = body.split("--" + boundary);

            for (let part of parts) {
                if (part.trim() === "" || part.trim() === "--") continue;

                let partSplit = part.indexOf("\r\n\r\n");
                let partEndLen = 4;

                if (partSplit === -1) {
                    partSplit = part.indexOf("\n\n");
                    partEndLen = 2;
                }

                if (partSplit === -1) continue;

                const partHeaders = parseHeaders(part.substring(0, partSplit));
                const partBody = part.substring(partSplit + partEndLen);
                const partType = (partHeaders["content-type"] || "").toLowerCase();
                const partEnc = partHeaders["content-transfer-encoding"] || "";

                if (partType.includes("text/plain") && !text) {
                    text = decodeBody(partBody, partEnc);
                } else if (partType.includes("text/html") && !html) {
                    html = decodeBody(partBody, partEnc);
                }
            }
        } else {
            if (contentType.includes("text/html")) {
                html = decodeBody(body, encoding);
            } else {
                text = decodeBody(body, encoding);
            }
        }

        return {
            text: text.trim(),
            html: html.trim(),
            subject: headers["subject"] || ""
        };
    } catch (e) {
        return { text: "", html: "", subject: "" };
    }
}

// --- LOGIN RATE LIMIT ---

async function isLoginBlocked(env, ip) {
    try {
        if (!env.KV) return false;
        const raw = await env.KV.get(`login-fail:${ip}`);
        if (!raw) return false;

        const data = JSON.parse(raw);
        if (!data || typeof data.count !== "number") return false;
        if (data.expires_at && Date.now() > data.expires_at) return false;

        return data.count >= LOGIN_RATE_LIMIT_MAX;
    } catch (e) {
        return false;
    }
}

async function recordLoginFailure(env, ip) {
    try {
        if (!env.KV) return;

        const key = `login-fail:${ip}`;
        let count = 0;
        let expiresAt = Date.now() + LOGIN_RATE_LIMIT_WINDOW * 1000;
        let ttl = LOGIN_RATE_LIMIT_WINDOW;

        const raw = await env.KV.get(key);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                if (data && typeof data.count === "number" && data.expires_at && data.expires_at > Date.now()) {
                    count = data.count;
                    expiresAt = data.expires_at;
                    ttl = Math.max(60, Math.ceil((expiresAt - Date.now()) / 1000));
                }
            } catch (e) {}
        }

        count += 1;

        await env.KV.put(
            key,
            JSON.stringify({ count, expires_at: expiresAt }),
                         { expirationTtl: ttl }
        );
    } catch (e) {}
}

async function clearLoginFailures(env, ip) {
    try {
        if (!env.KV) return;
        await env.KV.delete(`login-fail:${ip}`);
    } catch (e) {}
}

// --- SESSION MANAGEMENT ---

async function createSession(env) {
    const sessionId = await generateToken();
    const expiresAtMs = Date.now() + SESSION_TTL * 1000;
    const sessionData = {
        created_at: new Date().toISOString(),
        expires_at: expiresAtMs
    };

    await env.KV.put(`session:${sessionId}`, JSON.stringify(sessionData), {
        expirationTtl: SESSION_TTL
    });

    return sessionId;
}

async function validateSession(request, env) {
    try {
        if (!env.KV) return false;

        const cookieHeader = request.headers.get("Cookie");
        const sessionId = getCookieValue(cookieHeader, "__Host-session");
        if (!sessionId) return false;

        const sessionStr = await env.KV.get(`session:${sessionId}`);
        if (!sessionStr) return false;

        const session = JSON.parse(sessionStr);
        if (!session || !session.expires_at) return false;

        if (Date.now() > session.expires_at) {
            await env.KV.delete(`session:${sessionId}`);
            return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

async function deleteSession(request, env) {
    try {
        if (!env.KV) return;

        const cookieHeader = request.headers.get("Cookie");
        const sessionId = getCookieValue(cookieHeader, "__Host-session");
        if (sessionId) await env.KV.delete(`session:${sessionId}`);
    } catch (e) {}
}

async function requireAuth(request, env, handler) {
    const isValid = await validateSession(request, env);

    if (!isValid) {
        const acceptsJson =
        request.headers.get("Accept")?.includes("application/json") ||
        request.headers.get("X-Requested-With") === "XMLHttpRequest";

        if (acceptsJson) {
            return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
        }

        return Response.redirect(new URL("/", request.url), 302);
    }

    return handler();
}

// --- API HANDLERS ---

async function handleHealth(env) {
    return jsonResponse({
        status: "ok",
        ready: true,
        service: "temp-mail-api"
    });
}

async function handleCreateEmail(request, env) {
    if (!env.KV || !env.DOMAIN) {
        return jsonResponse({ success: false, error: "SERVICE_UNAVAILABLE" }, 500);
    }

    let body = {};
    try {
        body = await request.json();
    } catch (e) {
        body = {};
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        body = {};
    }

    const requestedName = typeof body.name === "string" ? body.name.trim() : "";

    if (requestedName && !isValidName(requestedName)) {
        return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
    }

    for (let attempt = 0; attempt < 5; attempt++) {
        const name = requestedName || generateRandomName();

        if (!isValidName(name)) {
            return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
        }

        const inboxKey = `inbox:${name}`;

        if (await env.KV.get(inboxKey)) {
            if (!requestedName && attempt < 4) continue;
            return jsonResponse({ success: false, error: "NAME_TAKEN" }, 409);
        }

        const token = await generateToken();
        const tokenHash = await hashToken(token);
        const expiresAtMs = Date.now() + INBOX_TTL * 1000;

        const inboxData = {
            name,
            email: `${name}@${env.DOMAIN}`,
            token_hash: tokenHash,
            created_at: new Date().toISOString(),
            expires_at: expiresAtMs,
            messages: []
        };

        await env.KV.put(inboxKey, JSON.stringify(inboxData), {
            expirationTtl: INBOX_TTL
        });

        // Best-effort collision check. Cloudflare KV does not provide a native atomic create.
        const written = await env.KV.get(inboxKey);
        if (written) {
            try {
                const check = JSON.parse(written);
                if (check.token_hash !== tokenHash) {
                    if (!requestedName && attempt < 4) continue;
                    return jsonResponse({ success: false, error: "NAME_TAKEN" }, 409);
                }
            } catch (e) {}
        }

        return jsonResponse(
            {
                success: true,
                email: inboxData.email,
                token,
                expires_at: new Date(expiresAtMs).toISOString()
            },
            201
        );
    }

    return jsonResponse({ success: false, error: "NAME_TAKEN" }, 409);
}

async function handleCheckEmail(request, env) {
    if (!env.KV) {
        return jsonResponse({ success: false, error: "SERVICE_UNAVAILABLE" }, 500);
    }

    const name = new URL(request.url).searchParams.get("name");
    if (!isValidName(name)) {
        return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
    }

    return jsonResponse({
        available: !(await env.KV.get(`inbox:${name}`)),
                        name
    });
}

async function handleGetInbox(request, env, name) {
    if (!env.KV) {
        return jsonResponse({ success: false, error: "SERVICE_UNAVAILABLE" }, 500);
    }

    if (!isValidName(name)) {
        return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
    }

    const inboxStr = await env.KV.get(`inbox:${name}`);
    if (!inboxStr) {
        return jsonResponse({ success: false, error: "INBOX_NOT_FOUND" }, 404);
    }

    const inbox = JSON.parse(inboxStr);
    const token = getBearerToken(request);

    if (!token) {
        return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
    }

    const hash = await hashToken(token);
    if (!constantTimeCompare(hash, inbox.token_hash || "")) {
        return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
    }

    const messages = [];
    for (const msgId of inbox.messages || []) {
        const msgStr = await env.KV.get(`message:${name}:${msgId}`);
        if (msgStr) {
            try {
                messages.push(JSON.parse(msgStr));
            } catch (e) {}
        }
    }

    return jsonResponse({
        success: true,
        email: inbox.email,
        messages,
        expires_at: new Date(inbox.expires_at).toISOString()
    });
}

async function handleDeleteInbox(request, env, name) {
    if (!env.KV) {
        return jsonResponse({ success: false, error: "SERVICE_UNAVAILABLE" }, 500);
    }

    if (!isValidName(name)) {
        return jsonResponse({ success: false, error: "INVALID_NAME" }, 400);
    }

    const inboxStr = await env.KV.get(`inbox:${name}`);
    if (!inboxStr) {
        return jsonResponse({ success: false, error: "INBOX_NOT_FOUND" }, 404);
    }

    const inbox = JSON.parse(inboxStr);
    const token = getBearerToken(request);

    if (!token) {
        return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
    }

    const hash = await hashToken(token);
    if (!constantTimeCompare(hash, inbox.token_hash || "")) {
        return jsonResponse({ success: false, error: "UNAUTHORIZED" }, 401);
    }

    for (const msgId of inbox.messages || []) {
        await env.KV.delete(`message:${name}:${msgId}`);
    }

    await env.KV.delete(`inbox:${name}`);

    return jsonResponse({ success: true, deleted: true });
}

async function handleLogin(request, env) {
    if (!env.KV) {
        return jsonResponse({ success: false, error: "INTERNAL_ERROR" }, 500);
    }

    const ip = getClientIp(request);

    if (await isLoginBlocked(env, ip)) {
        return jsonResponse({ success: false, error: "TOO_MANY_ATTEMPTS" }, 429);
    }

    let body = {};
    try {
        body = await request.json();
    } catch (e) {
        await recordLoginFailure(env, ip);
        return jsonResponse({ success: false, error: "INVALID_REQUEST" }, 400);
    }

    if (!body || typeof body.password !== "string") {
        await recordLoginFailure(env, ip);
        return jsonResponse({ success: false, error: "INVALID_CREDENTIALS" }, 401);
    }

    if (!env.PANEL_PASSWORD) {
        await recordLoginFailure(env, ip);
        return jsonResponse({ success: false, error: "INTERNAL_ERROR" }, 500);
    }

    const encoder = new TextEncoder();

    const pwdHash = await crypto.subtle.digest("SHA-256", encoder.encode(body.password));
    const envPwdHash = await crypto.subtle.digest("SHA-256", encoder.encode(env.PANEL_PASSWORD));

    const a = Array.from(new Uint8Array(pwdHash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
    const b = Array.from(new Uint8Array(envPwdHash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

    if (!constantTimeCompare(a, b)) {
        await recordLoginFailure(env, ip);
        return jsonResponse({ success: false, error: "INVALID_CREDENTIALS" }, 401);
    }

    await clearLoginFailures(env, ip);

    const sessionId = await createSession(env);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append(
        "Set-Cookie",
        `__Host-session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`
    );

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers
    });
}

async function handleLogout(request, env) {
    await deleteSession(request, env);

    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append(
        "Set-Cookie",
        "__Host-session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
    );

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers
    });
}

// --- HTML TEMPLATES ---

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TempMail - Login</title>
<style>
:root {
    --bg: #050706;
    --surface: rgba(18, 24, 20, 0.7);
    --border: rgba(0, 255, 136, 0.15);
    --neon: #00ff88;
    --text: #e6ebe8;
    --danger: #ff4d4d;
    --blur: 20px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-image: radial-gradient(circle at 50% 50%, rgba(0, 255, 136, 0.05) 0%, transparent 60%);
}
.glass-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 48px;
    backdrop-filter: blur(var(--blur));
    width: 100%;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
}
h1 { font-size: 32px; margin-bottom: 8px; letter-spacing: 2px; }
.subtitle { color: #8b9b92; margin-bottom: 32px; font-size: 14px; }
.input-group { position: relative; margin-bottom: 24px; }
.input {
    width: 100%;
    padding: 16px;
    background: rgba(0,0,0,0.3);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text);
    font-size: 16px;
    outline: none;
    transition: 0.2s;
    text-align: center;
    letter-spacing: 2px;
}
.input:focus { border-color: var(--neon); box-shadow: 0 0 0 4px rgba(0,255,136,0.1); }
.btn {
    width: 100%;
    padding: 16px;
    background: var(--neon);
    color: #050706;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.2s;
    letter-spacing: 1px;
}
.btn:hover { box-shadow: 0 0 20px rgba(0,255,136,0.4); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: var(--danger); font-size: 14px; margin-top: 16px; min-height: 20px; }
.toggle-pwd {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #8b9b92;
    cursor: pointer;
    padding: 4px;
}
</style>
</head>
<body>
<div class="glass-card">
<h1>TempMail</h1>
<p class="subtitle">Private Inbox Infrastructure</p>
<form id="loginForm">
<div class="input-group">
<input type="password" id="password" class="input" placeholder="••••••••" required autocomplete="current-password">
<button type="button" class="toggle-pwd" id="togglePwd" aria-label="Toggle password">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
<circle cx="12" cy="12" r="3"></circle>
</svg>
</button>
</div>
<button type="submit" class="btn" id="loginBtn">Login</button>
<p class="error" id="errorMsg"></p>
</form>
</div>
<script>
const form = document.getElementById('loginForm');
const pwdInput = document.getElementById('password');
const toggleBtn = document.getElementById('togglePwd');
const btn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');

toggleBtn.addEventListener('click', () => {
    pwdInput.type = pwdInput.type === 'password' ? 'text' : 'password';
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Authenticating...';
    errorMsg.textContent = '';

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ password: pwdInput.value })
        });

        const data = await res.json();

        if (data.success) {
            window.location.href = '/app';
        } else if (data.error === 'TOO_MANY_ATTEMPTS') {
            errorMsg.textContent = 'Too many attempts. Please try again later.';
        } else {
            errorMsg.textContent = 'Invalid password';
        }
    } catch (err) {
        errorMsg.textContent = 'Network error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Login';
    }
});
</script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TempMail - Dashboard</title>
<style>
:root {
    --bg: #050706;
    --surface: rgba(18, 24, 20, 0.7);
    --surface-hover: rgba(25, 35, 30, 0.8);
    --border: rgba(0, 255, 136, 0.15);
    --neon: #00ff88;
    --neon-dim: rgba(0, 255, 136, 0.4);
    --text: #e6ebe8;
    --text-dim: #8b9b92;
    --danger: #ff4d4d;
    --radius: 16px;
    --blur: 20px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    overflow: hidden;
    background-image:
    radial-gradient(circle at 10% 20%, rgba(0, 255, 136, 0.03) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(0, 255, 136, 0.02) 0%, transparent 40%);
}
.sidebar {
    width: 260px;
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 24px 16px;
    z-index: 10;
}
.logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px 24px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
}
.logo-text { font-size: 20px; font-weight: 700; letter-spacing: 1px; color: var(--neon); }
.nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    color: var(--text-dim);
    text-decoration: none;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 8px;
}
.nav-item:hover { background: var(--surface-hover); color: var(--text); }
.nav-item.active { background: rgba(0, 255, 136, 0.1); color: var(--neon); border: 1px solid var(--border); }
.sidebar-footer { margin-top: auto; padding-top: 24px; border-top: 1px solid var(--border); }
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.topbar {
    height: 72px;
    padding: 0 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(10, 15, 12, 0.5);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
}
.topbar-left, .topbar-right { display: flex; align-items: center; gap: 16px; }
.status-badge { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-dim); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--neon); box-shadow: 0 0 8px var(--neon); }
.content { flex: 1; overflow-y: auto; padding: 32px; }
.card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    backdrop-filter: blur(var(--blur));
    margin-bottom: 24px;
}
.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
}
.card-title { font-size: 18px; font-weight: 600; }
.btn {
    padding: 10px 20px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
}
.btn:hover { background: var(--surface-hover); border-color: var(--neon-dim); }
.btn-primary { background: var(--neon); color: #050706; border: none; font-weight: 700; }
.btn-primary:hover { background: #33ff99; box-shadow: 0 0 15px var(--neon-dim); }
.btn-danger { border-color: var(--danger); color: var(--danger); }
.btn-danger:hover { background: rgba(255, 77, 77, 0.1); }
.btn-icon {
    width: 36px;
    height: 36px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
}
.input {
    width: 100%;
    padding: 12px 16px;
    background: rgba(0,0,0,0.2);
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text);
    font-size: 15px;
    outline: none;
    transition: border 0.2s;
}
.input:focus { border-color: var(--neon); box-shadow: 0 0 0 2px rgba(0,255,136,0.1); }
.inbox-email {
    font-family: monospace;
    font-size: 24px;
    color: var(--neon);
    letter-spacing: 1px;
    margin: 10px 0;
    word-break: break-all;
}
.countdown {
    font-size: 14px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: monospace;
    font-size: 18px;
    color: var(--neon);
}
.msg-list { display: flex; flex-direction: column; gap: 12px; }
.msg-item {
    padding: 16px;
    background: rgba(0,0,0,0.15);
    border: 1px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
}
.msg-item:hover { border-color: var(--border); background: rgba(0,255,136,0.03); }
.msg-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    flex-wrap: wrap;
    gap: 8px;
}
.msg-from { font-weight: 600; font-size: 14px; }
.msg-date { font-size: 12px; color: var(--text-dim); }
.msg-subject { font-size: 15px; margin-bottom: 4px; }
.msg-preview {
    font-size: 13px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
}
.modal-overlay.active { opacity: 1; pointer-events: auto; }
.modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    backdrop-filter: blur(var(--blur));
}
.modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.modal-body { padding: 24px; overflow-y: auto; flex: 1; }
.tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.tab {
    padding: 10px 0;
    cursor: pointer;
    color: var(--text-dim);
    border-bottom: 2px solid transparent;
    font-weight: 500;
}
.tab.active { color: var(--neon); border-bottom-color: var(--neon); }
.toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 200;
    pointer-events: none;
}
.toast {
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 14px 20px;
    border-radius: 12px;
    backdrop-filter: blur(var(--blur));
    min-width: 250px;
    animation: slideIn 0.3s ease;
    pointer-events: auto;
    transition: opacity 0.3s;
}
.toast.success { border-left: 4px solid var(--neon); }
.toast.error { border-left: 4px solid var(--danger); }
@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
.token-display {
    font-family: monospace;
    letter-spacing: 2px;
    background: rgba(0,0,0,0.3);
    padding: 12px;
    border-radius: 8px;
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    word-break: break-all;
}
.empty-state { text-align: center; padding: 40px; color: var(--text-dim); }
@media (max-width: 768px) {
    .sidebar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        width: 100%;
        height: auto;
        flex-direction: row;
        padding: 12px;
        border-right: none;
        border-top: 1px solid var(--border);
        justify-content: space-around;
        z-index: 50;
        background: rgba(10,15,12,0.95);
    }
    .logo, .sidebar-footer, .nav-text { display: none; }
    .nav-item { flex-direction: column; gap: 4px; font-size: 10px; margin: 0; padding: 8px; }
    .main { padding-bottom: 80px; }
    .topbar { padding: 0 16px; }
    .content { padding: 16px; }
    .btn { padding: 8px 12px; font-size: 12px; }
    .inbox-email { font-size: 18px; }
}
</style>
</head>
<body>
<aside class="sidebar">
<div class="logo">
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--neon)">
<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
</svg>
<span class="logo-text">TempMail</span>
</div>
<nav class="nav-menu" style="flex:1">
<div class="nav-item active" data-view="dashboard">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<rect x="3" y="3" width="7" height="7"></rect>
<rect x="14" y="3" width="7" height="7"></rect>
<rect x="14" y="14" width="7" height="7"></rect>
<rect x="3" y="14" width="7" height="7"></rect>
</svg>
<span class="nav-text">Dashboard</span>
</div>
<div class="nav-item" data-view="create">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<line x1="12" y1="5" x2="12" y2="19"></line>
<line x1="5" y1="12" x2="19" y2="12"></line>
</svg>
<span class="nav-text">Create Inbox</span>
</div>
</nav>
<div class="sidebar-footer">
<div class="nav-item" id="logoutBtn">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
<polyline points="16 17 21 12 16 7"></polyline>
<line x1="21" y1="12" x2="9" y2="12"></line>
</svg>
<span class="nav-text">Logout</span>
</div>
</div>
</aside>

<main class="main">
<header class="topbar">
<div class="topbar-left">
<div class="status-badge">
<div class="status-dot" id="health-dot"></div>
<span id="health-text">Checking...</span>
</div>
</div>
<div class="topbar-right">
<select id="autoRefresh" class="input" style="width:auto;padding:8px 12px;">
<option value="0">Auto: OFF</option>
<option value="5000">5s</option>
<option value="10000">10s</option>
<option value="30000">30s</option>
<option value="60000">60s</option>
</select>
<button class="btn btn-icon" id="refreshBtn" title="Refresh">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<polyline points="23 4 23 10 17 10"></polyline>
<polyline points="1 20 1 14 7 14"></polyline>
<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
</svg>
</button>
</div>
</header>
<div class="content" id="mainContent"></div>
</main>

<div class="modal-overlay" id="msgModal">
<div class="modal">
<div class="modal-header">
<h3 id="msgSubject">Subject</h3>
<button class="btn btn-icon" id="closeMsgBtn">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<line x1="18" y1="6" x2="6" y2="18"></line>
<line x1="6" y1="6" x2="18" y2="18"></line>
</svg>
</button>
</div>
<div class="modal-body">
<div id="msgMeta" style="margin-bottom:16px;font-size:14px;color:var(--text-dim);"></div>
<div class="tabs">
<div class="tab active" data-tab="text">Text</div>
<div class="tab" data-tab="html">HTML</div>
</div>
<div id="msgContent" class="msg-view-area"></div>
</div>
</div>
</div>

<div class="modal-overlay" id="deleteModal">
<div class="modal" style="max-width:400px;">
<div class="modal-header">
<h3>Delete Inbox?</h3>
<button class="btn btn-icon" id="closeDeleteBtn">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
<line x1="18" y1="6" x2="6" y2="18"></line>
<line x1="6" y1="6" x2="18" y2="18"></line>
</svg>
</button>
</div>
<div class="modal-body">
<p>All messages will be permanently deleted. This action cannot be undone.</p>
<div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end;">
<button class="btn" id="cancelDeleteBtn">Cancel</button>
<button class="btn btn-danger" id="confirmDeleteBtn">Delete Permanently</button>
</div>
</div>
</div>
</div>

<div class="toast-container" id="toasts"></div>

<script>
var state = {
    inbox: null,
    health: 'unknown',
    autoRefreshTimer: null,
    currentMsg: null
};

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
}

function toast(message, type) {
    var container = $('#toasts');
    if (!container) return;

    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    el.textContent = message;
    container.appendChild(el);

    setTimeout(function() {
        el.style.opacity = '0';
        setTimeout(function() {
            el.remove();
        }, 300);
    }, 3000);
}

function escapeHtml(value) {
    if (!value) return '';
    return String(value).replace(/[&<>"']/g, function(ch) {
        if (ch === '&') return '&amp;';
        if (ch === '<') return '&lt;';
        if (ch === '>') return '&gt;';
        if (ch === '"') return '&quot;';
        return '&#39;';
    });
}

function formatDate(value) {
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function maskToken(token) {
    if (!token) return '';
    if (token.length <= 8) return token;
    return token.slice(0, 4) + '•'.repeat(Math.max(0, token.length - 8)) + token.slice(-4);
}

async function api(url, options) {
    options = options || {};

    var method = options.method || 'GET';
    var headers = {};

    if (options.headers) {
        for (var key in options.headers) {
            if (Object.prototype.hasOwnProperty.call(options.headers, key)) {
                headers[key] = options.headers[key];
            }
        }
    }

    if (
        state.inbox &&
        state.inbox.token &&
        url.indexOf('/email/') === 0 &&
        url.indexOf('/email/check') !== 0
    ) {
        headers['Authorization'] = 'Bearer ' + state.inbox.token;
    }

    headers['Accept'] = 'application/json';
    headers['X-Requested-With'] = 'XMLHttpRequest';

    var fetchOptions = {
        method: method,
        headers: headers
    };

    if (options.body !== undefined) {
        fetchOptions.body = options.body;
    }

    var res = await fetch(url, fetchOptions);
    var data = {};

    try {
        data = await res.json();
    } catch (e) {}

    if (!res.ok) {
        if (res.status === 401 && url.indexOf('/email/') !== 0 && url.indexOf('/auth/') !== 0) {
            toast('Session expired', 'error');
            setTimeout(function() {
                window.location.href = '/';
            }, 800);
        }

        throw new Error((data && data.error) ? data.error : 'Request failed');
    }

    return data;
}

async function checkHealth() {
    try {
        var data = await api('/health');
        state.health = data.ready ? 'online' : 'offline';
    } catch (e) {
        state.health = 'offline';
    }
    updateHealthUI();
}

function updateHealthUI() {
    var dot = $('#health-dot');
    var text = $('#health-text');
    if (!dot || !text) return;

    if (state.health === 'online') {
        dot.style.background = 'var(--neon)';
        dot.style.boxShadow = '0 0 8px var(--neon)';
        text.textContent = 'API Online';
    } else {
        dot.style.background = 'var(--danger)';
        dot.style.boxShadow = '0 0 8px var(--danger)';
        text.textContent = 'API Offline';
    }
}

function copyText(text) {
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
        .then(function() {
            toast('Copied to clipboard');
        })
        .catch(function() {
            toast('Copy failed', 'error');
        });
    } else {
        toast('Copy not available', 'error');
    }
}

function setAutoRefresh(value) {
    if (state.autoRefreshTimer) {
        clearInterval(state.autoRefreshTimer);
        state.autoRefreshTimer = null;
    }

    var ms = parseInt(value, 10);
    if (ms > 0) {
        state.autoRefreshTimer = setInterval(function() {
            fetchInbox();
        }, ms);
    }
}

function renderMessages(filter) {
    var list = $('#msgList');
    if (!list) return;

    if (!state.inbox || !Array.isArray(state.inbox.messages) || state.inbox.messages.length === 0) {
        list.innerHTML = '<p class="empty-state">No messages yet.</p>';
        return;
    }

    var msgs = state.inbox.messages.slice();
    var q = (filter || '').toLowerCase();

    if (q) {
        msgs = msgs.filter(function(m) {
            return (m.from || '').toLowerCase().indexOf(q) !== -1 ||
            (m.subject || '').toLowerCase().indexOf(q) !== -1 ||
            (m.text || '').toLowerCase().indexOf(q) !== -1;
        });
    }

    if (msgs.length === 0) {
        list.innerHTML = '<p class="empty-state">No messages found.</p>';
        return;
    }

    msgs.sort(function(a, b) {
        return new Date(b.date || 0) - new Date(a.date || 0);
    });

    var html = msgs.map(function(m) {
        var preview = m.text ? m.text.substring(0, 100) : '(No text preview)';

        return '<div class="msg-item" data-id="' + escapeHtml(m.id) + '">' +
        '<div class="msg-header">' +
        '<span class="msg-from">' + escapeHtml(m.from) + '</span>' +
        '<span class="msg-date">' + escapeHtml(formatDate(m.date)) + '</span>' +
        '</div>' +
        '<div class="msg-subject">' + escapeHtml(m.subject) + '</div>' +
        '<div class="msg-preview">' + escapeHtml(preview) + '</div>' +
        '</div>';
    }).join('');

    list.innerHTML = html;
}

function filterMessages() {
    var el = $('#searchInput');
    renderMessages(el ? el.value : '');
}

function updateCountdown() {
    if (!state.inbox) return;

    var el = $('#countdownTimer');
    if (!el) return;

    var diff = new Date(state.inbox.expires_at) - new Date();

    if (diff <= 0) {
        el.textContent = 'EXPIRED';
        el.style.color = 'var(--danger)';

        if (state.autoRefreshTimer) {
            clearInterval(state.autoRefreshTimer);
            state.autoRefreshTimer = null;
        }

        toast('Inbox expired', 'error');
        state.inbox = null;
        renderView('dashboard');
        return;
    }

    var mins = Math.floor(diff / 60000);
    var secs = Math.floor((diff % 60000) / 1000);

    el.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
}

setInterval(updateCountdown, 1000);

async function checkAvail() {
    var input = $('#newInboxName');
    var status = $('#availStatus');
    if (!input || !status) return;

    var name = input.value.trim();

    if (!name) {
        status.innerHTML = '<span style="color:var(--text-dim);">Enter a username</span>';
        return;
    }

    status.innerHTML = '<span style="color:var(--text-dim);">Checking...</span>';

    try {
        var data = await api('/email/check?name=' + encodeURIComponent(name));
        if (data.available) {
            status.innerHTML = '<span style="color:var(--neon);">✓ Available</span>';
        } else {
            status.innerHTML = '<span style="color:var(--danger);">✗ Taken</span>';
        }
    } catch (e) {
        status.innerHTML = '<span style="color:var(--danger);">Invalid name</span>';
    }
}

function genRandom() {
    var input = $('#newInboxName');
    if (!input) return;

    var arr = new Uint8Array(4);
    crypto.getRandomValues(arr);

    var hex = '';
    for (var i = 0; i < arr.length; i++) {
        hex += arr[i].toString(16).padStart(2, '0');
    }

    input.value = hex;
    checkAvail();
}

async function createInbox() {
    var input = $('#newInboxName');
    if (!input) return;

    var name = input.value.trim();
    var body = name ? JSON.stringify({ name: name }) : '{}';

    try {
        var data = await api('/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
        });

        var inboxName = name;
        if (data.email && data.email.indexOf('@') > 0) {
            inboxName = data.email.substring(0, data.email.indexOf('@'));
        }

        state.inbox = {
            name: inboxName,
            email: data.email,
            token: data.token,
            expires_at: data.expires_at,
            messages: []
        };

        toast('Inbox created successfully');
        renderView('dashboard');
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function fetchInbox() {
    if (!state.inbox || !state.inbox.name || !state.inbox.token) return;

    try {
        var data = await api('/email/' + encodeURIComponent(state.inbox.name));

        state.inbox.messages = Array.isArray(data.messages) ? data.messages : [];

        if (data.expires_at) {
            state.inbox.expires_at = data.expires_at;
        }

        renderView('dashboard');
    } catch (e) {}
}

function showDeleteModal() {
    var modal = $('#deleteModal');
    if (modal) modal.classList.add('active');
}

function closeDeleteModal() {
    var modal = $('#deleteModal');
    if (modal) modal.classList.remove('active');
}

async function confirmDelete() {
    if (!state.inbox) return;

    try {
        await api('/email/' + encodeURIComponent(state.inbox.name), {
            method: 'DELETE'
        });

        toast('Inbox deleted');
        state.inbox = null;
        closeDeleteModal();
        renderView('dashboard');
    } catch (e) {
        toast(e.message, 'error');
    }
}

function openMessage(id) {
    if (!state.inbox || !Array.isArray(state.inbox.messages)) return;

    var msg = state.inbox.messages.find(function(m) {
        return m.id === id;
    });

    if (!msg) return;

    state.currentMsg = msg;

    $('#msgSubject').textContent = msg.subject || '(No Subject)';
    $('#msgMeta').innerHTML =
    '<div><strong>From:</strong> ' + escapeHtml(msg.from) + '</div>' +
    '<div><strong>To:</strong> ' + escapeHtml(msg.to) + '</div>' +
    '<div><strong>Date:</strong> ' + escapeHtml(formatDate(msg.date)) + '</div>';

    switchTab('text');
    $('#msgModal').classList.add('active');
}

function switchTab(tab) {
    $$('.tab').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-tab') === tab);
    });

    var area = $('#msgContent');
    if (!area || !state.currentMsg) return;

    area.innerHTML = '';

    if (tab === 'text') {
        var pre = document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.fontFamily = 'inherit';
        pre.style.color = 'var(--text)';
        pre.textContent = state.currentMsg.text || '(No text content)';
        area.appendChild(pre);
    } else {
        var iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', '');
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.background = 'white';
        iframe.style.border = '1px solid var(--border)';
        iframe.style.borderRadius = '8px';
        iframe.srcdoc = state.currentMsg.html || '<p style="font-family:sans-serif;color:#333;">No HTML content</p>';
        area.appendChild(iframe);
    }
}

function closeMsgModal() {
    var modal = $('#msgModal');
    if (modal) modal.classList.remove('active');
}

async function logout() {
    try {
        await api('/auth/logout', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/';
}

function renderView(viewName) {
    $$('.nav-item[data-view]').forEach(function(el) {
        el.classList.toggle('active', el.getAttribute('data-view') === viewName);
    });

    var content = $('#mainContent');
    if (!content) return;

    if (viewName === 'dashboard') {
        if (!state.inbox) {
            content.innerHTML =
            '<div class="card empty-state">' +
            '<h2 class="card-title">No Active Inbox</h2>' +
            '<p style="margin:16px 0;">Create a new inbox to start receiving emails securely.</p>' +
            '<button class="btn btn-primary" id="emptyCreateBtn" type="button">Create Inbox</button>' +
            '</div>';

    $('#emptyCreateBtn').addEventListener('click', function() {
        renderView('create');
    });

    return;
        }

        content.innerHTML =
        '<div class="card">' +
        '<div class="card-header">' +
        '<h2 class="card-title">Current Inbox</h2>' +
        '<div class="countdown" id="countdownTimer">--:--</div>' +
        '</div>' +
        '<div class="inbox-email">' + escapeHtml(state.inbox.email) + '</div>' +
        '<div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;">' +
        '<button class="btn" id="copyEmailBtn" type="button">Copy Email</button>' +
        '<button class="btn btn-danger" id="deleteInboxBtn" type="button">Delete Inbox</button>' +
        '</div>' +
        '<div class="token-display">' +
        '<span id="tokenDisplay"></span>' +
        '<div style="display:flex;gap:8px;">' +
        '<button class="btn" id="showTokenBtn" type="button">Show</button>' +
        '<button class="btn" id="copyTokenBtn" type="button">Copy</button>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="card">' +
        '<div class="card-header">' +
        '<h2 class="card-title">Messages (' + (state.inbox.messages ? state.inbox.messages.length : 0) + ')</h2>' +
        '<input type="text" class="input" style="width:250px;" placeholder="Search messages..." id="searchInput">' +
        '</div>' +
        '<div class="msg-list" id="msgList"></div>' +
        '</div>';

    $('#tokenDisplay').textContent = maskToken(state.inbox.token);

    $('#copyEmailBtn').addEventListener('click', function() {
        copyText(state.inbox.email);
    });

    $('#deleteInboxBtn').addEventListener('click', function() {
        showDeleteModal();
    });

    $('#showTokenBtn').addEventListener('click', function() {
        var el = $('#tokenDisplay');
        if (el && state.inbox) el.textContent = state.inbox.token;
    });

        $('#copyTokenBtn').addEventListener('click', function() {
            if (state.inbox) copyText(state.inbox.token);
        });

            var searchInput = $('#searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', filterMessages);
            }

            renderMessages('');
            updateCountdown();
    } else if (viewName === 'create') {
        content.innerHTML =
        '<div class="card">' +
        '<h2 class="card-title">Create New Inbox</h2>' +
        '<div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;">' +
        '<input type="text" class="input" id="newInboxName" placeholder="Username (empty for random)" style="flex:1;min-width:200px;">' +
        '<button class="btn" id="checkBtn" type="button">Check</button>' +
        '<button class="btn" id="randomBtn" type="button">Random</button>' +
        '</div>' +
        '<div id="availStatus" style="margin-top:12px;font-size:14px;min-height:20px;"></div>' +
        '<button class="btn btn-primary" style="margin-top:20px;width:100%;" id="createBtn" type="button">Create Inbox</button>' +
        '</div>';

        $('#checkBtn').addEventListener('click', checkAvail);
        $('#randomBtn').addEventListener('click', genRandom);
        $('#createBtn').addEventListener('click', createInbox);
    }
}

function init() {
    $$('.nav-item[data-view]').forEach(function(el) {
        el.addEventListener('click', function() {
            renderView(el.getAttribute('data-view'));
        });
    });

    var logoutBtn = $('#logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    var refreshBtn = $('#refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', fetchInbox);

    var autoRefresh = $('#autoRefresh');
    if (autoRefresh) {
        autoRefresh.addEventListener('change', function() {
            setAutoRefresh(this.value);
        });
    }

    var closeMsgBtn = $('#closeMsgBtn');
    if (closeMsgBtn) closeMsgBtn.addEventListener('click', closeMsgModal);

    var closeDeleteBtn = $('#closeDeleteBtn');
    if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteModal);

    var cancelDeleteBtn = $('#cancelDeleteBtn');
    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);

    var confirmDeleteBtn = $('#confirmDeleteBtn');
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', confirmDelete);

    $$('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            switchTab(this.getAttribute('data-tab'));
        });
    });

    document.addEventListener('click', function(e) {
        var item = e.target.closest('.msg-item');
        if (item && item.getAttribute('data-id')) {
            openMessage(item.getAttribute('data-id'));
        }
    });

    checkHealth();
    renderView('dashboard');
}

init();
</script>
</body>
</html>`;

// --- MAIN ROUTER ---

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Allow": "GET, POST, DELETE, OPTIONS"
                }
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // Health Check
            if (path === "/health" && request.method === "GET") {
                return await handleHealth(env);
            }

            // Public API Routes
            if (path === "/email" && request.method === "POST") {
                return await handleCreateEmail(request, env);
            }

            if (path === "/email/check" && request.method === "GET") {
                return await handleCheckEmail(request, env);
            }

            const emailMatch = path.match(/^\/email\/([a-zA-Z0-9_-]+)$/);
            if (emailMatch) {
                if (request.method === "GET") {
                    return await handleGetInbox(request, env, emailMatch[1]);
                }
                if (request.method === "DELETE") {
                    return await handleDeleteInbox(request, env, emailMatch[1]);
                }
            }

            // Auth Routes
            if (path === "/auth/login" && request.method === "POST") {
                return await handleLogin(request, env);
            }

            if (path === "/auth/logout" && request.method === "POST") {
                return await handleLogout(request, env);
            }

            // Public Login HTML Route
            if (path === "/" || path === "/login" || path === "/login.html") {
                const isValid = await validateSession(request, env);
                if (isValid) {
                    return Response.redirect(new URL("/app", request.url), 302);
                }
                return htmlResponse(LOGIN_HTML);
            }

            // Protected HTML Routes
            if (path === "/app" || path === "/dashboard") {
                return await requireAuth(request, env, () => htmlResponse(DASHBOARD_HTML));
            }

            return jsonResponse({ success: false, error: "NOT_FOUND" }, 404);
        } catch (err) {
            return jsonResponse({ success: false, error: "INTERNAL_ERROR" }, 500);
        }
    },

    async email(message, env, ctx) {
        const toAddress = message.to;
        const name = toAddress.split("@")[0];

        if (!isValidName(name)) {
            return message.setReject("Invalid recipient");
        }

        const inboxStr = await env.KV.get(`inbox:${name}`);
        if (!inboxStr) {
            return message.setReject("Inbox not found");
        }

        let inbox;
        try {
            inbox = JSON.parse(inboxStr);
        } catch (e) {
            return message.setReject("Invalid inbox");
        }

        if (!inbox || !Array.isArray(inbox.messages)) {
            return message.setReject("Invalid inbox");
        }

        if (inbox.messages.length >= MAX_MESSAGES_PER_INBOX) {
            return message.setReject("Inbox full");
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const expirationSec = Math.floor((inbox.expires_at || 0) / 1000);

        if (!expirationSec || expirationSec <= nowSec) {
            return message.setReject("Inbox expired");
        }

        try {
            const { text, html, subject } = await parseMIME(message.raw);
            const messageId = crypto.randomUUID();

            const msgObj = {
                id: messageId,
                from: message.from,
                to: toAddress,
                subject: subject || "(No Subject)",
                date: new Date().toISOString(),
                text: text.slice(0, MAX_MESSAGE_SIZE),
                html: html.slice(0, MAX_MESSAGE_SIZE)
            };

            await env.KV.put(
                `message:${name}:${messageId}`,
                JSON.stringify(msgObj),
                             { expiration: expirationSec }
            );

            inbox.messages.push(messageId);

            await env.KV.put(
                `inbox:${name}`,
                JSON.stringify(inbox),
                             { expiration: expirationSec }
            );
        } catch (e) {
            message.setReject("Parse error");
        }
    }
};
