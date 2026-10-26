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
  Unlock 
} from 'lucide-react';
import { UserProfile, ChatMessage } from '../../types';
import { BlockReportModal, ReportCategoryKey } from '../chat/BlockReportModal';

interface ChatScreenProps {
  partner: UserProfile;
  currentUserId: string;
  messages: ChatMessage[];
  isBlocked?: boolean;
  onBack: () => void;
  onSendMessage: (text: string) => Promise<boolean> | boolean | void;
  onSendPhoto: (file: File) => void;
  onBlockUser?: (partner: UserProfile, reason: string) => Promise<void> | void;
  onReportUser?: (params: {
    category: ReportCategoryKey;
    categoryLabel: string;
    details: string;
    alsoBlock: boolean;
  }) => Promise<void> | void;
  onUnblockUser?: (partner: UserProfile) => Promise<void> | void;
  onViewProfile?: (partner: UserProfile) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  partner,
  currentUserId,
  messages,
  isBlocked = false,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
      await onReportUser(params);
    }
    setSafetyToast(
      params.alsoBlock 
        ? `Report filed. ${partner.name} has been blocked.` 
        : `Safety report submitted.`
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
    <div className="w-full h-[calc(100dvh-9.5rem)] min-h-[24rem] flex flex-col bg-[#F7F5F0] text-[#1A1816] rounded-2xl border border-[#E8E4DC] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] overflow-hidden relative font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Clean Chat Header */}
      <div className="bg-white border-b border-[#E8E4DC] px-4 py-3 flex items-center justify-between relative z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-11 h-11 -ml-2 flex items-center justify-center text-[#1A1816] hover:bg-[#F5EAE5] rounded-full"
            title="Back to matches"
            aria-label="Back to matches"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div 
            onClick={() => onViewProfile && onViewProfile(partner)}
            className="relative cursor-pointer group shrink-0"
          >
            <img
              src={partner.photos[0]}
              alt={partner.name}
              className="w-10 h-10 rounded-full object-cover ring-1 ring-[#E8E4DC] group-hover:opacity-90 transition-opacity"
              referrerPolicy="no-referrer"
            />
            {!localBlocked && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#2C6B56] ring-2 ring-white" />
            )}
          </div>

          <div 
            onClick={() => onViewProfile && onViewProfile(partner)}
            className="cursor-pointer min-w-0"
          >
            <h3 className="text-sm font-semibold text-[#1A1816] truncate">
              {partner.name}
            </h3>
            <div className="text-[0.8125rem] text-[#6B665F]">
              {localBlocked ? (
                <span className="text-[#9B2C2C] font-medium flex items-center gap-1">
                  <UserX className="w-3 h-3 inline" /> Blocked contact
                </span>
              ) : (
                <span className="text-[#6B665F] font-medium">Matched with you</span>
              )}
            </div>
          </div>
        </div>

        {/* Safety & Action Menu */}
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-[#6B665F] hover:text-[#1A1816] hover:bg-[#F5EAE5] rounded-full transition-colors cursor-pointer"
            title="Chat options & safety"
            aria-label="Chat options & safety"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Action Menu Dropdown */}
          {showMenu && (
            <div className="absolute right-0 top-11 w-56 bg-white rounded-xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] p-1.5 z-30 animate-fade-in text-xs">
              <div className="px-3 py-2 border-b border-[#E8E4DC] flex items-center gap-2 text-[#6B665F]">
                <ShieldCheck className="w-4 h-4 text-[#B85A3C]" />
                <span className="text-[0.8125rem] font-semibold text-[#1A1816]">Safety & Controls</span>
              </div>

              {onViewProfile && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    onViewProfile(partner);
                  }}
                  className="w-full px-3 py-2 text-left rounded-lg hover:bg-[#F5EAE5] transition-colors flex items-center gap-2 text-[#1A1816] cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5 text-[#6B665F]" />
                  <span>View Full Profile</span>
                </button>
              )}

              {localBlocked ? (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleUnblock();
                  }}
                  className="w-full px-3 py-2 text-left rounded-lg hover:bg-[#2C6B56]/10 transition-colors flex items-center gap-2 text-[#2C6B56] font-medium cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unblock {partner.name}</span>
                </button>
              ) : (
                <button
                  onClick={handleOpenBlock}
                  className="w-full px-3 py-2 text-left rounded-lg hover:bg-[#F7F5F0] transition-colors flex items-center gap-2 text-[#1A1816] cursor-pointer"
                >
                  <UserX className="w-3.5 h-3.5 text-[#6B665F]" />
                  <span>Block User</span>
                </button>
              )}

              <button
                onClick={handleOpenReport}
                className="w-full px-3 py-2 text-left rounded-lg hover:bg-[#9B2C2C]/10 transition-colors flex items-center gap-2 text-[#9B2C2C] font-semibold cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Report Contact</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Safety Notification Toast */}
      {safetyToast && (
        <div className="absolute top-16 left-4 right-4 z-40 bg-[#1A1816] text-[#F7F5F0] p-3 rounded-xl text-xs font-medium shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] flex items-center gap-2.5 border border-[#E8E4DC]/20 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#2C6B56] shrink-0" />
          <span className="flex-1">{safetyToast}</span>
        </div>
      )}

      {/* Blocked Contact Warning Banner */}
      {localBlocked && (
        <div className="bg-[#9B2C2C]/10 border-b border-[#9B2C2C]/20 px-4 py-2.5 flex items-center justify-between text-xs text-[#9B2C2C] z-10">
          <div className="flex items-center gap-2">
            <UserX className="w-4 h-4 text-[#9B2C2C] shrink-0" />
            <span className="text-[0.8125rem] font-medium leading-tight">
              You have blocked this contact. Communication is suspended.
            </span>
          </div>
          <button
            onClick={handleUnblock}
            className="text-[0.8125rem] font-semibold text-[#9B2C2C] hover:underline shrink-0 ml-2 cursor-pointer"
          >
            Unblock
          </button>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5 bg-[#F7F5F0]">
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;

          // Voice notes are not supported by the current send API. Older stored
          // rows remain visible without pretending the waveform is playable.
          if (msg.voice) {
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="max-w-[78%] rounded-2xl border border-[#E8E4DC] bg-white px-4 py-2.5 text-xs text-[#6B665F]">
                  Voice messages are not available in this version.
                </div>
                <span className="text-[0.75rem] text-[#9C958D] mt-1 font-['Space_Mono',monospace] tracking-wider uppercase">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            );
          }

          // Media photo bubble
          if (msg.mediaUrl) {
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div 
                  onClick={() => msg.mediaUrl && setPreviewMedia(msg.mediaUrl)}
                  className="rounded-2xl overflow-hidden border border-[#E8E4DC] max-w-[260px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] cursor-pointer hover:opacity-95 transition-opacity"
                >
                  <img
                    src={msg.mediaUrl}
                    alt="Shared media"
                    className="w-full h-40 object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {msg.caption && (
                    <p className="p-3 text-xs text-[#1A1816] leading-relaxed">
                      {msg.caption}
                    </p>
                  )}
                </div>
                <span className="text-[0.75rem] text-[#9C958D] mt-1 font-['Space_Mono',monospace] tracking-wider uppercase">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            );
          }

          // Regular text bubble
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${
                  isMe
                    ? 'bg-[#B85A3C] text-white rounded-br-none'
                    : 'bg-[#F0ECE6] border border-[#E8E4DC] text-[#1A1816] rounded-tl-none'
                }`}
              >
                <p>{msg.text}</p>
              </div>
              <span className="text-[0.75rem] text-[#9C958D] mt-1 font-['Space_Mono',monospace] tracking-wider uppercase">
                {formatTime(msg.createdAt)}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Clean Input Bar or Blocked State Bar */}
      {localBlocked ? (
        <div className="bg-[#F7F5F0] border-t border-[#E8E4DC] p-4 text-center">
          <p className="text-xs text-[#6B665F] mb-2 font-medium">
            You cannot send messages to this contact while blocked.
          </p>
          <button
            onClick={handleUnblock}
            className="px-4 py-1.5 rounded-full bg-white border border-[#E8E4DC] hover:bg-[#F5EAE5] text-xs font-semibold text-[#1A1816] transition-colors cursor-pointer"
          >
            Unblock Contact
          </button>
        </div>
      ) : (
        <div className="bg-white border-t border-[#E8E4DC] p-3 md:p-4 flex items-center gap-2">
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
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 bg-[#F7F5F0] border border-[#E8E4DC] rounded-full text-xs text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C] transition-colors"
          />

          <button
            onClick={() => photoInputRef.current?.click()}
            className="p-2.5 text-[#6B665F] hover:text-[#B85A3C] hover:bg-[#F5EAE5] rounded-full transition-colors cursor-pointer"
            title="Send a private photo"
            aria-label="Send photo"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-sm cursor-pointer ${
              inputText.trim() && !sending
                ? 'bg-[#B85A3C] hover:bg-[#A04E33] text-white'
                : 'bg-[#E8E4DC] text-[#9C958D] cursor-not-allowed'
            }`}
            title="Send message"
            aria-label="Send message"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      )}

      {/* Media Fullscreen Lightbox Modal */}
      {previewMedia && (
        <div 
          onClick={() => setPreviewMedia(null)}
          className="fixed inset-0 z-50 bg-[#1A1816]/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-lg w-full bg-[#1A1816] rounded-2xl overflow-hidden border border-[#E8E4DC]/20 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)]">
            <img
              src={previewMedia}
              alt="Enlarged media"
              className="w-full h-auto max-h-[75dvh] object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="p-4 bg-[#1A1816] text-[#F7F5F0] flex justify-between items-center text-xs">
              <span className="text-[#9C958D]">Shared photo preview</span>
              <button
                onClick={() => setPreviewMedia(null)}
                className="px-3.5 py-1.5 bg-white/15 hover:bg-white/25 rounded-full font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block & Report Confirmation Modal */}
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
