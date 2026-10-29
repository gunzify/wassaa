import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  UserX,
  EyeOff,
  BadgeAlert,
  MessagesSquare,
  Banknote,
  ImageOff,
  Flag,
  X,
  Check,
  CheckCircle2,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { UserProfile } from '../../types';
import { affiliationLine } from '../../lib/profile-display';

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
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Plain-language reasons that make sense to every member — a nurse, a trader,
 * a soldier. Keys are unchanged so existing reports and the admin console keep
 * working; only the words members read have changed.
 */
export const SAFETY_CATEGORIES: ReportCategoryOption[] = [
  {
    key: 'harassment_threats',
    label: 'Harassment or threats',
    description: 'Intimidation, stalking, blackmail, or anything that made you feel unsafe.',
    icon: ShieldAlert
  },
  {
    key: 'stolen_valor_impersonation',
    label: 'Fake profile',
    description: 'Pretending to be someone else, or claiming a job or identity that is not theirs.',
    icon: BadgeAlert
  },
  {
    key: 'financial_scam',
    label: 'Money request or scam',
    description: 'Asking for transfers, emergency funds, crypto, or a “processing fee”.',
    icon: Banknote
  },
  {
    key: 'inappropriate_media',
    label: 'Explicit or unwanted photos',
    description: 'Unsolicited explicit images, sexual content, or pressure to send photos.',
    icon: ImageOff
  },
  {
    key: 'opsec_violation',
    label: 'Sharing my private details',
    description: 'Your address, workplace, unit or schedule — anything you did not offer to share.',
    icon: EyeOff
  },
  {
    key: 'intelligence_solicitation',
    label: 'Suspicious questioning',
    description: 'Persistent questions about security, government systems, or people you know.',
    icon: MessagesSquare
  },
  {
    key: 'other',
    label: 'Something else',
    description: 'Anything that broke trust but does not fit the reasons above.',
    icon: Flag
  }
];

/** @deprecated kept for older imports; use SAFETY_CATEGORIES. */
export const MILITARY_SAFETY_CATEGORIES = SAFETY_CATEGORIES;

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

const BLOCK_REASONS = [
  'Not comfortable',
  'Inappropriate messages',
  'Suspicious behaviour',
  'No longer interested'
];

/**
 * Report or block — one calm column.
 *
 * The old sheet printed all seven reason descriptions at once, which made a
 * safety action feel like a form. Now each reason is a single row and only the
 * chosen one explains itself; the note field and the block switch stay folded
 * away until they are wanted, and the confirmation is its own quiet state.
 */
