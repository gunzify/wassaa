import React, { useState } from 'react';
import {
  ChevronLeft,
  CreditCard,
  Camera,
  Check,
  Clock,
  Lock,
  Upload,
  X,
  RefreshCw
} from 'lucide-react';
import { WassaaApi } from '../../services/api';

interface IdentityVerificationScreenProps {
  onBack: () => void;
  onContinue: () => void;
}

export const IdentityVerificationScreen: React.FC<IdentityVerificationScreenProps> = ({
  onBack,
  onContinue
}) => {
  const [hasId, setHasId] = useState(false);
  const [hasSelfie, setHasSelfie] = useState(false);
  const [activeModal, setActiveModal] = useState<'id' | 'selfie' | null>(null);

  // ID modal state
  const [selectedDoc, setSelectedDoc] = useState<'NIN' | 'Passport' | 'ServiceID'>('NIN');
  const [documentNumber, setDocumentNumber] = useState('');
  const [idDocDataUrl, setIdDocDataUrl] = useState<string | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  // Kept so the original file can be uploaded straight to object storage.
  const [idDocFile, setIdDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isScanningId, setIsScanningId] = useState(false);

  // Selfie modal state
  const [selfieStage, setSelfieStage] = useState<'look' | 'turn' | 'smile' | 'complete'>('look');
  const [isCapturingSelfie, setIsCapturingSelfie] = useState(false);

  const handleIdFile = (file: File) => {
    setIdDocFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setIdDocDataUrl(String(reader.result));
      setIsScanningId(false);
      setHasId(true);
      setActiveModal(null);
    };
    reader.onerror = () => setIsScanningId(false);
    reader.readAsDataURL(file);
  };

  const handleSelfieFile = (file: File) => {
    setSelfieFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setSelfieDataUrl(String(reader.result));
      setIsCapturingSelfie(false);
      setSelfieStage('complete');
      setHasSelfie(true);
      setTimeout(() => setActiveModal(null), 800);
    };
    reader.onerror = () => setIsCapturingSelfie(false);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!idDocDataUrl || !selfieDataUrl) {
      setSubmitError('Add your ID photo and a live selfie first.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!idDocFile || !selfieFile) throw new Error('Capture or select both images again before submitting.');
      const [idDocKey, selfieKey] = await Promise.all([
        WassaaApi.uploadImage('id_doc', idDocFile),
        WassaaApi.uploadImage('selfie', selfieFile)
      ]);
      await WassaaApi.submitVerification({ documentType: selectedDoc, documentNumber, idDocKey, selfieKey });

      setIdDocDataUrl(null);
      setSelfieDataUrl(null);
      setIdDocFile(null);
      setSelfieFile(null);
      onContinue();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full min-h-screen py-8 sm:py-12 px-4 sm:px-6 flex items-center justify-center bg-[#F7F5F0]">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-[#E8E4DC] p-6 sm:p-8 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] flex flex-col justify-between">
        <div>
          {/* Header navigation */}
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B665F] hover:text-[#1A1816] transition-colors p-2 -ml-2 rounded-lg hover:bg-[#F7F5F0]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <span className="font-['Space_Mono',monospace] text-[11px] uppercase tracking-wider text-[#9C958D]">
              Verification
            </span>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-semibold text-[#1A1816] leading-tight">
              Identity Verification
            </h1>
            <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B665F] mt-2 leading-relaxed">
              Upload a valid ID and take a live selfie. A human reviewer checks that the selfie appears to match the ID. This does not verify military or other uniformed-service employment.
            </p>
          </div>

          {/* Verification Cards */}
          <div className="space-y-3 mb-5">
            {/* Card 1: Government ID */}
            <div
              onClick={() => setActiveModal('id')}
              className="p-4 bg-white border border-[#E8E4DC] hover:border-[#B85A3C]/50 rounded-2xl flex items-center justify-between cursor-pointer transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-[#1A1816] block">
                    Government ID
                  </span>
                  <span className="text-xs text-[#6B665F]">
                    NIN, Passport or Official ID
                  </span>
                </div>
              </div>

              {hasId ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2C6B56] bg-[#2C6B56]/10 px-2.5 py-1 rounded-full border border-[#2C6B56]/20">
                  <Check className="w-3.5 h-3.5" />
                  <span>Uploaded</span>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border border-[#E8E4DC] bg-white flex items-center justify-center text-xs" />
              )}
            </div>

            {/* Card 2: Live Selfie */}
            <div
              onClick={() => setActiveModal('selfie')}
              className="p-4 bg-white border border-[#E8E4DC] hover:border-[#B85A3C]/50 rounded-2xl flex items-center justify-between cursor-pointer transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-[#1A1816] block">
                    Live Selfie
                  </span>
                  <span className="text-xs text-[#6B665F]">
                    Front-facing camera capture
                  </span>
                </div>
              </div>

              {hasSelfie ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2C6B56] bg-[#2C6B56]/10 px-2.5 py-1 rounded-full border border-[#2C6B56]/20">
                  <Check className="w-3.5 h-3.5" />
                  <span>Captured</span>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border border-[#E8E4DC] bg-white flex items-center justify-center text-xs" />
              )}
            </div>
          </div>

          {/* Verification Status Card */}
          <div className="p-4 bg-[#F7F5F0] border border-[#E8E4DC] rounded-xl mb-4 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-[#1A1816]">Verification Status</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B85A3C] bg-[#F5EAE5] px-2.5 py-0.5 rounded-full border border-[#E8D5CD]">
                <Clock className="w-3 h-3" />
                <span>Pending submission</span>
              </span>
            </div>
            <p className="text-xs text-[#6B665F] leading-relaxed">
              A human reviewer confirms your identity within 24 hours. Verification confirms authentic profiles while safeguarding your privacy.
            </p>
          </div>

          {/* Zero-storage reassurance */}
          <div className="flex items-center gap-3 text-xs text-[#6B665F] bg-[#F7F5F0]/60 p-3.5 rounded-xl border border-[#E8E4DC]">
            <Lock className="w-4 h-4 text-[#2A3A2C] shrink-0" />
            <span>Your ID and selfie are encrypted and purged the moment a verification decision is recorded.</span>
          </div>

          {submitError && (
            <div className="mt-3 p-3 rounded-xl bg-[#9B2C2C]/10 border border-[#9B2C2C]/20 text-xs text-[#9B2C2C] font-medium">
              {submitError}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-6">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !hasId || !hasSelfie}
            className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99]"
          >
            {submitting ? 'Submitting for review…' : 'Submit for Verification'}
          </button>
        </div>
      </div>

      {/* Modal: ID Upload */}
      {activeModal === 'id' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-[#E8E4DC] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                Upload Government ID
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-full text-[#6B665F] hover:bg-[#F7F5F0] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#6B665F] mb-4 leading-relaxed font-['Plus_Jakarta_Sans',sans-serif]">
              Select your document type, add its number (masked for reviewers), then capture or upload a clear photo.
            </p>

            <div className="space-y-2.5 mb-4">
              {[
                { id: 'NIN', label: 'National Identification Number (NIN Slip / Card)' },
                { id: 'Passport', label: 'Nigerian International Passport' },
                { id: 'ServiceID', label: 'Official Service / Professional ID' }
              ].map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDoc(doc.id as typeof selectedDoc)}
                  className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between text-xs sm:text-sm ${
                    selectedDoc === doc.id
                      ? 'border-[#B85A3C] bg-[#F5EAE5]/60 text-[#1A1816] font-semibold'
                      : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/40'
                  }`}
                >
                  <span>{doc.label}</span>
                  {selectedDoc === doc.id && <Check className="w-4 h-4 text-[#B85A3C]" />}
                </button>
              ))}
            </div>

            <input
              type="text"
              inputMode="numeric"
              placeholder="Document number (stored masked)"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value.replace(/\s/g, '').slice(0, 20))}
              className="w-full mb-4 py-2.5 px-3.5 rounded-xl border border-[#E8E4DC] text-xs sm:text-sm text-[#1A1816] outline-none focus:border-[#B85A3C] focus:ring-2 focus:ring-[#B85A3C]/20 font-['Plus_Jakarta_Sans',sans-serif] bg-[#F7F5F0]/40"
            />

            <input
              id="wassaa-id-file"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIdFile(f); }}
            />
            <button
              type="button"
              onClick={() => { setIsScanningId(true); document.getElementById('wassaa-id-file')?.click(); }}
              disabled={isScanningId}
              className="w-full py-3.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {isScanningId ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Opening camera…</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>{hasId ? 'Replace ID Photo' : 'Capture / Upload ID Photo'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Modal: Live Selfie */}
      {activeModal === 'selfie' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-[#E8E4DC] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] max-w-md w-full text-center">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                Live Selfie
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-full text-[#6B665F] hover:bg-[#F7F5F0] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative w-32 h-32 mx-auto rounded-full overflow-hidden border-2 border-[#B85A3C] mb-4 bg-[#F7F5F0]">
              {selfieDataUrl ? (
                <img
                  src={selfieDataUrl}
                  alt="Your selfie"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Camera className="absolute inset-0 m-auto w-10 h-10 text-[#9C958D]" />
              )}
              {isCapturingSelfie && (
                <div className="absolute inset-0 bg-[#B85A3C]/20 animate-pulse" />
              )}
            </div>

            <div className="mb-5">
              <span className="text-sm font-semibold text-[#1A1816] block mb-1">
                {selfieStage === 'look' && 'Look directly at the camera'}
                {selfieStage === 'turn' && 'Turn head slightly to the right'}
                {selfieStage === 'smile' && 'Smile slightly to confirm liveness'}
                {selfieStage === 'complete' && '✓ Selfie captured'}
              </span>
              <span className="text-xs text-[#6B665F]">
                The reviewer compares your selfie against your ID photo.
              </span>
            </div>

            <input
              id="wassaa-selfie-file"
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSelfieFile(f); }}
            />
            <button
              type="button"
              onClick={() => {
                setIsCapturingSelfie(true);
                setSelfieStage('look');
                document.getElementById('wassaa-selfie-file')?.click();
              }}
              disabled={isCapturingSelfie}
              className="w-full py-3.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {isCapturingSelfie ? 'Capturing live selfie…' : (selfieDataUrl ? 'Retake Selfie' : 'Capture Selfie')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
