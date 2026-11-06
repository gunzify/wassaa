import React, { useEffect, useState } from 'react';
import { ChevronLeft, Mail, Lock, ShieldCheck, Eye, EyeOff, Check } from 'lucide-react';
import { WassaaLogo } from '../common/WassaaLogo';
import { WassaaApi } from '../../services/api';
import { signInWithPassword, signUpWithPassword } from '../../services/supabase-auth';
import { UserProfile } from '../../types';

interface EmailVerificationScreenProps {
  /** `signup` asks for password + confirmation and emails a verification link; `signin` is password only. */
  mode: 'signup' | 'signin';
  onBack: () => void;
  onVerified: (user: UserProfile) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const MIN_PASSWORD = 8;

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({ mode, onBack, onVerified }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false); // sign-up: verification link e-mailed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const trimmedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_PATTERN.test(trimmedEmail);
  const passwordValid = password.length >= MIN_PASSWORD;
  const confirmValid = confirm.length > 0 && confirm === password;
  const isSignup = mode === 'signup';

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!isSignup) { setSent(false); return; }
    // Switching between the two modes must reset the stale form.
    setSent(false);
  }, [isSignup]);

  const advance = async () => {
    const user = await WassaaApi.fetchSession();
    if (!user) throw new Error('Signed in, but your profile could not be loaded yet. Try again.');
    onVerified(user);
  };

  const handleSubmit = async () => {
    if (busy) return;
    if (!emailValid) { setError('Enter a valid email address.'); return; }
    if (!passwordValid) { setError(`Your password needs at least ${MIN_PASSWORD} characters.`); return; }
    if (isSignup && !confirmValid) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (isSignup) {
        const result = await signUpWithPassword(trimmedEmail, password);
        if (result.confirmed) {
          await advance(); // auto-confirm is on: straight into onboarding
        } else {
          setSent(true);
          setCooldown(60);
        }
      } else {
        await signInWithPassword(trimmedEmail, password);
        await advance();
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Something went wrong. Try again.';
      // Supabase rejects unconfirmed accounts at sign-in; nudge to the inbox.
      setError(/confirm/i.test(raw)
        ? 'Your email is not verified yet — open the verification link we e-mailed you (or resend it below after signing up again).'
        : /already/i.test(raw)
          ? 'That email already has an account. Try signing in with your password.'
          : (/invalid/i.test(raw) && isSignup)
            ? 'That email is already registered. Try signing in instead.'
            : raw);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    try {
      await signUpWithPassword(trimmedEmail, password);
      setCooldown(60);
    } catch {
      setError('We could not resend the link right now. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };

  const passwordField = (id: string, labelText: string, value: string, onValue: (next: string) => void, autoComplete: string) => (
    <div>
      <label htmlFor={id} className="field-label font-['Space_Mono',monospace] uppercase tracking-wider">{labelText}</label>
      <div className="relative">
        <Lock className="w-5 h-5 text-[#9C958D] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && (!isSignup || confirmValid)) void handleSubmit(); }}
          placeholder="••••••••"
          className="field pl-12 pr-12 font-medium"
        />
        <button
          type="button"
          onClick={() => setShowPassword((visible) => !visible)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#9C958D] hover:text-[#1A1816] rounded-full transition-colors"
        >
          {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
        </button>
      </div>
    </div>
  );

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
          <h1 className="font-['Cormorant_Garamond',serif] text-[2rem] leading-[1.15] font-semibold text-[#1A1816] tracking-tight">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="font-['Plus_Jakarta_Sans',sans-serif] text-[0.9375rem] text-[#6B665F] mt-2.5 leading-relaxed">
            {isSignup ? 'Email and password — no phone number needed.' : 'Sign in with the email and password you chose.'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-[#FDF2EE] border border-[#E8D5CD] text-[0.875rem] text-[#9B2C2C] font-medium leading-relaxed">
            {error}
          </div>
        )}

        {sent ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[#F2F7F4] border border-[#D9E6DE]">
              <Mail className="w-5 h-5 text-[#2C6B56] shrink-0 mt-0.5" />
              <div className="text-[0.9375rem] text-[#1A1816] leading-relaxed">
                <p className="font-semibold">Check your inbox</p>
                <p className="text-[#6B665F] mt-1 text-[0.875rem]">
                  We sent a verification link to <span className="font-semibold text-[#1A1816]">{trimmedEmail}</span>. Tap
                  it to confirm your email — then you will come right back to finish setting up your profile.
                </p>
              </div>
            </div>
            <p className="text-[0.8125rem] text-[#6B665F] leading-relaxed text-center">
              Can't find it? Check spam, or resend below.
            </p>
            <button
              type="button"
              onClick={() => void resend()}
              disabled={busy || cooldown > 0}
              className="btn btn-primary btn-block disabled:bg-[#D7D2C8] disabled:text-[#6B665F]"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : busy ? 'Resending…' : 'Resend verification link'}
            </button>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); setPassword(''); setConfirm(''); setError(null); }}
              className="block mx-auto text-[0.8125rem] text-[#6B665F] hover:text-[#1A1816] underline underline-offset-2 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="wassaa-email" className="field-label font-['Space_Mono',monospace] uppercase tracking-wider">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-[#9C958D] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="wassaa-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && (!isSignup || confirmValid)) void handleSubmit(); }}
                  placeholder="you@example.com"
                  className="field pl-12 font-medium"
                />
              </div>
            </div>

            {passwordField('wassaa-password', 'Password', password, setPassword, isSignup ? 'new-password' : 'current-password')}
            {passwordValid && (
              <p className="text-[0.75rem] text-[#2C6B56] flex items-center gap-1.5 -mt-1">
                <Check className="w-3.5 h-3.5" /> At least {MIN_PASSWORD} characters
              </p>
            )}
            {!passwordValid && password.length > 0 && (
              <p className="text-[0.75rem] text-[#9C958D] -mt-1">{MIN_PASSWORD} characters minimum</p>
            )}

            {isSignup && passwordField('wassaa-confirm', 'Confirm password', confirm, setConfirm, 'new-password')}
            {isSignup && confirm.length > 0 && !confirmValid && (
              <p className="text-[0.75rem] text-[#9B2C2C] -mt-1">Passwords don't match yet.</p>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy || !emailValid || !passwordValid || (isSignup && !confirmValid)}
              className="btn btn-primary btn-block"
            >
              {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : isSignup ? 'Sign up' : 'Sign in'}
            </button>

            <p className="flex items-start gap-2 text-[0.8125rem] text-[#6B665F] leading-relaxed pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#2C6B56] shrink-0 mt-0.5" />
              {isSignup
                ? 'New accounts get a verification link by email. Your email is never shown to other members.'
                : 'Your email is never shown to other members.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
