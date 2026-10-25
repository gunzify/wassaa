import React from 'react';
import { ChevronLeft, Mail, ShieldCheck } from 'lucide-react';
import { WassaaLogo } from '../common/WassaaLogo';
import { GoogleSignInButton, googleSignInConfigured } from '../common/GoogleSignInButton';

interface SignUpScreenProps {
  onBack: () => void;
  onContinueEmail: () => void;
  onLogIn: () => void;
  onGoogleCredential: (credential: string, nonce: string) => void;
  onGoogleError: (message: string) => void;
  googleBusy: boolean;
}

export const SignUpScreen: React.FC<SignUpScreenProps> = ({ onBack, onContinueEmail, onLogIn, onGoogleCredential, onGoogleError, googleBusy }) => (
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

      <div className="text-center mb-8">
        <h1 className="font-['Cormorant_Garamond',serif] text-3xl font-semibold text-[#1A1816] tracking-tight">
          Find a connection that feels right.
        </h1>
        <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B665F] mt-2 leading-relaxed">
          WASSAA brings uniformed members and thoughtful professionals together. Start with a verified email — adding a
          phone number later is up to you.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinueEmail}
        className="w-full py-3.5 px-5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex items-center justify-center gap-2"
      >
        <Mail className="w-4 h-4" />
        Continue with email
      </button>

      {googleSignInConfigured && (
        <>
          <div className="flex items-center gap-3 my-5" aria-hidden="true">
            <span className="h-px bg-[#E8E4DC] flex-1" />
            <span className="text-[10px] text-[#9C958D] uppercase tracking-wider">or</span>
            <span className="h-px bg-[#E8E4DC] flex-1" />
          </div>

          <GoogleSignInButton onCredential={onGoogleCredential} onError={onGoogleError} disabled={googleBusy} />
          <p className="mt-3 text-[11px] text-center text-[#6B665F] leading-relaxed">
            Google verifies your email for you.
          </p>
        </>
      )}

      <p className="mt-5 flex items-start gap-2 text-[11px] text-[#6B665F] leading-relaxed">
        <ShieldCheck className="w-3.5 h-3.5 text-[#2C6B56] shrink-0 mt-0.5" />
        We email a six-digit code to confirm it’s you. No password to remember, and your email is never shown to other
        members.
      </p>

      <div className="mt-7 pt-6 border-t border-[#E8E4DC] text-center">
        <p className="text-sm text-[#1A1816]">
          Already have an account?{' '}
          <button type="button" onClick={onLogIn} className="text-[#B85A3C] font-semibold hover:text-[#A04E33] underline underline-offset-2">
            Sign in
          </button>
        </p>
      </div>
    </div>
  </div>
);
