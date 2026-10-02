// Thin client for the WHOOP Developer API v2.
// Docs: https://developer.whoop.com/docs/developing/oauth , https://developer.whoop.com/api
import crypto from 'crypto';
import WhoopConnection from '../models/WhoopConnection.js';
import { encrypt, decrypt } from '../utils/crypto.js';

// Overridable so we can point at a local fake server in tests.
const OAUTH_BASE = () => process.env.WHOOP_OAUTH_BASE || 'https://api.prod.whoop.com/oauth/oauth2';
const API_BASE = () => process.env.WHOOP_API_BASE || 'https://api.prod.whoop.com/developer';
export const SCOPES = ['offline', 'read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile'];

export const whoopConfigured = () => Boolean(process.env.WHOOP_CLIENT_ID && process.env.WHOOP_CLIENT_SECRET && process.env.WHOOP_REDIRECT_URI);

export class WhoopAuthError extends Error {}

// ---- OAuth -------------------------------------------------------------------------------
// state -> { userId, expires }. In-memory is fine for a single-process alpha.
const pendingStates = new Map();

export function buildAuthorizeUrl(userId) {
  for (const [s, v] of pendingStates) if (v.expires < Date.now()) pendingStates.delete(s);
  // Whoop requires state to be 8 characters.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const state = Array.from(crypto.randomBytes(8), b => alphabet[b % alphabet.length]).join('');
  pendingStates.set(state, { userId: String(userId), expires: Date.now() + 10 * 60 * 1000 });
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.WHOOP_CLIENT_ID,
    redirect_uri: process.env.WHOOP_REDIRECT_URI,
    scope: SCOPES.join(' '),
    state
  });
  return `${OAUTH_BASE()}/auth?${p}`;
}

export function consumeState(state) {
  const v = pendingStates.get(state);
  pendingStates.delete(state);
  return v && v.expires > Date.now() ? v.userId : null;
}

async function tokenRequest(params) {
  const res = await fetch(`${OAUTH_BASE()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      ...params
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new WhoopAuthError(`Token request failed (${res.status}): ${body.error_description || body.error || 'unknown'}`);
  return body; // { access_token, refresh_token, expires_in, scope, token_type }
}

export const exchangeCode = (code) =>
  tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: process.env.WHOOP_REDIRECT_URI });

export function tokenFields(t) {
  return {
    accessToken: encrypt(t.access_token),
    ...(t.refresh_token ? { refreshToken: encrypt(t.refresh_token) } : {}),
    expiresAt: new Date(Date.now() + (t.expires_in || 3600) * 1000),
    scope: t.scope
  };
}

// Refreshing invalidates the old refresh token, so concurrent refreshes for the same user
// must be serialized or the second one fails. One in-flight refresh per user.
const refreshing = new Map();

async function refresh(conn, force = false) {
  const id = String(conn.user);
  if (!refreshing.has(id)) {
    refreshing.set(id, (async () => {
      try {
        const fresh = await WhoopConnection.findById(conn._id);
        // Another request may have refreshed already; reuse its token if it's newer than ours.
        if (!force && fresh.expiresAt.getTime() - Date.now() > 60_000 && fresh.accessToken !== conn.accessToken) return fresh;
        if (!fresh.refreshToken) throw new WhoopAuthError('No refresh token; reconnect Whoop');
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(fresh.refreshToken), scope: 'offline' });
        Object.assign(fresh, tokenFields(t), { status: 'active' });
        await fresh.save();
        return fresh;
      } catch (e) {
        if (e instanceof WhoopAuthError) await WhoopConnection.updateOne({ _id: conn._id }, { status: 'reauth_required', lastSyncError: e.message });
        throw e;
      } finally {
        refreshing.delete(id);
      }
    })());
  }
  return refreshing.get(id);
}

async function validAccessToken(conn) {
  if (conn.expiresAt.getTime() - Date.now() < 60_000) conn = await refresh(conn);
  return { conn, token: decrypt(conn.accessToken) };
}

// ---- API ---------------------------------------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** GET an API path with auto-refresh on 401 and backoff on 429. */
export async function whoopGet(conn, path, query = {}) {
  let { conn: c, token } = await validAccessToken(conn);
  for (let attempt = 0; attempt < 4; attempt++) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString();
    const res = await fetch(`${API_BASE()}${path}${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return { conn: c, data: res.status === 204 ? null : await res.json() };
    if (res.status === 401 && attempt === 0) { c = await refresh(c); token = decrypt(c.accessToken); continue; }
    if (res.status === 429) { await sleep((Number(res.headers.get('retry-after')) || 2 ** attempt * 2) * 1000); continue; }
    if (res.status === 401) throw new WhoopAuthError('Whoop rejected the access token; reconnect Whoop');
    throw new Error(`Whoop API ${path} failed: ${res.status}`);
  }
  throw new Error(`Whoop API ${path}: rate limited`);
}

/** Fetch every page of a collection endpoint between start and end. */
export async function whoopCollection(conn, path, { start, end } = {}) {
  const out = [];
  let nextToken;
  let c = conn;
  do {
    const r = await whoopGet(c, path, { limit: 25, start: start?.toISOString(), end: end?.toISOString(), nextToken });
    c = r.conn;
    out.push(...(r.data.records || []));
    nextToken = r.data.next_token || undefined;
  } while (nextToken);
  return { conn: c, records: out };
}

export async function revoke(conn) {
  const { token } = await validAccessToken(conn);
  const res = await fetch(`${API_BASE()}/v2/user/access`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Whoop revoke failed: ${res.status}`);
}
