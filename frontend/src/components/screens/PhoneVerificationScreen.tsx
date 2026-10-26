import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Delete, SkipForward } from 'lucide-react';
import { WassaaApi } from '../../services/api';
import { UserProfile } from '../../types';

export interface PhoneVerificationScreenProps {
  onBack: () => void;
  onVerified: (user: UserProfile) => void;
  /** Present when the number is optional and the member can leave without it. */
  onSkip?: () => void;
}

export const PhoneVerificationScreen: React.FC<PhoneVerificationScreenProps> = ({
  onBack,
  onVerified,
  onSkip
}) => {
  const [phoneNumber, setPhoneNumber] = useState('8');
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(45);

  const e164 = phoneNumber.startsWith('0') ? `+234${phoneNumber.slice(1)}` : `+234${phoneNumber}`;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submitOtp = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const user = await WassaaApi.verifyPhoneCode(e164, code);
      onVerified(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setOtp('');
    } finally {
      setBusy(false);
    }
  }, [e164, onVerified]);

  const handleKeyPress = (num: string) => {
    if (!codeSent) {
      if (phoneNumber.length < 11) setPhoneNumber((prev) => prev + num);
      return;
    }
    if (otp.length < 6) {
      const next = otp + num;
      setOtp(next);
      if (next.length === 6) void submitOtp(next);
    }
  };

  const handleSendCode = async () => {
    if (phoneNumber.length < 10) {
      setError('Please enter your full mobile number');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await WassaaApi.requestPhoneCode(e164);
      setCodeSent(true);
      setCooldown(45);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (!codeSent) {
      setPhoneNumber((prev) => prev.slice(0, -1));
    } else {
      setOtp((prev) => prev.slice(0, -1));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Enter') {
        if (!codeSent && phoneNumber.length >= 10 && !busy) {
          void handleSendCode();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [codeSent, phoneNumber, otp, busy]);

  return (
    <div className="w-full min-h-[calc(100dvh-8rem)] flex items-center justify-center py-2">
      <div className="w-full bg-white rounded-2xl border border-[#E8E4DC] p-5 sm:p-7 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] flex flex-col justify-between">
        <div>
          {/* Header navigation */}
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-[#6B665F] hover:text-[#1A1816] px-2 -ml-2 rounded-lg hover:bg-[#F7F5F0]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <span className="font-['Space_Mono',monospace] text-[0.8125rem] uppercase tracking-wider text-[#9C958D]">
              {codeSent ? 'Verification' : 'Optional step'}
            </span>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-semibold text-[#1A1816] leading-tight">
              {codeSent ? 'Enter verification code' : 'Add your mobile number'}
            </h1>
            <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B665F] mt-2 leading-relaxed">
              {codeSent
                ? `We sent a 6-digit confirmation code to +234 ${phoneNumber}.`
                : 'Optional. A confirmed number earns a trust badge and gives us a second, private way to reach you about your account.'}
            </p>
          </div>

          {/* Error notice */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-[#FDF2EE] border border-[#E8D5CD] text-xs text-[#9B2C2C] font-medium leading-relaxed">
              {error}
            </div>
          )}

          {/* Phone input stage */}
          {!codeSent ? (
            <div className="space-y-4 mb-6">
              <label className="field-label font-['Space_Mono',monospace] uppercase tracking-wider">
                Mobile number
              </label>
              <div className="field flex items-center p-0 overflow-hidden">
                <div className="flex items-center gap-2 px-4 border-r border-[#E8E4DC] text-[0.9375rem] font-semibold text-[#1A1816] select-none shrink-0 self-stretch">
                  <span className="text-base leading-none">🇳🇬</span>
                  <span className="font-['Space_Mono',monospace]">+234</span>
                </div>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '');
                    if (cleaned.length <= 11) setPhoneNumber(cleaned);
                  }}
                  placeholder="801 234 5678"
                  className="flex-1 min-w-0 px-4 bg-transparent font-semibold outline-none border-0 tracking-wider font-['Space_Mono',monospace]"
                />
              </div>

              <button
                type="button"
                onClick={handleSendCode}
                disabled={busy || phoneNumber.length < 10}
                className="btn btn-primary btn-block"
              >
                {busy ? 'Sending code…' : 'Send code'}
              </button>

              {onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="w-full px-6 rounded-full text-[#6B665F] hover:text-[#1A1816] font-semibold text-[0.9375rem] flex items-center justify-center gap-1.5"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip for now
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5 mb-6">
              {/* OTP Digits */}
              <div className="flex justify-between items-center gap-2 max-w-sm mx-auto">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const val = otp[idx];
                  const isCurrent = otp.length === idx;
                  return (
                    <div
                      key={idx}
                      className={`w-11 h-14 sm:w-12 sm:h-14 rounded-xl flex items-center justify-center text-xl font-bold font-['Space_Mono',monospace] border transition-all ${
                        val
                          ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816] shadow-sm'
                          : isCurrent
                          ? 'border-[#B85A3C] ring-2 ring-[#B85A3C]/20 bg-white text-[#1A1816]'
                          : 'border-[#E8E4DC] bg-[#F7F5F0]/60 text-[#9C958D]'
                      }`}
                    >
                      {val || (isCurrent ? <span className="animate-pulse text-[#B85A3C]">|</span> : '·')}
                    </div>
                  );
                })}
              </div>

              <div className="text-center pt-2">
                <p className="text-[0.9375rem] text-[#6B665F] font-['Plus_Jakarta_Sans',sans-serif]">
                  Didn't receive a code?{' '}
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={cooldown > 0 || busy}
                    className="text-[#B85A3C] hover:text-[#A04E33] font-semibold disabled:text-[#9C958D] disabled:cursor-not-allowed transition-colors"
                  >
                    Resend{cooldown > 0 ? ` (00:${String(cooldown).padStart(2, '0')})` : ''}
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => { setCodeSent(false); setOtp(''); setError(null); }}
                  className="mt-3 text-[0.8125rem] text-[#6B665F] hover:text-[#1A1816] underline underline-offset-2 transition-colors"
                >
                  Use a different number
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="mt-4 pt-4 border-t border-[#E8E4DC]">
          <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeyPress(digit)}
                className="h-14 rounded-xl bg-[#F7F5F0] hover:bg-[#F5EAE5] text-lg font-semibold text-[#1A1816] flex items-center justify-center border border-transparent"
              >
                {digit}
              </button>
            ))}
            <div />
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="h-14 rounded-xl bg-[#F7F5F0] hover:bg-[#F5EAE5] text-lg font-semibold text-[#1A1816] flex items-center justify-center border border-transparent"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete"
              className="h-14 rounded-xl bg-[#F7F5F0] hover:bg-[#F5EAE5] text-[#6B665F] flex items-center justify-center border border-transparent"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
