import React, { useState } from 'react';
import { Camera, Check, CreditCard, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react';
import { WassaaApi } from '../../services/api';

const DOCUMENT_TYPES = [
  { id: 'NIN', label: 'National Identification Number (NIN Slip / Card)' },
  { id: 'Passport', label: 'Nigerian International Passport' },
  { id: 'ServiceID', label: 'Official Service / Professional ID' },
] as const;

interface IdentityCapturePanelProps {
  /** Fires once the review queue accepts the submission. */
  onSubmitted?: () => void;
  /** Server-side state, so a returning member sees their real status instead of the form. */
  status?: 'not_started' | 'pending' | 'verified';
}

/**
 * Government ID + live selfie capture, shared by the onboarding verification
 * step and the Settings "Get verified" screen. Both images go straight to
 * private object storage; only the object keys reach the API.
 */
export const IdentityCapturePanel: React.FC<IdentityCapturePanelProps> = ({ onSubmitted, status = 'not_started' }) => {
  const [hasId, setHasId] = useState(false);
  const [hasSelfie, setHasSelfie] = useState(false);
  const [activeModal, setActiveModal] = useState<'id' | 'selfie' | null>(null);

  const [selectedDoc, setSelectedDoc] = useState<'NIN' | 'Passport' | 'ServiceID'>('NIN');
  const [documentNumber, setDocumentNumber] = useState('');
  const [idDocDataUrl, setIdDocDataUrl] = useState<string | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  // Kept so the original file can be uploaded straight to object storage.
  const [idDocFile, setIdDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isScanningId, setIsScanningId] = useState(false);

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
      setTimeout(() => setActiveModal(null), 700);
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
      setHasId(false);
      setHasSelfie(false);
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const statusPill = (done: boolean, label: string, doneLabel: string) => (
    done ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2C6B56] bg-[#2C6B56]/10 px-2.5 py-1 rounded-full border border-[#2C6B56]/20">
        <Check className="w-3.5 h-3.5" />
        <span>{doneLabel}</span>
      </span>
    ) : (
      <span className="text-xs font-semibold text-[#B85A3C]">{label}</span>
    )
  );

  if (submitted || status === 'pending' || status === 'verified') {
    const verified = status === 'verified';
    return (
      <div className="p-5 rounded-2xl border border-[#2C6B56]/25 bg-[#2C6B56]/5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#2C6B56]/12 text-[#2C6B56] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1A1816]">
              {verified ? "You're verified" : 'Submitted for review'}
            </p>
            <p className="mt-1 text-xs text-[#6B665F] leading-relaxed">
              {verified
                ? 'Your identity badge is active on your profile.'
                : 'A reviewer compares your selfie with your ID, usually within 24 hours. Your documents are purged the moment a decision is recorded.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Government ID */}
        <button
          type="button"
          onClick={() => setActiveModal('id')}
          className="w-full min-h-[68px] p-4 bg-white border border-[#E8E4DC] hover:border-[#B85A3C]/50 active:scale-[0.995] rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-all text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <span className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-xl bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="text-[0.9375rem] font-semibold text-[#1A1816] block">
                Government ID
              </span>
              <span className="text-xs text-[#6B665F] block truncate">
                NIN, Passport or Official ID
              </span>
            </span>
          </span>
          {statusPill(hasId, 'Add', 'Uploaded')}
        </button>

        {/* Live selfie */}
        <button
          type="button"
          onClick={() => setActiveModal('selfie')}
          className="w-full min-h-[68px] p-4 bg-white border border-[#E8E4DC] hover:border-[#B85A3C]/50 active:scale-[0.995] rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition-all text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <span className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-xl bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="text-[0.9375rem] font-semibold text-[#1A1816] block">
                Live selfie
              </span>
              <span className="text-xs text-[#6B665F] block truncate">
                Front-facing camera capture
              </span>
            </span>
          </span>
          {statusPill(hasSelfie, 'Add', 'Captured')}
        </button>
      </div>

      {submitError && (
        <div role="alert" className="mt-3 p-3 rounded-xl bg-[#9B2C2C]/10 border border-[#9B2C2C]/20 text-xs text-[#9B2C2C] font-medium">
          {submitError}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || !hasId || !hasSelfie}
        className="mt-4 w-full min-h-[52px] py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] disabled:bg-[#EFEAE4] disabled:text-[#9C958D] disabled:cursor-not-allowed text-white font-semibold text-[0.9375rem] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.985]"
      >
        {submitting ? 'Submitting for review…' : 'Submit for review'}
      </button>

      {/* Modal: ID upload */}
      {activeModal === 'id' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 border border-[#E8E4DC] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] w-full max-w-lg max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                Upload Government ID
              </h3>
              <button
                type="button"
                aria-label="Close ID upload"
                onClick={() => setActiveModal(null)}
                className="p-2 -mr-1 rounded-full text-[#6B665F] hover:bg-[#F7F5F0] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#6B665F] mb-4 leading-relaxed">
              Select your document type, add its number (masked for reviewers), then capture or upload a clear photo.
            </p>

            <div className="space-y-2.5 mb-4">
              {DOCUMENT_TYPES.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDoc(doc.id)}
                  className={`w-full min-h-[52px] p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 text-[0.8125rem] sm:text-sm ${
                    selectedDoc === doc.id
                      ? 'border-[#B85A3C] bg-[#F5EAE5]/60 text-[#1A1816] font-semibold'
                      : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/40'
                  }`}
                >
                  <span>{doc.label}</span>
                  {selectedDoc === doc.id && <Check className="w-4 h-4 text-[#B85A3C] shrink-0" />}
                </button>
              ))}
            </div>

            <input
              type="text"
              inputMode="numeric"
              placeholder="Document number (stored masked)"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value.replace(/\s/g, '').slice(0, 20))}
              className="w-full min-h-[48px] mb-4 py-3 px-3.5 rounded-xl border border-[#E8E4DC] text-sm text-[#1A1816] outline-none focus:border-[#B85A3C] focus:ring-2 focus:ring-[#B85A3C]/20 bg-[#F7F5F0]/40"
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
              className="w-full min-h-[52px] py-3.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors active:scale-[0.985]"
            >
              {isScanningId ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Opening camera…</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>{hasId ? 'Replace ID photo' : 'Capture / upload ID photo'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Modal: live selfie */}
      {activeModal === 'selfie' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 border border-[#E8E4DC] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] w-full max-w-md text-center max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                Live Selfie
              </h3>
              <button
                type="button"
                aria-label="Close selfie capture"
                onClick={() => setActiveModal(null)}
                className="p-2 -mr-1 rounded-full text-[#6B665F] hover:bg-[#F7F5F0] transition-colors"
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
                {selfieStage === 'turn' && 'Turn your head slightly to the right'}
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
              className="w-full min-h-[52px] py-3.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors active:scale-[0.985]"
            >
              {isCapturingSelfie ? 'Capturing live selfie…' : (selfieDataUrl ? 'Retake selfie' : 'Capture selfie')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
