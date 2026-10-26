import React, { useState } from 'react';
import { 
  ChevronLeft, 
  Search, 
  Shield, 
  Heart, 
  GraduationCap, 
  Wrench, 
  Briefcase, 
  MoreHorizontal,
  Check
} from 'lucide-react';
import { ProfessionCategory } from '../../types';

export interface ProfessionSelectionScreenProps {
  onBack: () => void;
  onNext: (category: ProfessionCategory, isUniformed: boolean) => void;
}

export const ProfessionSelectionScreen: React.FC<ProfessionSelectionScreenProps> = ({
  onBack,
  onNext
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ProfessionCategory>('Military');
  const [searchQuery, setSearchQuery] = useState('');

  const professions: { id: ProfessionCategory; label: string; icon: React.ComponentType<{ className?: string }>; isUniform: boolean }[] = [
    { id: 'Military', label: 'Military', icon: Shield, isUniform: true },
    { id: 'Police', label: 'Police', icon: Shield, isUniform: true },
    { id: 'Paramilitary', label: 'Paramilitary', icon: Shield, isUniform: true },
    { id: 'Healthcare', label: 'Healthcare & Medicine', icon: Heart, isUniform: false },
    { id: 'Education', label: 'Education & Academia', icon: GraduationCap, isUniform: false },
    { id: 'Engineering', label: 'Engineering & Tech', icon: Wrench, isUniform: false },
    { id: 'Business & Entrepreneurship', label: 'Business & Entrepreneurship', icon: Briefcase, isUniform: false },
    { id: 'Others', label: 'Other Fields', icon: MoreHorizontal, isUniform: false }
  ];

  const filtered = professions.filter((p) =>
    p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (category: ProfessionCategory) => {
    setSelectedCategory(category);
  };

  const handleProceed = () => {
    const isUniform = ['Military', 'Police', 'Paramilitary'].includes(selectedCategory);
    onNext(selectedCategory, isUniform);
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
              Step 2 of 4
            </span>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-semibold text-[#1A1816] leading-tight">
              What do you do?
            </h1>
            <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B665F] mt-2 leading-relaxed">
              Select your primary field to shape your profile and discovery experience.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative mb-5">
            <Search className="w-4 h-4 text-[#9C958D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search profession…"
              className="w-full pl-10 pr-4 py-2.5 bg-[#F7F5F0]/60 border border-[#E8E4DC] rounded-xl text-xs sm:text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-2 focus:ring-[#B85A3C]/20 transition-all font-['Plus_Jakarta_Sans',sans-serif]"
            />
          </div>

          {/* Profession List / Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {filtered.map((item) => {
              const Icon = item.icon;
              const isSelected = selectedCategory === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-[#B85A3C] bg-[#F5EAE5]/60 shadow-[0_2px_8px_rgba(184,90,60,0.08)]'
                      : 'border-[#E8E4DC] bg-white hover:border-[#B85A3C]/40 hover:bg-[#FDFBF7]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[#B85A3C] text-white'
                          : 'bg-[#F7F5F0] text-[#6B665F]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm font-semibold text-[#1A1816] truncate block">
                        {item.label}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'border-[#B85A3C] bg-[#B85A3C] text-white'
                        : 'border-[#E8E4DC] bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleProceed}
            className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-semibold text-sm transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
