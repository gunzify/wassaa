import React, { useState } from 'react';
import { X, SlidersHorizontal, MapPin, Briefcase, Shield, Check } from 'lucide-react';
import { ProfessionCategory, UniformedService } from '../../types';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfession: string;
  currentService: string;
  currentCity: string;
  currentDistance: number;
  onApplyFilters: (filters: {
    profession: string;
    service: string;
    city: string;
    maxDistance: number;
  }) => void;
}

const PROFESSIONS: (ProfessionCategory | 'All')[] = [
  'All',
  'Military',
  'Police',
  'Paramilitary',
  'Healthcare',
  'Education',
  'Engineering',
  'Business & Entrepreneurship',
  'Others'
];

const SERVICES: (UniformedService | 'All')[] = [
  'All',
  'Nigerian Army',
  'Nigerian Navy',
  'Nigerian Air Force',
  'Nigerian Police Force',
  'NSCDC',
  'FRSC',
  'Immigration',
  'Customs'
];

const CITIES = [
  'All',
  'Lagos',
  'Abuja',
  'Port Harcourt',
  'Kaduna',
  'Uyo',
  'Ibadan',
  'Kano',
  'Enugu',
  'Calabar'
];

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onClose,
  currentProfession,
  currentService,
  currentCity,
  currentDistance,
  onApplyFilters
}) => {
  const [profession, setProfession] = useState(currentProfession);
  const [service, setService] = useState(currentService);
  const [city, setCity] = useState(currentCity);
  const [maxDistance, setMaxDistance] = useState(currentDistance);

  if (!isOpen) return null;

  const handleApply = () => {
    onApplyFilters({ profession, service, city, maxDistance });
    onClose();
  };

  const handleReset = () => {
    setProfession('All');
    setService('All');
    setCity('All');
    setMaxDistance(100);
    onApplyFilters({ profession: 'All', service: 'All', city: 'All', maxDistance: 100 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
      <div 
        className="w-full max-w-sm bg-[#F7F5F0] rounded-3xl border border-[#EBE6DF] shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#EBE6DF] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#B85A3C]" />
            <h3 className="font-['Cormorant_Garamond',serif] text-base font-bold text-[#1A1816]">
              Discovery Filters
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#6B665F] hover:text-[#1A1816] rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Profession Category */}
          <div>
            <label className="text-[0.8125rem] font-bold text-[#6B665F] uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-[#B85A3C]" />
              <span>Profession Category</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1 bg-white border border-[#E8E4DC] rounded-xl">
              {PROFESSIONS.map((p) => {
                const isSelected = profession === p;
                return (
                  <button
                    key={p}
                    onClick={() => setProfession(p)}
                    className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#B85A3C] text-white font-medium'
                        : 'text-[#1A1816] hover:bg-[#F7F5F0]'
                    }`}
                  >
                    <span className="truncate">{p}</span>
                    {isSelected && <Check className="w-3 h-3 shrink-0 ml-1" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Uniformed Service (if Uniformed chosen or All) */}
          {['Military', 'Police', 'Paramilitary', 'All'].includes(profession) && (
            <div>
              <label className="text-[0.8125rem] font-bold text-[#6B665F] uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#B85A3C]" />
                <span>Uniformed Service</span>
              </label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#E8E4DC] rounded-xl text-xs text-[#1A1816] outline-none focus:border-[#B85A3C]"
              >
                {SERVICES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* City Location */}
          <div>
            <label className="text-[0.8125rem] font-bold text-[#6B665F] uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#B85A3C]" />
              <span>City Location</span>
            </label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E8E4DC] rounded-xl text-xs text-[#1A1816] outline-none focus:border-[#B85A3C]"
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'All' ? 'All Nigerian Cities' : c}
                </option>
              ))}
            </select>
          </div>

          {/* Distance */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[0.8125rem] font-bold text-[#6B665F] uppercase tracking-wider">
                Maximum Distance
              </span>
              <span className="text-xs font-bold text-[#B85A3C] font-mono">
                {maxDistance} km
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={200}
              step={5}
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="w-full h-1.5 bg-[#E8E4DC] rounded-lg appearance-none cursor-pointer accent-[#B85A3C]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-[#EBE6DF] bg-white flex items-center justify-between gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 text-xs font-medium text-[#6B665F] hover:text-[#1A1816]"
          >
            Reset
          </button>
          <button
            onClick={handleApply}
            className="py-2.5 px-5 rounded-full bg-[#B85A3C] hover:bg-[#B04A55] text-white text-xs font-semibold shadow-sm transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};
