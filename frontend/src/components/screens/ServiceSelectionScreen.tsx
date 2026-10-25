import React, { useState } from 'react';
import { ChevronLeft, Check, Shield } from 'lucide-react';
import { UniformedService } from '../../types';

export interface ServiceSelectionScreenProps {
  onBack: () => void;
  onNext: (service: UniformedService) => void;
}

export const ServiceSelectionScreen: React.FC<ServiceSelectionScreenProps> = ({
  onBack,
  onNext
}) => {
  const [selectedService, setSelectedService] = useState<UniformedService>('Nigerian Army');

  const services: { id: UniformedService; label: string; subtitle: string; code: string }[] = [
    { id: 'Nigerian Army', label: 'Nigerian Army', subtitle: 'Land defense & security', code: 'NA' },
    { id: 'Nigerian Navy', label: 'Nigerian Navy', subtitle: 'Maritime defense & coastal security', code: 'NN' },
    { id: 'Nigerian Air Force', label: 'Nigerian Air Force', subtitle: 'Aviation & aerospace defense', code: 'NAF' },
    { id: 'Nigerian Police Force', label: 'Nigeria Police Force', subtitle: 'Law enforcement & community safety', code: 'NPF' },
    { id: 'NSCDC', label: 'Civil Defence (NSCDC)', subtitle: 'Public safety & infrastructure protection', code: 'NSCDC' },
    { id: 'FRSC', label: 'Federal Road Safety (FRSC)', subtitle: 'Highway administration & road safety', code: 'FRSC' },
    { id: 'Immigration', label: 'Nigeria Immigration (NIS)', subtitle: 'Border governance & migration control', code: 'NIS' },
    { id: 'Customs', label: 'Nigeria Customs Service', subtitle: 'Trade management & border revenue', code: 'NCS' }
  ];

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
              Step 3 of 4
            </span>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-semibold text-[#1A1816] leading-tight">
              Select your branch
            </h1>
            <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-[#6B665F] mt-2 leading-relaxed">
              Choose a service branch to describe your background. This selection is self-reported and is not independently verified.
            </p>
          </div>

          {/* Services Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
            {services.map((s) => {
              const isSelected = selectedService === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedService(s.id)}
                  className={`p-4 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'border-[#B85A3C] bg-[#F5EAE5]/60 shadow-[0_2px_8px_rgba(184,90,60,0.08)]'
                      : 'border-[#E8E4DC] bg-white hover:border-[#B85A3C]/40 hover:bg-[#FDFBF7]'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-[#B85A3C] text-white'
                          : 'bg-[#F7F5F0] text-[#2A3A2C]'
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-semibold text-[#1A1816] block">
                          {s.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#6B665F] block mt-0.5 line-clamp-1 leading-normal font-['Plus_Jakarta_Sans',sans-serif]">
                        {s.subtitle}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
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
            onClick={() => onNext(selectedService)}
            className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-semibold text-sm transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
