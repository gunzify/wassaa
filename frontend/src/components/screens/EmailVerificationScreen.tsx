import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Mail, ShieldCheck } from 'lucide-react';
import { WassaaLogo } from '../common/WassaaLogo';
import { WassaaApi } from '../../services/api';
import { UserProfile } from '../../types';

interface EmailVerificationScreenProps {
  onBack: () => void;
  onVerified: (user: UserProfile) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({ onBack, onVerified }) => {
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const trimmedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_PATTERN.test(trimmedEmail);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (codeSent) codeInputRef.current?.focus();
  }, [codeSent]);

  const submitCode = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await WassaaApi.verifyEmailCode(trimmedEmail, value);
      onVerified(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code could not be confirmed. Try again.');
      setCode('');
      codeInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const handleCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submitCode(digits);
  };

  const handleSendCode = async () => {
    if (!emailValid) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await WassaaApi.requestEmailCode(trimmedEmail);
      setCodeSent(true);
      setCode('');
      setCooldown(45);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not send that code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl border border-[#E8E4DC] p-6 sm:p-8 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)]">
        <div className="relative flex items-center justify-center mb-8">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-0 p-2 text-[#6B665F] hover:text-[#1A1816] hover:bg-[#F7F5F0] rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <WassaaLogo size="md" variant="dark" showTagline={false} />
        </div>

        <div className="text-center mb-7">
          <h1 className="font-['Cormorant_Garamond',serif] text-3xl font-semibold text-[#1A1816] tracking-tight">
            {codeSent ? 'Check your inbox' : 'Continue with email'}
          </h1>
          <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B665F] mt-2 leading-relaxed">
            {codeSent ? (
              <>
                We sent a six-digit code to <span className="font-semibold text-[#1A1816]">{trimmedEmail}</span>. Enter it
                below to verify your email.
              </>
            ) : (
              'No password needed. We email a one-time code, and your account is created the first time you sign in.'
            )}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-xl bg-[#FDF2EE] border border-[#E8D5CD] text-xs text-[#9B2C2C] font-medium leading-relaxed">
            {error}
          </div>
        )}

        {!codeSent ? (
          <div className="space-y-4">
            <label htmlFor="wassaa-email" className="block text-xs font-semibold text-[#1A1816] uppercase tracking-wider font-['Space_Mono',monospace]">
              Email address
            </label>
            <div className="flex items-center bg-white border border-[#E8E4DC] focus-within:border-[#B85A3C] focus-within:ring-2 focus-within:ring-[#B85A3C]/20 rounded-xl p-3.5 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Mail className="w-4 h-4 text-[#9C958D] shrink-0" />
              <input
                id="wassaa-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy) void handleSendCode();
                }}
                placeholder="you@example.com"
                className="flex-1 pl-3 bg-transparent text-sm font-medium text-[#1A1816] placeholder-[#9C958D] outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSendCode()}
              disabled={busy || !emailValid}
              className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99]"
            >
              {busy ? 'Sending code…' : 'Send code'}
            </button>

            <p className="flex items-start gap-2 text-[11px] text-[#6B665F] leading-relaxed pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2C6B56] shrink-0 mt-0.5" />
              A verified email protects your account and lets us reach you about your profile. We never show it to other
              members.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <label htmlFor="wassaa-email-code" className="block text-xs font-semibold text-[#1A1816] uppercase tracking-wider font-['Space_Mono',monospace]">
              Six-digit code
            </label>
            <input
              id="wassaa-email-code"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              disabled={busy}
              aria-busy={busy}
              placeholder="000000"
              className="w-full text-center text-2xl font-bold tracking-[0.55em] font-['Space_Mono',monospace] text-[#1A1816] placeholder:text-[#D7D2C8] bg-[#F7F5F0]/60 border border-[#E8E4DC] focus:border-[#B85A3C] focus:ring-2 focus:ring-[#B85A3C]/20 focus:bg-white rounded-xl py-4 outline-none transition-all disabled:opacity-60"
            />

            <button
              type="button"
              onClick={() => void submitCode(code)}
              disabled={busy || code.length !== 6}
              className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99]"
            >
              {busy ? 'Verifying…' : 'Verify email'}
            </button>

            <div className="text-center space-y-2">
              <p className="text-xs text-[#6B665F]">
                Didn’t get it?{' '}
                <button
                  type="button"
                  onClick={() => void handleSendCode()}
                  disabled={cooldown > 0 || busy}
                  className="text-[#B85A3C] hover:text-[#A04E33] font-semibold disabled:text-[#9C958D] disabled:cursor-not-allowed transition-colors"
                >
                  Resend{cooldown > 0 ? ` in ${cooldown}s` : ''}
                </button>
              </p>
              <button
                type="button"
                onClick={() => { setCodeSent(false); setCode(''); setError(null); }}
                className="text-[11px] text-[#6B665F] hover:text-[#1A1816] underline underline-offset-2 transition-colors"
              >
                Use a different email
              </button>
            </div>

            <p className="text-[11px] text-[#9C958D] leading-relaxed text-center">
              If you opened the sign-in link from the email instead, your session is already confirmed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
