import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  MoreVertical,
  Paperclip,
  Send,
  ShieldAlert,
  UserX,
  ShieldCheck,
  Info,
  CheckCircle2,
  Unlock,
  Coins
} from 'lucide-react';
import { UserProfile, ChatMessage } from '../../types';
import { BlockReportModal, ReportCategoryKey } from '../chat/BlockReportModal';
import { VerifiedMark } from '../common/VerifiedMark';
import { PhotoViewer } from '../common/PhotoViewer';
import { nameLine } from '../../lib/profile-display';

interface ChatScreenProps {
  partner: UserProfile;
  currentUserId: string;
  messages: ChatMessage[];
  isBlocked?: boolean;
  /** Current credit balance — drives the per-message cost hint. */
  credits?: number;
  onOpenStore?: () => void;
  onBack: () => void;
  onSendMessage: (text: string) => Promise<boolean> | boolean | void;
  onSendPhoto: (file: File) => void;
  onBlockUser?: (partner: UserProfile, reason: string) => Promise<void> | void;
  onReportUser?: (params: {
    category: ReportCategoryKey;
    categoryLabel: string;
    details: string;
    alsoBlock: boolean;
    messageId?: string;
  }) => Promise<void> | void;
  onUnblockUser?: (partner: UserProfile) => Promise<void> | void;
  onViewProfile?: (partner: UserProfile) => void;
}

/**
 * A conversation is its own surface: it takes the whole screen (no dock, no
 * card chrome inside a padded shell), with one back affordance to the
 * messages overview. Header and composer stay pinned; only the thread scrolls.
 */
