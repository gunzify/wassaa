import React, { useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdApi {
  initialize(options: { client_id: string; nonce: string; use_fedcm_for_prompt: true; callback: (response: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: { theme: 'outline'; size: 'large'; shape: 'pill'; text: 'continue_with'; width: number; logo_alignment: 'left' }): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

let googleScriptPromise: Promise<void> | null = null;
export const googleSignInConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim());

async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return { raw, hashed: [...digest].map((value) => value.toString(16).padStart(2, '0')).join('') };
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-wassaa-google-identity]');
    const script = existing || document.createElement('script');
    const loaded = () => resolve();
    const failed = () => {
      script.remove();
      googleScriptPromise = null;
      reject(new Error('Google sign-in could not load. Check your connection and try again.'));
    };
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.wassaaGoogleIdentity = 'true';
      document.head.appendChild(script);
    }
  }).catch((error) => {
    googleScriptPromise = null;
    throw error;
  });

  return googleScriptPromise;
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string, nonce: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ onCredential, onError, disabled = false }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [loading, setLoading] = useState(true);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

  useEffect(() => { onCredentialRef.current = onCredential; }, [onCredential]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!clientId || !hostRef.current) return;
    let cancelled = false;
    void Promise.all([loadGoogleIdentityServices(), makeNonce()]).then(([, nonce]) => {
      if (cancelled || !hostRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: nonce.hashed,
        use_fedcm_for_prompt: true,
        callback: (response) => {
          if (response.credential) onCredentialRef.current(response.credential, nonce.raw);
          else onErrorRef.current('Google did not return a sign-in credential. Try again.');
        }
      });
      hostRef.current.replaceChildren();
      window.google.accounts.id.renderButton(hostRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        // Google adds its own border/scaling on top of the requested width, so
        // leave room for it or the pill spills past the card edge.
        width: Math.min(360, Math.max(220, Math.floor(hostRef.current.clientWidth) - 12)),
        logo_alignment: 'left'
      });
      setLoading(false);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setLoading(false);
      onErrorRef.current(error instanceof Error ? error.message : 'Google sign-in could not load.');
    });

    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="relative w-full min-h-[3.25rem] flex justify-center overflow-hidden rounded-full" aria-busy={loading || disabled}>
      <div ref={hostRef} className={`w-full flex justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`} />
      {loading && <div className="absolute inset-0 rounded-full border border-[#E8E4DC] bg-white animate-pulse" aria-hidden="true" />}
    </div>
  );
};
