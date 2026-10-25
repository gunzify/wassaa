const projectUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const sessionKey = 'wassaa_supabase_auth_v1';
let refreshInFlight: Promise<string | null> | null = null;

try { localStorage.removeItem('wassaa_session_token'); } catch { /* storage may be unavailable */ }

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: { id: string; phone?: string; email?: string; user_metadata?: Record<string, unknown> };
}

function config() {
  if (!projectUrl || !publishableKey) throw new Error('Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return { projectUrl, publishableKey };
}

export function readSession(): AuthSession | null {
  try { const raw = localStorage.getItem(sessionKey); return raw ? JSON.parse(raw) as AuthSession : null; } catch { return null; }
}

function writeSession(session: AuthSession | null): void {
  try {
    if (!session) localStorage.removeItem(sessionKey);
    else {
      if (!session.expires_at && session.expires_in) session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
      localStorage.setItem(sessionKey, JSON.stringify(session));
    }
  } catch { /* private browsing may disable local storage */ }
}

async function request<T>(path: string, method = 'POST', body?: unknown, accessToken?: string): Promise<T> {
  const { projectUrl: url, publishableKey: key } = config();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method,
    headers: { apikey: key, 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || data.error || `Authentication failed (${response.status})`);
  return data as T;
}

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const current = readSession();
  if (!current) return null;
  if (!forceRefresh && current.expires_at && current.expires_at > Math.floor(Date.now() / 1000) + 60) return current.access_token;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const latest = readSession();
      if (!forceRefresh && latest?.expires_at && latest.expires_at > Math.floor(Date.now() / 1000) + 60) return latest.access_token;
      const next = await request<AuthSession>('token?grant_type=refresh_token', 'POST', { refresh_token: latest?.refresh_token || current.refresh_token });
      writeSession(next);
      return next.access_token;
    } catch {
      writeSession(null);
      return null;
    } finally { refreshInFlight = null; }
  })();
  return refreshInFlight;
}

/**
 * Email is the primary identity: a confirmed address is required, and Supabase
 * creates the account on first request when `create_user` is set.
 */
export async function sendEmailOtp(email: string): Promise<void> {
  await request('otp', 'POST', { email, create_user: true });
}

export async function confirmEmailOtp(email: string, token: string): Promise<AuthSession> {
  const session = await request<AuthSession>('verify', 'POST', { email, token, type: 'email' });
  writeSession(session);
  return session;
}

/**
 * Phone verification is optional and only ever adds a number to the signed-in
 * account, so it always runs through the `phone_change` flow.
 */
export async function sendPhoneChangeCode(phone: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in before adding a phone number.');
  await request('user', 'PUT', { phone }, token);
}

export async function confirmPhoneChange(phone: string, token: string): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Sign in before adding a phone number.');
  const session = await request<AuthSession>('verify', 'POST', { phone, token, type: 'phone_change' }, accessToken);
  if (session.access_token) writeSession(session);
}

export async function signInWithGoogleIdToken(idToken: string, nonce: string): Promise<AuthSession> {
  const session = await request<AuthSession>('token?grant_type=id_token', 'POST', { provider: 'google', id_token: idToken, nonce });
  writeSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  const token = await getAccessToken();
  if (token) { try { await request('logout', 'POST', undefined, token); } catch { /* clear local state even if offline */ } }
  writeSession(null);
}

export function clearSession(): void { writeSession(null); }

export function supabaseFunctionsUrl(): string {
  const { projectUrl: url } = config();
  return `${url}/functions/v1/api`;
}

export function supabaseApiKey(): string { return config().publishableKey; }

/**
 * Supabase sends either a six-digit code or a magic link, depending on the email
 * template. When someone taps the link they land back here with the session in
 * the URL fragment; fold it into the stored session and clean the address bar.
 */
export function consumeRedirectSession(): void {
  if (typeof window === 'undefined' || !window.location.hash.includes('access_token=')) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return;
  writeSession({
    access_token,
    refresh_token,
    expires_in: Number(params.get('expires_in')) || undefined,
    user: { id: '' }
  });
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

// Runs once when the app boots, before any screen reads the session.
consumeRedirectSession();