export const ChatScreen: React.FC<ChatScreenProps> = ({
  partner,
  currentUserId,
  messages,
  isBlocked = false,
  credits,
  onOpenStore,
  onBack,
  onSendMessage,
  onSendPhoto,
  onBlockUser,
  onReportUser,
  onUnblockUser,
  onViewProfile
}) => {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [modalMode, setModalMode] = useState<'report' | 'block'>('report');
  const [localBlocked, setLocalBlocked] = useState(isBlocked);
  const [safetyToast, setSafetyToast] = useState<string | null>(null);
  // Message held down for reporting ("hold to report", KB §18D).
  const [heldMessageId, setHeldMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<number | null>(null);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  useEffect(() => {
    setLocalBlocked(isBlocked);
  }, [isBlocked]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (localBlocked || !text || sending) return;
    setSending(true);
    try {
      const result = await onSendMessage(text);
      if (result !== false) setInputText('');
    } finally {
      setSending(false);
    }
  };

  const handleOpenReport = () => {
    setShowMenu(false);
    setModalMode('report');
    setShowBlockModal(true);
  };

  // ---- Hold-to-report (long press on a received message bubble) ----
  const startHold = (messageId: string) => {
    endHold();
    holdTimerRef.current = window.setTimeout(() => {
      navigator.vibrate?.(12);
      setHeldMessageId(messageId);
      setModalMode('report');
      setShowBlockModal(true);
    }, 550);
  };
  const endHold = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };
  useEffect(() => () => endHold(), []);
  /** Press handlers for received bubbles: hold reports, tap opens media. */
  const receivedHoldProps = (messageId: string) => ({
    onPointerDown: () => startHold(messageId),
    onPointerUp: endHold,
    onPointerLeave: endHold,
    onPointerCancel: endHold,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault()
  });

  const handleOpenBlock = () => {
    setShowMenu(false);
    setModalMode('block');
    setShowBlockModal(true);
  };

  const handleReportAndBlockSubmit = async (params: {
    category: ReportCategoryKey;
    categoryLabel: string;
    details: string;
    alsoBlock: boolean;
  }) => {
    if (params.alsoBlock) {
      setLocalBlocked(true);
    }
    if (onReportUser) {
      await onReportUser({ ...params, messageId: heldMessageId ?? undefined });
    }
    setHeldMessageId(null);
    setSafetyToast(
      params.alsoBlock ? `Report filed. ${partner.name} has been blocked.` : 'Safety report submitted.'
    );
    setTimeout(() => setSafetyToast(null), 3500);
  };

  const handleBlockOnlySubmit = async (reason?: string) => {
    setLocalBlocked(true);
    if (onBlockUser) {
      await onBlockUser(partner, reason || 'Personal boundary');
    }
    setSafetyToast(`${partner.name} has been blocked.`);
    setTimeout(() => setSafetyToast(null), 3500);
  };

  const handleUnblock = async () => {
    setLocalBlocked(false);
    if (onUnblockUser) {
      await onUnblockUser(partner);
    }
    setSafetyToast(`${partner.name} unblocked.`);
    setTimeout(() => setSafetyToast(null), 3000);
  };

  return (
    <div className="flex min-h-0 w-full flex-1 justify-center bg-canvas text-ink">
      <div className="relative flex min-h-0 w-full max-w-[34rem] flex-1 flex-col overflow-hidden bg-canvas sm:border-x sm:border-line">
        {/* Header — the only way back is the overview */}
        <header className="relative z-20 flex items-center gap-2 border-b border-line bg-surface px-2 pb-2.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-brand-tint"
            title="Back to messages"
            aria-label="Back to messages"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => onViewProfile && onViewProfile(partner)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="relative shrink-0">
              <img
                src={partner.photos[0]}
                alt={partner.name}
                className="h-11 w-11 rounded-full object-cover object-[50%_30%] ring-1 ring-line"
                referrerPolicy="no-referrer"
              />
              {!localBlocked && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-verified ring-2 ring-surface" />
              )}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[1rem] font-semibold leading-tight">{nameLine(partner)}</span>
                {partner.verification?.status === 'verified' && <VerifiedMark size={15} />}
              </span>
              <span className="mt-0.5 block text-[0.8125rem] leading-tight text-ink-soft">
                {localBlocked ? (
                  <span className="flex items-center gap-1 font-medium text-danger">
                    <UserX className="h-3.5 w-3.5" /> Blocked
                  </span>
                ) : (
                  'Matched with you'
                )}
              </span>
            </span>
          </button>

          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-brand-tint hover:text-ink"
              title="Chat options and safety"
              aria-label="Chat options and safety"
              aria-expanded={showMenu}
            >
              <MoreVertical className="h-5 w-5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-12 z-30 w-60 animate-pop rounded-2xl border border-line bg-surface p-1.5 text-[0.9375rem] shadow-raised">
                <p className="px-3 py-2 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Safety
                </p>

                {onViewProfile && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onViewProfile(partner);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-ink transition-colors hover:bg-surface-subtle"
                  >
                    <Info className="h-4 w-4 text-ink-muted" />
                    View profile
                  </button>
                )}

                {localBlocked ? (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleUnblock();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-medium text-verified transition-colors hover:bg-verified-tint"
                  >
                    <Unlock className="h-4 w-4" />
                    Unblock {partner.name}
                  </button>
                ) : (
                  <button
                    onClick={handleOpenBlock}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-ink transition-colors hover:bg-surface-subtle"
                  >
                    <UserX className="h-4 w-4 text-ink-muted" />
                    Block
                  </button>
                )}

                <button
                  onClick={handleOpenReport}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-medium text-danger transition-colors hover:bg-danger-tint"
                >
                  <ShieldAlert className="h-4 w-4" />
                  Report
                </button>
              </div>
            )}
          </div>
        </header>

        {safetyToast && (
          <div className="absolute left-3 right-3 top-[4.75rem] z-40 flex animate-fade-in items-center gap-2.5 rounded-2xl bg-ink px-3.5 py-3 text-[0.8125rem] font-medium text-canvas shadow-raised">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-verified" />
            <span className="flex-1">{safetyToast}</span>
          </div>
        )}

        {localBlocked && (
          <div className="z-10 flex items-center justify-between gap-3 border-b border-danger/20 bg-danger-tint px-4 py-2.5 text-[0.8125rem] text-danger">
            <span className="flex items-center gap-2 font-medium leading-snug">
              <UserX className="h-4 w-4 shrink-0" />
              This contact is blocked. Messaging is paused.
            </span>
            <button onClick={handleUnblock} className="shrink-0 font-semibold underline">
              Unblock
            </button>
          </div>
        )}

        {/* Thread — anchored to the bottom so a short conversation sits just
            above the composer instead of floating at the top of the screen. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-canvas px-4 py-5">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <img
                src={partner.photos[0]}
                alt=""
                className="h-20 w-20 rounded-full object-cover object-[50%_30%] ring-1 ring-line"
                referrerPolicy="no-referrer"
              />
              <p className="mt-4 font-['Cormorant_Garamond',serif] text-2xl font-semibold">
                You matched with {partner.name}
              </p>
              <p className="mt-1.5 max-w-[16rem] text-[0.875rem] leading-relaxed text-ink-soft">
                Say something only you would say. Questions beat compliments.
              </p>
            </div>
          ) : null}

          <div className="mt-auto space-y-4">
            {messages.map((msg) => {
              const isMe = msg.senderId === currentUserId;

              if (msg.voice) {
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="max-w-[78%] rounded-2xl border border-line bg-surface px-4 py-2.5 text-[0.8125rem] text-ink-soft">
                      Voice messages are not available in this version.
                    </div>
                    <span className="mt-1.5 text-[0.6875rem] uppercase tracking-[0.08em] text-ink-muted">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                );
              }

              if (msg.mediaUrl) {
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      onClick={() => msg.mediaUrl && setPreviewMedia(msg.mediaUrl)}
                      {...(!isMe ? receivedHoldProps(msg.id) : {})}
                      title={!isMe ? 'Hold to report' : undefined}
                      className="max-w-[248px] cursor-pointer overflow-hidden rounded-2xl border border-line bg-surface shadow-subtle transition-opacity hover:opacity-95"
                    >
                      <img
                        src={msg.mediaUrl}
                        alt="Shared media"
                        className="h-44 w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      {msg.caption && (
                        <p className="p-3 text-[0.8125rem] leading-relaxed text-ink">{msg.caption}</p>
                      )}
                    </div>
                    <span className="mt-1.5 text-[0.6875rem] uppercase tracking-[0.08em] text-ink-muted">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div
                    {...(!isMe ? receivedHoldProps(msg.id) : {})}
                    title={!isMe ? 'Hold to report' : undefined}
                    className={`max-w-[80%] px-4 py-2.5 text-[0.9375rem] leading-[1.5] shadow-subtle ${
                      isMe
                        ? 'rounded-[1.15rem] rounded-br-md bg-brand text-white'
                        : 'cursor-pointer rounded-[1.15rem] rounded-bl-md border border-line bg-surface text-ink'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  </div>
                  <span className="mt-1.5 text-[0.6875rem] uppercase tracking-[0.08em] text-ink-muted">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        {localBlocked ? (
          <div className="border-t border-line bg-surface px-4 py-4 text-center pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="mb-2.5 text-[0.8125rem] font-medium text-ink-soft">
              You cannot message this contact while they are blocked.
            </p>
            <button type="button" onClick={handleUnblock} className="btn btn-secondary btn-sm">
              Unblock contact
            </button>
          </div>
        ) : (
          <div className="border-t border-line bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {credits === 0 ? (
              <button
                type="button"
                onClick={() => onOpenStore?.()}
                className="flex w-full items-center gap-1.5 px-4 pt-2.5 text-left text-[0.75rem] font-semibold text-brand"
              >
                <Coins className="h-3.5 w-3.5" /> You are out of credits — tap to top up
              </button>
            ) : (
              <p className="flex items-center gap-1.5 px-4 pt-2.5 text-[0.75rem] text-ink-muted">
                <Coins className="h-3.5 w-3.5" /> Each message costs 1 credit
                {typeof credits === 'number' ? ` · ${credits} left` : ''}
              </p>
            )}

            <div className="flex items-center gap-2 p-3">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onSendPhoto(file);
                  event.target.value = '';
                }}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-brand-tint hover:text-brand"
                title="Send a private photo"
                aria-label="Send photo"
              >
                <Paperclip className="h-[1.15rem] w-[1.15rem]" />
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Message…"
                aria-label="Message"
                className="h-12 min-w-0 flex-1 rounded-full border border-line bg-surface-subtle px-4 text-[0.9375rem] text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
              />

              <button
                onClick={handleSend}
                disabled={!inputText.trim() || sending}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${
                  inputText.trim() && !sending
                    ? 'bg-brand text-white hover:bg-brand-dark'
                    : 'bg-surface-subtle text-ink-muted'
                }`}
                title="Send message"
                aria-label="Send message"
              >
                <Send className="h-[1.15rem] w-[1.15rem] -translate-x-px" />
              </button>
            </div>
          </div>
        )}
      </div>

      {previewMedia && (
        <PhotoViewer photos={[previewMedia]} name="Shared photo" onClose={() => setPreviewMedia(null)} />
      )}

      <BlockReportModal
        isOpen={showBlockModal}
        partner={partner}
        initialMode={modalMode}
        onClose={() => setShowBlockModal(false)}
        onSubmitReportAndBlock={handleReportAndBlockSubmit}
        onJustBlockUser={handleBlockOnlySubmit}
      />
    </div>
  );
};
