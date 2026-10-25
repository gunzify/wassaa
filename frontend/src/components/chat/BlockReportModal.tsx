import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Lock, 
  FileWarning, 
  UserX, 
  X, 
  Check, 
  ChevronRight,
  Info,
  Radio
} from 'lucide-react';
import { UserProfile } from '../../types';

export type ReportCategoryKey = 
  | 'opsec_violation' 
  | 'stolen_valor_impersonation' 
  | 'harassment_threats' 
  | 'financial_scam' 
  | 'inappropriate_media' 
  | 'intelligence_solicitation' 
  | 'other';

export interface ReportCategoryOption {
  key: ReportCategoryKey;
  label: string;
  badge: string;
  description: string;
  recommendedForMilitary?: boolean;
}

export const MILITARY_SAFETY_CATEGORIES: ReportCategoryOption[] = [
  {
    key: 'opsec_violation',
    label: 'OPSEC / Military Security Breach',
    badge: 'OPSEC Priority',
    description: 'Soliciting sensitive military deployments, base locations, patrol timetables, radio codes, or tactical ops.',
    recommendedForMilitary: true
  },
  {
    key: 'stolen_valor_impersonation',
    label: 'Impersonation or Stolen Valor',
    badge: 'Integrity',
    description: 'Falsely claiming military/paramilitary branch, forged warrants, fake rank insignia, or unauthorized uniform use.',
    recommendedForMilitary: true
  },
  {
    key: 'intelligence_solicitation',
    label: 'Suspicious Foreign/Intel Inquiries',
    badge: 'Counter-Intel',
    description: 'Unusual questioning regarding defense infrastructure, equipment logistics, or government networks.',
    recommendedForMilitary: true
  },
  {
    key: 'harassment_threats',
    label: 'Threats, Stalking, or Intimidation',
    badge: 'Safety Alert',
    description: 'Hostile conduct, physical threats, stalking around barracks/stations, or blackmail.'
  },
  {
    key: 'financial_scam',
    label: 'Financial Fraud or Extortion',
    badge: 'Scam Risk',
    description: 'Soliciting emergency leave funds, clearance processing money, crypto transfers, or loan scams.'
  },
  {
    key: 'inappropriate_media',
    label: 'Unsolicited Explicit Media or Conduct',
    badge: 'Code of Conduct',
    description: 'Sending explicit, non-consensual imagery, sexual harassment, or severe boundary violation.'
  },
  {
    key: 'other',
    label: 'Other Serious Safety Concern',
    badge: 'General',
    description: 'Any other suspicious behavior compromising member safety or community trust.'
  }
];

export interface BlockReportModalProps {
  isOpen: boolean;
  partner: UserProfile;
  initialMode?: 'report' | 'block';
  onClose: () => void;
  onSubmitReportAndBlock: (params: {
    category: ReportCategoryKey;
    categoryLabel: string;
    details: string;
    alsoBlock: boolean;
  }) => Promise<void> | void;
  onJustBlockUser: (reason?: string) => Promise<void> | void;
}