export const BlockReportModal: React.FC<BlockReportModalProps> = ({
  isOpen,
  partner,
  initialMode = 'report',
  onClose,
  onSubmitReportAndBlock,
  onJustBlockUser
}) => {
  const [activeTab, setActiveTab] = useState<'report' | 'block'>(initialMode);
  const [selectedCategory, setSelectedCategory] = useState<ReportCategoryKey | null>(null);
  const [details, setDetails] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [blockReason, setBlockReason] = useState(BLOCK_REASONS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doneMessage, setDoneMessage] = useState('');

  // Every open starts a clean sheet — a stale reason or block toggle from a
  // previous conversation is the kind of detail that erodes trust.
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialMode);
    setSelectedCategory(null);
    setDetails('');
    setDetailsOpen(false);
    setAlsoBlock(true);
    setBlockReason(BLOCK_REASONS[0]);
    setIsSubmitting(false);
    setDoneMessage('');
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleConfirmReport = async () => {
    if (!selectedCategory) return;
    setIsSubmitting(true);
    try {
      const categoryItem = SAFETY_CATEGORIES.find((c) => c.key === selectedCategory);
      await onSubmitReportAndBlock({
        category: selectedCategory,
        categoryLabel: categoryItem?.label || 'Safety report',
        details,
        alsoBlock
      });
      setDoneMessage(
        alsoBlock
          ? `Our safety team has this. ${partner.name} has been blocked.`
          : 'Our safety team will review this within 24 hours.'
      );
      setTimeout(onClose, 2200);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  const handleConfirmBlockOnly = async () => {
    setIsSubmitting(true);
    try {
      await onJustBlockUser(blockReason);
      setDoneMessage(`${partner.name} can no longer message you or see your profile.`);
      setTimeout(onClose, 1800);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-[3px] sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 28 }}
        transition={{ type: 'spring', stiffness: 460, damping: 38 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Report or block ${partner.name}`}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-line bg-surface text-ink shadow-raised sm:max-w-[26rem] sm:rounded-[1.75rem]"
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line sm:hidden" aria-hidden="true" />

        {doneMessage ? (
          <div className="flex flex-col items-center px-7 pb-12 pt-9 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-verified-tint text-verified">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-['Cormorant_Garamond',serif] text-[1.75rem] font-semibold leading-tight">
              Thank you
            </h3>
            <p className="mt-2 max-w-[19rem] text-[0.9375rem] leading-relaxed text-ink-soft">{doneMessage}</p>
          </div>
        ) : (
          <>
            {/* Who, and the two ways out of this conversation */}
            <div className="shrink-0 px-5 pt-5">
              <div className="flex items-center gap-3">
                {partner.photos?.[0] ? (
                  <img
                    src={partner.photos[0]}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full object-cover object-[50%_30%] ring-1 ring-line"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="h-11 w-11 shrink-0 rounded-full bg-surface-subtle" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[1.0625rem] font-semibold leading-tight">{partner.name}</h3>
                  <p className="truncate text-[0.8125rem] text-ink-muted">{affiliationLine(partner)}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="-mr-1 shrink-0 rounded-full text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-[1.15rem] w-[1.15rem]" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-surface-subtle p-1" role="tablist">
                {(
                  [
                    ['report', 'Report'],
                    ['block', 'Block']
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-full py-2.5 text-[0.875rem] font-semibold transition-colors ${
                      activeTab === tab ? 'bg-surface text-ink shadow-subtle' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2 pt-4">
              {activeTab === 'report' ? (
                <div>
                  <p className="mb-2.5 text-[0.9375rem] font-semibold text-ink">What happened?</p>

                  <div className="overflow-hidden rounded-2xl border border-line">
                    {SAFETY_CATEGORIES.map((category, index) => {
                      const Icon = category.icon;
                      const selected = selectedCategory === category.key;
                      return (
                        <React.Fragment key={category.key}>
                          {index > 0 && <div className="h-px bg-line-soft" />}
                          <button
                            type="button"
                            onClick={() => setSelectedCategory(selected ? null : category.key)}
                            aria-pressed={selected}
                            className={`flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors ${
                              selected ? 'bg-brand-tint/60' : 'bg-surface hover:bg-surface-subtle'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                                selected ? 'bg-brand text-white' : 'bg-surface-subtle text-ink-muted'
                              }`}
                              aria-hidden="true"
                            >
                              <Icon className="h-[0.875rem] w-[0.875rem]" />
                            </span>
                            <span className="min-w-0 flex-1 pt-0.5">
                              <span className="block text-[0.9375rem] font-medium leading-snug text-ink">
                                {category.label}
                              </span>
                              <AnimatePresence initial={false}>
                                {selected && (
                                  <motion.span
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
                                    className="block overflow-hidden"
                                  >
                                    <span className="mt-1 block text-[0.8125rem] leading-relaxed text-ink-soft">
                                      {category.description}
                                    </span>
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </span>
                            <span
                              className={`mt-1 flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full border transition-colors ${
                                selected ? 'border-brand bg-brand text-white' : 'border-line'
                              }`}
                              aria-hidden="true"
                            >
                              {selected && <Check className="h-3 w-3 stroke-[3]" />}
                            </span>
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Note stays folded away until it is wanted */}
                  <div className="mt-3">
                    {detailsOpen ? (
                      <textarea
                        autoFocus
                        value={details}
                        onChange={(e) => setDetails(e.target.value.slice(0, 800))}
                        placeholder="What was said, and when?"
                        rows={3}
                        aria-label="Additional details"
                        className="field resize-none py-3 text-[0.9375rem] leading-relaxed"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDetailsOpen(true)}
                        className="flex w-full items-center justify-between rounded-2xl border border-dashed border-line px-4 py-3 text-left text-[0.875rem] text-ink-soft transition-colors hover:border-ink-muted hover:text-ink"
                      >
                        Add details <span className="text-ink-muted">Optional</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAlsoBlock((v) => !v)}
                    aria-pressed={alsoBlock}
                    className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-surface-subtle px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.875rem] font-medium text-ink">
                        Also block {partner.name.split(' ')[0]}
                      </span>
                      <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-ink-muted">
                        They lose access to you and this conversation. Reversible in Settings.
                      </span>
                    </span>
                    {/* The shared switch component: its knob is a literal white,
                        which the dark-theme generator cannot invert. */}
                    <span className={`switch ${alsoBlock ? 'switch-on' : ''}`} aria-hidden="true">
                      <span className="switch-knob" />
                    </span>
                  </button>

                  <p className="mt-3.5 flex items-start gap-2 text-[0.75rem] leading-relaxed text-ink-muted">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Reports are private. If you are in immediate danger, contact local emergency services.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
                    {partner.name.split(' ')[0]} will no longer be able to message you, and your profile
                    disappears from their discovery. You can undo this from Settings.
                  </p>

                  <p className="mb-2.5 mt-5 text-[0.9375rem] font-semibold text-ink">Mind saying why?</p>
                  <div className="flex flex-wrap gap-2">
                    {BLOCK_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setBlockReason(reason)}
                        aria-pressed={blockReason === reason}
                        className={`chip min-h-0 px-3.5 py-2 text-[0.8125rem] ${
                          blockReason === reason ? 'chip-active' : ''
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[0.75rem] text-ink-muted">Only you see this.</p>
                </div>
              )}
            </div>

            {/* One clear action; cancelling is quiet */}
            <div className="shrink-0 border-t border-line px-5 py-4 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              {activeTab === 'report' ? (
                <button
                  type="button"
                  onClick={handleConfirmReport}
                  disabled={!selectedCategory || isSubmitting}
                  className="btn btn-primary btn-block"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldAlert className="h-4 w-4" />
                  )}
                  {alsoBlock ? 'Report and block' : 'Send report'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmBlockOnly}
                  disabled={isSubmitting}
                  className="btn btn-primary btn-block"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                  Block {partner.name.split(' ')[0]}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="mt-1.5 flex w-full items-center justify-center gap-1 py-2 text-[0.875rem] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};
