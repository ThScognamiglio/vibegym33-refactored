import React, { useState, useEffect, useMemo } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { calculatePlates, PLATE_COLORS, BARBELL_OPTIONS, DEFAULT_PLATES } from '../../core/warmup/plateCalculator';

const PLATES_CONFIG = [25, 20, 15, 10, 5, 2.5, 1.25];

interface PlateCalculatorProps {
  targetWeight: number;
  onClose: () => void;
  equipment?: string;
}

// ─── DISC COMPONENT ──────────────────────────────────────────────────────────
const PlateDisc: React.FC<{ weight: number; size?: 'sm' | 'md' | 'lg' }> = ({ weight, size = 'md' }) => {
  const color = PLATE_COLORS[weight] ?? '#6b7280';

  const heights: Record<string, number> = {
    25: 72, 20: 64, 15: 56, 10: 48, 5: 40, 2.5: 32, 1.25: 24
  };
  const widths: Record<string, number> = {
    25: 22, 20: 20, 15: 18, 10: 16, 5: 14, 2.5: 10, 1.25: 8
  };

  const h = heights[weight] ?? 40;
  const w = widths[weight] ?? 14;

  return (
    <div
      className="rounded-sm flex items-center justify-center relative shrink-0"
      style={{
        backgroundColor: color,
        width: `${w}px`,
        height: `${h}px`,
        boxShadow: `inset -2px 0 4px rgba(0,0,0,0.3), 2px 0 4px rgba(0,0,0,0.2)`,
      }}
      title={`${weight}kg`}
    >
      {w >= 16 && (
        <span
          className="text-white font-black leading-none select-none"
          style={{ fontSize: '8px', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {weight}
        </span>
      )}
    </div>
  );
};

// ─── BARBELL VISUAL ──────────────────────────────────────────────────────────
const BarbellVisual: React.FC<{ platesPerSide: number[]; barbellWeight: number; totalWeight: number }> = ({
  platesPerSide, barbellWeight, totalWeight
}) => {
  return (
    <div className="flex items-center justify-center py-4 overflow-x-auto">
      {/* Left collar */}
      <div className="w-3 h-6 bg-gray-500 rounded-l-sm shrink-0" />

      {/* Left plates (reversed so heaviest is closest to bar) */}
      <div className="flex flex-row-reverse items-center">
        {[...platesPerSide].map((plate, i) => (
          <PlateDisc key={`L-${i}`} weight={plate} />
        ))}
      </div>

      {/* Bar */}
      <div
        className="bg-gray-400 rounded-sm shrink-0 flex items-center justify-center"
        style={{ height: '14px', minWidth: '80px', maxWidth: '120px', width: '100%' }}
      >
        <span className="text-gray-700 font-black text-[10px]">{barbellWeight}kg</span>
      </div>

      {/* Right plates */}
      <div className="flex items-center">
        {platesPerSide.map((plate, i) => (
          <PlateDisc key={`R-${i}`} weight={plate} />
        ))}
      </div>

      {/* Right collar */}
      <div className="w-3 h-6 bg-gray-500 rounded-r-sm shrink-0" />
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const PlateCalculator: React.FC<PlateCalculatorProps> = ({ targetWeight, onClose, equipment }) => {
  const getInitialBarbellIdx = (eq?: string) => {
    if (!eq) return 0;
    const lower = eq.toLowerCase();
    if (lower.includes('multipower') || lower.includes('smith')) return 5;
    if (
      lower.includes('macchina') || 
      lower.includes('machine') || 
      lower.includes('cavi') || 
      lower.includes('cable')
    ) return 6;
    if (lower.includes('ez') || lower.includes('curl')) return 3;
    if (lower.includes('trap') || lower.includes('hex')) return 4;
    return 0;
  };

  const initialBarbellIdx = useMemo(() => getInitialBarbellIdx(equipment), [equipment]);
  const [barbellIdx, setBarbellIdx] = useState(initialBarbellIdx);
  const [inputWeight, setInputWeight] = useState(targetWeight);
  const [availablePlates, setAvailablePlates] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('vg_gym_plates');
      return saved ? JSON.parse(saved) : DEFAULT_PLATES;
    } catch { return DEFAULT_PLATES; }
  });
  const [showPlateSettings, setShowPlateSettings] = useState(false);

  useEffect(() => {
    setBarbellIdx(initialBarbellIdx);
  }, [initialBarbellIdx]);

  const barbell = BARBELL_OPTIONS[barbellIdx];

  const result = useMemo(
    () => calculatePlates(inputWeight, barbell.weight, availablePlates),
    [inputWeight, barbell.weight, availablePlates]
  );

  const togglePlate = (plate: number) => {
    const next = availablePlates.includes(plate)
      ? availablePlates.filter(p => p !== plate)
      : [...availablePlates, plate].sort((a, b) => b - a);
    setAvailablePlates(next);
    localStorage.setItem('vg_gym_plates', JSON.stringify(next));
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end justify-center p-0"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 w-full max-w-lg rounded-t-3xl border border-gray-700 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-800">
          <div>
            <h3 className="font-black text-white text-base flex items-center gap-2">
              🔧 Plate Calculator
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Dischi per lato</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[80vh]">
          {equipment && (() => {
            const lower = equipment.toLowerCase();
            const isDumbbell = lower.includes('manubri') || lower.includes('dumbbell');
            const isMachine = lower.includes('macchina') || lower.includes('machine') || lower.includes('cavi') || lower.includes('cable');
            if (isDumbbell) {
              return (
                <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-400">
                  💡 Questo esercizio usa <strong>manubri</strong>. Il calcolatore mostra i dischi per un bilanciere equivalente.
                </div>
              );
            }
            if (isMachine) {
              return (
                <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-xl p-3 text-xs text-cyan-400">
                  💡 Questo esercizio usa una <strong>macchina/cavi</strong>. Il bilanciere è stato impostato su "Nessuno/Macchina".
                </div>
              );
            }
            return null;
          })()}

          {/* Weight Input */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setInputWeight(p => Math.max(barbell.weight, parseFloat((p - 2.5).toFixed(2))))}
              className="w-10 h-10 rounded-xl bg-gray-800 text-white font-black text-xl hover:bg-gray-700 transition flex items-center justify-center"
            >−</button>
            <div className="flex-1 text-center">
              <input
                type="number"
                value={inputWeight}
                onChange={e => setInputWeight(parseFloat(e.target.value) || 0)}
                className="w-full text-center text-4xl font-black text-white bg-transparent outline-none"
              />
              <p className="text-xs text-gray-500 uppercase tracking-wider">kg totali</p>
            </div>
            <button
              onClick={() => setInputWeight(p => parseFloat((p + 2.5).toFixed(2)))}
              className="w-10 h-10 rounded-xl bg-gray-800 text-white font-black text-xl hover:bg-gray-700 transition flex items-center justify-center"
            >+</button>
          </div>

          {/* Barbell Selector */}
          <div className="flex gap-2">
            {BARBELL_OPTIONS.map((opt, i) => (
              <button
                key={opt.label}
                onClick={() => setBarbellIdx(i)}
                className={`flex-1 py-2 px-1 rounded-xl text-[10px] font-bold border transition-all ${
                  barbellIdx === i
                    ? 'bg-cyan-500 text-gray-900 border-cyan-400'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div>{opt.label}</div>
                <div className="opacity-70">{opt.weight}kg</div>
              </button>
            ))}
          </div>

          {/* Barbell Graphic */}
          <div className="bg-gray-800/60 rounded-2xl border border-gray-700 overflow-hidden">
            <BarbellVisual
              platesPerSide={result.platesPerSide}
              barbellWeight={barbell.weight}
              totalWeight={result.totalWeight}
            />

            {/* Result Summary */}
            <div className="px-4 pb-4 flex items-center justify-between">
              <div>
                {result.platesPerSide.length === 0 ? (
                  <p className="text-gray-500 text-sm">Solo bilanciere</p>
                ) : (
                  <p className="text-white text-sm font-bold">
                    Per lato: {result.platesPerSide.join(' + ')} kg
                  </p>
                )}
                {!result.achievable && (
                  <p className="text-yellow-400 text-[10px] mt-1">
                    ⚠️ Peso exacto non raggiungibile. Più vicino: {result.totalWeight}kg
                    {result.remainder > 0 ? ` (mancano ${result.remainder}kg)` : ''}
                  </p>
                )}
              </div>
              <div className={`text-3xl font-black ${result.achievable ? 'text-cyan-400' : 'text-yellow-400'}`}>
                {result.totalWeight}kg
              </div>
            </div>
          </div>

          {/* Plate Legend */}
          <div className="flex flex-wrap gap-2 justify-center">
            {[...result.platesPerSide].sort((a, b) => b - a).filter((v, i, arr) => arr.indexOf(v) === i).map(plate => (
              <div key={plate} className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLATE_COLORS[plate] ?? '#6b7280' }} />
                <span className="text-xs font-bold text-white">{plate}kg</span>
                <span className="text-[10px] text-gray-500">
                  ×{result.platesPerSide.filter(p => p === plate).length * 2}
                </span>
              </div>
            ))}
          </div>

          {/* Plate Settings Toggle */}
          <button
            onClick={() => setShowPlateSettings(p => !p)}
            className="w-full flex items-center justify-between p-3 bg-gray-800/60 rounded-xl border border-gray-700 text-sm text-gray-400 hover:border-gray-600 transition"
          >
            <span className="font-bold">Dischi disponibili in palestra</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showPlateSettings ? 'rotate-180' : ''}`} />
          </button>

          {showPlateSettings && (
            <div className="flex flex-wrap gap-2 p-3 bg-gray-800/40 rounded-xl border border-gray-700">
              {PLATES_CONFIG.map(plate => (
                <button
                  key={plate}
                  onClick={() => togglePlate(plate)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    availablePlates.includes(plate)
                      ? 'border-transparent text-white'
                      : 'bg-gray-900 text-gray-600 border-gray-700 opacity-50'
                  }`}
                  style={availablePlates.includes(plate) ? { backgroundColor: PLATE_COLORS[plate] ?? '#6b7280', borderColor: 'transparent' } : {}}
                >
                  {plate}kg
                </button>
              ))}
              <p className="w-full text-[10px] text-gray-600 mt-1">
                Tocca per attivare/disattivare. Salvato sul dispositivo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlateCalculator;
