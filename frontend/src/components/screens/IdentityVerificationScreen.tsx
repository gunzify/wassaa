import React, { useState } from 'react';
import { ChevronLeft, Clock, Lock, ShieldCheck } from 'lucide-react';
import { IdentityCapturePanel } from '../common/IdentityCapturePanel';

interface IdentityVerificationScreenProps {
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Settings entry point for identity verification. The capture itself lives in
 * IdentityCapturePanel so onboarding and Settings stay pixel-identical.
 */
export const IdentityVerificationScreen: React.FC<IdentityVerificationScreenProps> = ({
  onBack,
  onContinue
}) => {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="w-full screen-center">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-[#E8E4DC] p-6 sm:p-8 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)]">
        {/* Header navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold text-[#6B665F] hover:text-[#1A1816] transition-colors px-2 -ml-2 rounded-lg hover:bg-[#F7F5F0]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <span className="font-['Space_Mono',monospace] text-[0.8125rem] uppercase tracking-wider text-[#9C958D]">
            Verification
          </span>
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-semibold text-[#1A1816] leading-tight">
            Identity Verification
          </h1>
          <p className="text-sm text-[#6B665F] mt-2 leading-relaxed">
            Upload a valid ID and take a live selfie. A human reviewer checks that the selfie appears to match the ID. This does not verify military or other uniformed-service employment.
          </p>
        </div>

        <IdentityCapturePanel
          onSubmitted={() => {
            setSubmitted(true);
            onContinue();
          }}
        />

        {/* Verification status */}
        <div className="mt-4 p-4 bg-[#F7F5F0] border border-[#E8E4DC] rounded-xl">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-xs font-semibold text-[#1A1816]">Verification status</span>
            {submitted ? (
              <span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-[#2C6B56] bg-[#2C6B56]/10 px-2.5 py-1 rounded-full border border-[#2C6B56]/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>In review</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-[#B85A3C] bg-[#F5EAE5] px-2.5 py-1 rounded-full border border-[#E8D5CD]">
                <Clock className="w-3.5 h-3.5" />
                <span>Pending submission</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[#6B665F] leading-relaxed">
            A reviewer confirms your identity, usually within 24 hours. Verification confirms authentic profiles while safeguarding your privacy.
          </p>
        </div>

        {/* Zero-storage reassurance */}
        <div className="mt-3 flex items-center gap-3 text-xs text-[#6B665F] bg-[#F7F5F0]/60 p-3.5 rounded-xl border border-[#E8E4DC]">
          <Lock className="w-4 h-4 text-[#2A3A2C] shrink-0" />
          <span>Your ID and selfie are encrypted and purged the moment a verification decision is recorded.</span>
        </div>
      </div>
    </div>
  );
};
