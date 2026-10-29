import { useState } from 'react';
import { ShieldCheck, Send } from 'lucide-react';
import { UserProfile } from '../../types';

interface AppealScreenProps {
  user: UserProfile;
  busy?: boolean;
  onSubmit: (note: string) => Promise<void>;
  onSignOut: () => void;
}

/**
 * Shown when an account has been restricted or banned (KB §18D). The member
 * reads the stored reason, explains their side, and submits an appeal that an
 * admin reviews in the console (grant reinstates the account).
 */
export function AppealScreen({ user, busy, onSubmit, onSignOut }: AppealScreenProps) {
  const [note, setNote] = useState('');
  const restricted = user.accountStatus === 'restricted';
  const submitting = Boolean(busy);

  const submit = () => {
    const text = note.trim();
    if (text.length < 10 || submitting) return;
    void onSubmit(text);
  };

  return (
    <div className="w-full max-w-[430px] mx-auto px-5 py-8 flex flex-col gap-5 min-h-[100dvh]">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-[#F0E5DC] flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-[#B85A3C]" />
        </div>
        <div>
          <h1 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
            {restricted ? 'Your account is restricted' : 'Your account is suspended'}
          </h1>
          <p className="text-xs text-[#6B665F]">You can still read this and appeal.</p>
        </div>
      </div>

      {user.restrictionReason && (
        <div className="card card-pad">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#6B665F] mb-1">Reason given</p>
          <p className="text-sm text-[#1A1816] leading-relaxed">{user.restrictionReason}</p>
        </div>
      )}

      <div className="card card-pad flex flex-col gap-3">
        <label htmlFor="appeal-note" className="text-sm font-semibold text-[#1A1816]">
          Tell us what happened
        </label>
        <p className="text-xs text-[#6B665F] -mt-1">
          Be honest and specific. A member of our safety team reads every appeal.
        </p>
        <textarea
          id="appeal-note"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 1000))}
          rows={5}
          placeholder="Explain why this was a misunderstanding, or what changed…"
          className="w-full rounded-2xl border border-[#E8D9CE] bg-[#FBFAF7] px-4 py-3 text-sm text-[#1A1816] placeholder:text-[#A9A29A] focus:outline-none focus:border-[#B85A3C]"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#6B665F]">{note.trim().length}/1000 · min 10</span>
          <button
            type="button"
            onClick={submit}
            disabled={note.trim().length < 10 || submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#B85A3C] text-white text-xs font-semibold disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting…' : 'Submit appeal'}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="self-center text-xs text-[#6B665F] underline mt-auto pb-4"
      >
        Sign out
      </button>
    </div>
  );
}
