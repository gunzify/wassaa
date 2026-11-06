import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, CreditCard, Image as ImageIcon, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { WassaaApi } from '../../services/api';

/** Uniformed members submit their service ID; civilians pick a government ID. */
const CIVILIAN_DOCUMENT_TYPES = [
  { id: 'NIN', label: 'National ID (NIN slip or card)' },
  { id: 'Passport', label: 'International passport' },
  { id: 'DriversLicense', label: "Driver's licence" },
] as const;
const UNIFORMED_DOCUMENT_TYPES = [
  { id: 'ServiceID', label: 'Military / Force ID' },
] as const;

interface IdentityCapturePanelProps {
  /** Fires once the submission is accepted. */
  onSubmitted?: () => void;
  /** Server-side state, so a returning member sees their real status instead of the form. */
  status?: 'not_started' | 'pending' | 'verified';
  /** Military, paramilitary or law-enforcement member — a force ID is expected. */
  uniformed?: boolean;
}

/**
 * ID + live selfie capture, shared by the onboarding verification step and the
 * Settings "Get verified" screen. The ID is uploaded from the member's
 * gallery; the selfie is taken strictly through the device camera. Both images
 * go straight to private object storage; only the object keys reach the API.
 */
export const IdentityCapturePanel: React.FC<IdentityCapturePanelProps> = ({ onSubmitted, status = 'not_started', uniformed = false }) => {
  const DOCUMENT_TYPES = uniformed ? UNIFORMED_DOCUMENT_TYPES : CIVILIAN_DOCUMENT_TYPES;
  const [hasId, setHasId] = useState(false);
  const [hasSelfie, setHasSelfie] = useState(false);
  const [activeModal, setActiveModal] = useState<'id' | 'selfie' | null>(null);

  const [selectedDoc, setSelectedDoc] = useState<string>(uniformed ? 'ServiceID' : 'NIN');
  const [idDocDataUrl, setIdDocDataUrl] = useState<string | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  // Kept so the original files can be uploaded straight to object storage.
  const [idDocFile, setIdDocFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Strict-camera selfie: getUserMedia + a canvas snap. No file picker.
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const startCamera = async () => {
    if (streamRef.current) return;
    setCameraError(null);
    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setCameraError('Camera unavailable. Allow camera access and try again.');
    } finally {
      setCameraBusy(false);
    }
  };
  useEffect(() => {
    if (activeModal === 'selfie') void startCamera();
    else stopCamera();
    return stopCamera;
  }, [activeModal]);

  const handleIdFile = (file: File) => {
    setIdDocFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setIdDocDataUrl(String(reader.result));
      setHasId(true);
      setActiveModal(null);
    };
    reader.onerror = () => setActiveModal(null);
    reader.readAsDataURL(file);
  };

  const snapSelfie = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      setSelfieFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setSelfieDataUrl(String(reader.result));
        setHasSelfie(true);
        stopCamera();
        setActiveModal(null);
      };
      reader.readAsDataURL(file);
    }, 'image/jpeg', 0.9);
  };

  const handleSubmit = async () => {
    if (!idDocDataUrl || !selfieDataUrl) {
      setSubmitError('Add your ID photo and a live selfie first.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (!idDocFile || !selfieFile) throw new Error('Capture both images again before submitting.');
      const [idDocKey, selfieKey] = await Promise.all([
        WassaaApi.uploadImage('id_doc', idDocFile),
        WassaaApi.uploadImage('selfie', selfieFile)
      ]);
      await WassaaApi.submitVerification({ documentType: selectedDoc, documentNumber: '', idDocKey, selfieKey });

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
              {verified ? "You're verified" : 'Verification submitted'}
            </p>
            <p className="mt-1 text-xs text-[#6B665F] leading-relaxed">
              {verified ? 'Your identity badge is active on your profile.' : 'Your badge appears on your profile once verification completes.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* ID card */}
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
                {uniformed ? 'Service ID' : 'Government ID'}
              </span>
              <span className="text-xs text-[#6B665F] block truncate">
                {uniformed ? 'Military or force ID' : 'National ID, passport or licence'}
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
                Taken with your camera — not uploaded
              </span>
            </span>
          </span>
          {statusPill(hasSelfie, 'Take', 'Captured')}
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
        {submitting ? 'Submitting…' : 'Submit verification'}
      </button>

      {/* Modal: ID upload (gallery) */}
      {activeModal === 'id' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 border border-[#E8E4DC] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] w-full max-w-lg max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                {uniformed ? 'Your service ID' : 'Your ID'}
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

            {DOCUMENT_TYPES.length > 1 && (
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
            )}

            <input
              id="wassaa-id-file"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleIdFile(f); }}
            />
            <button
              type="button"
              onClick={() => document.getElementById('wassaa-id-file')?.click()}
              className="w-full min-h-[52px] py-3.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors active:scale-[0.985]"
            >
              <ImageIcon className="w-4 h-4" />
              <span>{hasId ? 'Choose another photo' : 'Upload from gallery'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal: strict camera selfie */}
      {activeModal === 'selfie' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 sm:p-8 border border-[#E8E4DC] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] w-full max-w-md text-center max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                Live selfie
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

            <div className="relative w-64 max-w-full aspect-[3/4] mx-auto rounded-2xl overflow-hidden border-2 border-[#B85A3C] mb-4 bg-[#F7F5F0]">
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              {cameraBusy && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#F7F5F0]">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#B85A3C]" />
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#F7F5F0] px-6">
                  <Camera className="w-8 h-8 text-[#9C958D]" />
                  <p className="text-xs text-[#6B665F] leading-relaxed">{cameraError}</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => (cameraError ? void startCamera() : snapSelfie())}
              disabled={cameraBusy}
              className="w-full min-h-[52px] py-3.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors active:scale-[0.985] disabled:opacity-60"
            >
              <Camera className="w-4 h-4" />
              {cameraError ? 'Retry camera' : 'Take a selfie'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
