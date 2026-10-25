import React, { useState } from 'react';
import { Terminal, Shield, CheckCircle2, RefreshCw, Database, Server, ChevronDown, ChevronUp } from 'lucide-react';

interface BackendLog {
  timestamp: string;
  method: 'GET' | 'POST' | 'PATCH';
  endpoint: string;
  status: number;
  payload?: any;
}

interface BackendLiveConsoleProps {
  logs: BackendLog[];
  onClearLogs: () => void;
  activeTier: string;
  isVerified: boolean;
}

export const BackendLiveConsole: React.FC<BackendLiveConsoleProps> = ({
  logs,
  onClearLogs,
  activeTier,
  isVerified
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full max-w-4xl mx-auto my-4 px-2">
      <div className="bg-[#232725] text-white rounded-2xl border border-neutral-800 shadow-xl overflow-hidden font-mono text-xs">
        {/* Toggle Bar */}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="p-3.5 px-4 bg-[#1B1E1C] flex items-center justify-between cursor-pointer hover:bg-[#202422] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-white text-xs tracking-wide flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Full-Stack Backend Live Gateway (/api/v1/*)</span>
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-full">
              ONLINE · Express Server
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-neutral-400 hidden sm:inline">
              Tier: <strong className="text-white capitalize">{activeTier}</strong> · Verified: <strong className={isVerified ? 'text-emerald-400' : 'text-amber-400'}>{isVerified ? 'YES' : 'PENDING'}</strong>
            </span>
            {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
          </div>
        </div>

        {/* Expandable Inspector Body */}
        {isOpen && (
          <div className="p-4 space-y-3 bg-[#171918] border-t border-neutral-800">
            {/* Live Metrics Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2.5 bg-[#232725] rounded-xl border border-neutral-800">
                <span className="text-neutral-400 text-[10px] block">Server Mode</span>
                <span className="text-emerald-400 font-semibold">Express REST + Middleware</span>
              </div>
              <div className="p-2.5 bg-[#232725] rounded-xl border border-neutral-800">
                <span className="text-neutral-400 text-[10px] block">Zero-Storage Audit</span>
                <span className="text-white font-semibold">0 raw ID bytes stored</span>
              </div>
              <div className="p-2.5 bg-[#232725] rounded-xl border border-neutral-800">
                <span className="text-neutral-400 text-[10px] block">Billing Provider</span>
                <span className="text-sky-400 font-semibold">Paystack Webhook Sync</span>
              </div>
              <div className="p-2.5 bg-[#232725] rounded-xl border border-neutral-800">
                <span className="text-neutral-400 text-[10px] block">API Latency (p95)</span>
                <span className="text-amber-400 font-semibold">&lt; 18ms</span>
              </div>
            </div>

            {/* Live Network Log Stream */}
            <div>
              <div className="flex items-center justify-between mb-1.5 pt-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  Live HTTP Requests ({logs.length})
                </span>
                <button
                  onClick={onClearLogs}
                  className="text-[10px] text-neutral-400 hover:text-white"
                >
                  Clear stream
                </button>
              </div>

              <div className="bg-[#0F1110] rounded-xl p-3 border border-neutral-800/80 max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
                {logs.length === 0 ? (
                  <span className="text-neutral-500 text-[11px]">Click buttons on the interface to trigger live backend calls...</span>
                ) : (
                  logs.slice(-10).reverse().map((log, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] font-mono py-0.5 border-b border-neutral-900 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          log.method === 'POST' ? 'bg-emerald-950 text-emerald-400' :
                          log.method === 'PATCH' ? 'bg-amber-950 text-amber-400' : 'bg-sky-950 text-sky-400'
                        }`}>
                          {log.method}
                        </span>
                        <span className="text-neutral-300 truncate max-w-[280px] sm:max-w-md">{log.endpoint}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-emerald-400">{log.status} OK</span>
                        <span className="text-[10px] text-neutral-500">{log.timestamp}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