export const BlockReportModal: React.FC<BlockReportModalProps> = ({
  isOpen,
  partner,
  initialMode = 'report',
  onClose,
  onSubmitReportAndBlock,
  onJustBlockUser
}) => {
  const [activeTab, setActiveTab] = useState<'report' | 'block'>(initialMode);
  const [selectedCategory, setSelectedCategory] = useState<ReportCategoryKey>('opsec_violation');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [blockReason, setBlockReason] = useState('Safety & boundary preference');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  if (!isOpen) return null;

  const handleConfirmReport = async () => {
    setIsSubmitting(true);
    try {
      const categoryItem = MILITARY_SAFETY_CATEGORIES.find((c) => c.key === selectedCategory);
      await onSubmitReportAndBlock({
        category: selectedCategory,
        categoryLabel: categoryItem?.label || 'Security Report',
        details,
        alsoBlock
      });
      setDoneMessage(
        alsoBlock
          ? `Report filed with Safety & OPSEC Integrity Desk. ${partner.name} has been blocked.`
          : `Report filed with Safety & OPSEC Integrity Desk for investigation.`
      );
      setIsDone(true);
      setTimeout(() => {
        setIsDone(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const handleConfirmBlockOnly = async () => {
    setIsSubmitting(true);
    try {
      await onJustBlockUser(blockReason);
      setDoneMessage(`${partner.name} has been blocked from contacting you.`);
      setIsDone(true);
      setTimeout(() => {
        setIsDone(false);
        onClose();
      }, 1800);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs select-none animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#E5E0D8] flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="bg-[#1F2421] text-white p-4 sm:p-5 flex items-start justify-between relative overflow-hidden">
          <div className="flex items-center gap-3 z-10">
            <div className="w-10 h-10 rounded-2xl bg-[#C25E68]/20 border border-[#C25E68]/40 flex items-center justify-center text-[#E58992]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-['Fraunces',serif] font-bold text-base text-white">
                  Member Safety Center
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#C25E68] text-white">
                  Secure OPSEC
                </span>
              </div>
              <p className="text-[11px] text-neutral-300 mt-0.5">
                Protecting military personnel, uniformed services & civilians
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-neutral-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Profile Bar */}
        <div className="bg-[#F8F5F0] border-b border-[#EBE6DF] px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <img
              src={partner.photos[0]}
              alt={partner.name}
              className="w-8 h-8 rounded-full object-cover ring-1 ring-[#D8D2C7]"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="font-bold text-[#232725]">{partner.name}</span>
              <span className="text-[#646A67] text-[11px] ml-1.5">
                {partner.service || partner.professionCategory}
                {partner.rank ? ` • ${partner.rank}` : ''}
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-[#9EA3A0] uppercase">
            ID: {partner.id.slice(0, 8)}
          </span>
        </div>

        {/* Success confirmation view */}
        {isDone ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <h4 className="font-['Fraunces',serif] text-lg font-bold text-[#232725]">
              Action Confirmed
            </h4>
            <p className="text-xs text-[#646A67] max-w-xs leading-relaxed">
              {doneMessage}
            </p>
          </div>
        ) : (
          <>
            {/* Mode Switch Tabs */}
            <div className="grid grid-cols-2 p-1.5 bg-[#FAF8F5] border-b border-[#EBE6DF] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('report')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'report'
                    ? 'bg-white text-[#C25E68] shadow-xs'
                    : 'text-[#646A67] hover:text-[#232725]'
                }`}
              >
                <FileWarning className="w-3.5 h-3.5" />
                <span>Report & Protect</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('block')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'block'
                    ? 'bg-white text-[#232725] shadow-xs'
                    : 'text-[#646A67] hover:text-[#232725]'
                }`}
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Block User Only</span>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-[#232725]">
              {activeTab === 'report' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#232725] mb-1.5">
                      Select Safety or OPSEC Incident Category:
                    </label>
                    <p className="text-[11px] text-[#646A67] mb-2.5">
                      Categorizing allows the Safety Integrity Desk to triage urgent threats immediately.
                    </p>

                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {MILITARY_SAFETY_CATEGORIES.map((cat) => {
                        const isSelected = selectedCategory === cat.key;
                        return (
                          <div
                            key={cat.key}
                            onClick={() => setSelectedCategory(cat.key)}
                            className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                              isSelected
                                ? 'border-[#C25E68] bg-[#FDF6F7] shadow-xs ring-1 ring-[#C25E68]'
                                : 'border-[#E5E0D8] bg-white hover:bg-[#F8F5F0]'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-[#232725] flex items-center gap-2">
                                <span
                                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                                    isSelected
                                      ? 'border-[#C25E68] bg-[#C25E68] text-white'
                                      : 'border-[#B4ABA1] bg-white'
                                  }`}
                                >
                                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </span>
                                {cat.label}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  cat.recommendedForMilitary
                                    ? 'bg-[#E58992]/20 text-[#9B3944]'
                                    : 'bg-[#E5E0D8] text-[#646A67]'
                                }`}
                              >
                                {cat.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#646A67] leading-relaxed pl-5.5">
                              {cat.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Incident details input */}
                  <div>
                    <label className="block text-xs font-bold text-[#232725] mb-1">
                      Specific Evidence or Context (Optional but Recommended):
                    </label>
                    <textarea
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="E.g., In messages on 17 Oct, this user repeatedly pressed for deployment dates and patrol locations despite warnings..."
                      rows={3}
                      className="w-full p-3 rounded-xl border border-[#E5E0D8] bg-[#FAF8F5] text-xs text-[#232725] placeholder-[#9EA3A0] focus:outline-none focus:border-[#C25E68] focus:bg-white resize-none"
                    />
                  </div>

                  {/* Also Block Checkbox */}
                  <div
                    onClick={() => setAlsoBlock(!alsoBlock)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[#F8F5F0] border border-[#E5E0D8] cursor-pointer hover:bg-[#F1ECE4] transition-colors"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        alsoBlock ? 'bg-[#C25E68] border-[#C25E68] text-white' : 'border-[#9EA3A0] bg-white'
                      }`}
                    >
                      {alsoBlock && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-[#232725]">
                        Simultaneously block {partner.name}
                      </span>
                      <p className="text-[10px] text-[#646A67]">
                        They will immediately lose access to message you or view your profile.
                      </p>
                    </div>
                  </div>

                  {/* Disclaimer banner */}
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex gap-2.5 items-start">
                    <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong>OPSEC Notice:</strong> Reports are confidential. If you suspect an immediate active operational leak or physical threat, alert your Unit Provost Marshal or Security Officer immediately.
                    </p>
                  </div>
                </>
              ) : (
                /* Block Only View */
                <div className="space-y-4 py-2">
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
                    <UserX className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-900">
                        Confirm Blocking {partner.name}
                      </h4>
                      <p className="text-[11px] text-rose-800 mt-1 leading-relaxed">
                        Once blocked, {partner.name} cannot send messages, call, or see your profile. Your active conversation will be closed.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#232725] mb-1.5">
                      Reason for Blocking (Private for your records):
                    </label>
                    <div className="space-y-1.5">
                      {[
                        'Safety & personal boundary preference',
                        'Incompatible intentions or unprofessional tone',
                        'Suspicious activity or discomfort',
                        'No longer interested in communicating'
                      ].map((r) => (
                        <div
                          key={r}
                          onClick={() => setBlockReason(r)}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between ${
                            blockReason === r
                              ? 'border-[#232725] bg-[#F8F5F0] font-semibold text-[#232725]'
                              : 'border-[#E5E0D8] bg-white text-[#646A67]'
                          }`}
                        >
                          <span>{r}</span>
                          {blockReason === r && <Check className="w-4 h-4 text-[#232725]" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-[#9EA3A0] italic">
                    Note: You can review and manage your blocked contacts anytime under Settings &gt; Privacy.
                  </p>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="bg-[#FAF8F5] border-t border-[#EBE6DF] p-3.5 sm:p-4 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-full border border-[#D8D2C7] bg-white hover:bg-[#F3EFEA] text-[#232725] text-xs font-semibold transition-colors"
              >
                Cancel
              </button>

              {activeTab === 'report' ? (
                <button
                  type="button"
                  onClick={handleConfirmReport}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-full bg-[#C25E68] hover:bg-[#B04A55] text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmitting ? (
                    <span className="inline-block animate-spin mr-1">⌛</span>
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  <span>{alsoBlock ? 'Submit Report & Block' : 'Submit Report'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmBlockOnly}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-full bg-[#232725] hover:bg-black text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {isSubmitting ? (
                    <span className="inline-block animate-spin mr-1">⌛</span>
                  ) : (
                    <UserX className="w-3.5 h-3.5" />
                  )}
                  <span>Block {partner.name}</span>
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
