import React, { useState } from 'react';
import { ChevronLeft, Camera, Plus, X } from 'lucide-react';

interface ProfileSetupScreenProps {
  onBack: () => void;
  onNext: (data: { name: string; bio: string; interests: string[] }) => void;
}

export const ProfileSetupScreen: React.FC<ProfileSetupScreenProps> = ({
  onBack,
  onNext
}) => {
  const [name, setName] = useState('Chinwe');
  const [bio, setBio] = useState("Kind heart, big dreams. Let's build something real.");
  const [interests, setInterests] = useState(['Travel', 'Good Food', 'Fitness']);
  const [newTag, setNewTag] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);

  const handleAddTag = () => {
    if (newTag.trim() && !interests.includes(newTag.trim())) {
      setInterests([...interests, newTag.trim()]);
      setNewTag('');
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setInterests(interests.filter((t) => t !== tag));
  };

  return (
    <div className="w-full screen-center">
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
            <span className="font-['Space_Mono',monospace] text-[0.8125rem] uppercase tracking-wider text-[#9C958D]">
              Step 4 of 4
            </span>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-semibold text-[#1A1816] leading-tight">
              Set up your profile
            </h1>
            <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B665F] mt-2 leading-relaxed">
              Add a few details to help us find meaningful connections and genuine matches.
            </p>
          </div>

          {/* Avatar Upload with Camera Badge */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <img
                src="/src/assets/images/nigerian_police_officer_1792268560885.jpg"
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-2 border-[#E8E4DC] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                aria-label="Upload photo"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#B85A3C] text-white flex items-center justify-center shadow-md hover:bg-[#A04E33] transition-colors border-2 border-white"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Form Inputs */}
          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-[#1A1816] block mb-2 font-['Plus_Jakarta_Sans',sans-serif]">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#F7F5F0]/50 border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] font-medium focus:outline-none focus:border-[#B85A3C] focus:ring-2 focus:ring-[#B85A3C]/20 transition-all font-['Plus_Jakarta_Sans',sans-serif]"
                placeholder="Your name"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-[#1A1816] font-['Plus_Jakarta_Sans',sans-serif]">
                  Bio
                </label>
                <span className="font-['Space_Mono',monospace] text-[0.8125rem] text-[#9C958D]">
                  {bio.length}/150
                </span>
              </div>
              <textarea
                rows={3}
                maxLength={150}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#F7F5F0]/50 border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] leading-relaxed focus:outline-none focus:border-[#B85A3C] focus:ring-2 focus:ring-[#B85A3C]/20 transition-all resize-none font-['Plus_Jakarta_Sans',sans-serif]"
                placeholder="Tell potential matches a little about yourself…"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#1A1816] block mb-2 font-['Plus_Jakarta_Sans',sans-serif]">
                Interests & Passions
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {interests.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-full bg-[#F5EAE5] text-[#B85A3C] text-xs font-semibold flex items-center gap-1.5 border border-[#E8D5CD] transition-colors"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-[#9B2C2C] transition-colors"
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}

                {isAddingTag ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Add tag…"
                      className="w-28 px-3 py-1 text-xs bg-white border border-[#B85A3C] rounded-full outline-none text-[#1A1816] focus:ring-2 focus:ring-[#B85A3C]/20 font-['Plus_Jakarta_Sans',sans-serif]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="p-1.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white transition-colors"
                      aria-label="Confirm tag"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingTag(false); setNewTag(''); }}
                      className="p-1.5 rounded-full text-[#6B665F] hover:bg-[#F7F5F0] transition-colors"
                      aria-label="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingTag(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-[#E8E4DC] text-[#6B665F] text-xs font-medium hover:border-[#B85A3C] hover:text-[#B85A3C] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Interest</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-6">
          <button
            type="button"
            onClick={() => onNext({ name, bio, interests })}
            className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-semibold text-sm transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
