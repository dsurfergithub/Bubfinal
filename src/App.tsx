/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  X, 
  Mic, 
  Trash2, 
  Sparkles, 
  Moon, 
  BarChart2, 
  ChevronDown,
  CheckCircle2,
  Circle,
  AlertCircle,
  RefreshCw,
  Info
} from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';

// --- INITIALIZATION ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- TYPES ---

type BubbleColor = 'blue' | 'yellow' | 'red' | 'green';
type Mood = 'calm' | 'future' | 'present' | 'worried';

interface Node {
  id: string;
  texto: string;
  completado: boolean;
}

interface Thought {
  id: string;
  texto: string;
  fecha: string;
  color: BubbleColor;
  mood: Mood;
  completado: boolean;
  eliminado: boolean;
  nodos: Node[];
  completadoEn: string | null;
  eliminadoEn: string | null;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
}

interface GeminiCategory {
  emoji: string;
  nombre: string;
  tiempo: string;
}

// --- CONSTANTS ---

const MOODS: Record<Mood, { emoji: string; label: string }> = {
  calm: { emoji: '🪴', label: 'Calmado' },
  future: { emoji: '🌳', label: 'Mirando al futuro' },
  present: { emoji: '🪨', label: 'Presente' },
  worried: { emoji: '🌤️', label: 'Algo preocupado' },
};

const COLORS: Record<BubbleColor, string> = {
  blue: '#3b82f6',
  yellow: '#facc15',
  red: '#ef4444',
  green: '#22c55e',
};

const STORAGE_KEY = 'bubbulu_v2';
const LONG_PRESS_DURATION = 1500;

// --- UTILS ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const fetchGemini = async (prompt: string, signal: AbortSignal, isJson = true, retries = 2) => {
  let attempt = 0;
  
  while (attempt <= retries) {
    try {
      const config: any = {};
      if (isJson) {
        config.responseMimeType = "application/json";
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash', 
        contents: [{ parts: [{ text: prompt }] }],
        config
      });
      
      if (!response.text) {
        throw new Error('Sin respuesta de la IA');
      }

      const text = response.text.trim();
      if (isJson) {
        const jsonStr = text.startsWith('```') ? text.replace(/^```json|```$/g, '').trim() : text;
        return JSON.parse(jsonStr);
      }
      return text;
    } catch (error: any) {
      attempt++;
      const isRateLimit = error.message?.includes('429');
      
      if (isRateLimit && attempt <= retries) {
        // Exponential backoff: 2s, 4s...
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`429 detected, retrying in ${delay}ms... (attempt ${attempt})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error('Gemini error:', error);
      if (isRateLimit) {
        throw new Error('Límite de peticiones (429) alcanzado. Por favor, intenta de nuevo en un minuto.');
      }
      if (error.name === 'AbortError') {
        throw new Error('La petición tardó demasiado y fue cancelada.');
      }
      throw new Error('Error al conectar con Bubbulú IA: ' + error.message);
    }
  }
};

// --- COMPONENTS ---

export default function App() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [activeThoughtId, setActiveThoughtId] = useState<string | null>(null);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [canvasHeight, setCanvasHeight] = useState(window.innerHeight);
  
  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setThoughts(JSON.parse(saved));
      } catch (e) {
        console.error("Error loading localStorage", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thoughts));
  }, [thoughts]);

  // Adjust canvas height based on bubbles
  useEffect(() => {
    const activeThoughts = thoughts.filter(t => !t.completado && !t.eliminado);
    const minHeight = window.innerHeight;
    const calculatedHeight = Math.max(minHeight, 300 + activeThoughts.length * 50);
    setCanvasHeight(calculatedHeight);
  }, [thoughts]);

  const addThought = (thought: Omit<Thought, 'id' | 'fecha' | 'completado' | 'eliminado' | 'nodos' | 'completadoEn' | 'eliminadoEn'>) => {
    const newThought: Thought = {
      ...thought,
      id: generateId(),
      fecha: new Date().toISOString(),
      completado: false,
      eliminado: false,
      nodos: [],
      completadoEn: null,
      eliminadoEn: null,
    };
    setThoughts([...thoughts, newThought]);
    setIsInputOpen(false);
  };

  const updateThought = (id: string, updates: Partial<Thought>) => {
    setThoughts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const createParticles = (x: number, y: number, color: string) => {
    const newParticles: Particle[] = Array.from({ length: 24 }).map(() => ({
      id: generateId(),
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      size: Math.random() * 8 + 4,
      opacity: 1,
      color,
    }));
    setParticles(prev => [...prev, ...newParticles]);
  };

  useEffect(() => {
    if (particles.length === 0) return;
    const interval = setInterval(() => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        opacity: p.opacity - 0.02,
      })).filter(p => p.opacity > 0));
    }, 16);
    return () => clearInterval(interval);
  }, [particles]);

  const activeThought = thoughts.find(t => t.id === activeThoughtId);

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#05091a] overflow-x-hidden select-none touch-none">
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none">
        <svg className="w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: 20 }).map((_, i) => (
            <circle
              key={i}
              cx={`${Math.random() * 100}%`}
              cy={`${Math.random() * 100}%`}
              r={Math.random() * 2}
              fill="white"
            />
          ))}
        </svg>
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 p-4 flex justify-between items-center bg-gradient-to-b from-[#05091a] to-transparent">
        <h1 className="text-2xl font-bold text-white/90">Bubbulú</h1>
        <button 
          onClick={() => setIsStatsOpen(true)}
          className="p-3 glass rounded-full"
        >
          <BarChart2 size={24} />
        </button>
      </header>

      {/* Canvas Area */}
      <div 
        className="relative w-full"
        style={{ height: canvasHeight }}
      >
        {thoughts
          .filter(t => !t.completado && !t.eliminado)
          .map((thought, idx) => (
            <BubbleComponent
              key={thought.id}
              thought={thought}
              onTap={() => setActiveThoughtId(thought.id)}
              onComplete={(x, y) => {
                updateThought(thought.id, { completado: true, completadoEn: new Date().toISOString() });
                createParticles(x, y, COLORS[thought.color]);
              }}
            />
          ))}
        
        {/* Explosion Particles */}
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              opacity: p.opacity,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}
      </div>

      {/* Footer Actions */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-40">
        <button
          onClick={() => setIsInputOpen(true)}
          className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-900/40 active:scale-95 transition-transform"
        >
          <Plus size={32} />
        </button>
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {isInputOpen && (
          <InputPanel
            onClose={() => setIsInputOpen(false)}
            onSave={addThought}
          />
        )}
        {activeThought && (
          <DetailPanel
            thought={activeThought}
            onClose={() => setActiveThoughtId(null)}
            onUpdate={updates => updateThought(activeThought.id, updates)}
          />
        )}
        {isStatsOpen && (
          <StatsPanel
            thoughts={thoughts}
            onClose={() => setIsStatsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function BubbleComponent({ thought, onTap, onComplete }: { 
  thought: Thought; 
  onTap: () => void; 
  onComplete: (x: number, y: number) => void 
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ 
    x: Math.random() * (window.innerWidth - 100) + 50, 
    y: Math.random() * (window.innerHeight - 300) + 100 
  });
  const [vel] = useState({ 
    x: (Math.random() - 0.5) * 0.8, 
    y: (Math.random() - 0.5) * 0.8 
  });
  const [phase] = useState(Math.random() * Math.PI * 2);
  const [time, setTime] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const pressTimeout = useRef<number | null>(null);
  const startTime = useRef<number>(0);

  // Organic physics
  useEffect(() => {
    let frame: number;
    const animate = () => {
      setTime(t => t + 0.02);
      setPos(prev => {
        let nx = prev.x + vel.x;
        let ny = prev.y + vel.y;

        // Bouncing
        if (nx < 60 || nx > window.innerWidth - 60) vel.x *= -1;
        if (ny < 100 || ny > window.innerHeight * 2) vel.y *= -1; // Allow vertical expansion

        return { x: nx, y: ny };
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [vel]);

  // Sinusoidal drift
  const driftX = Math.sin(time + phase) * 15;
  const driftY = Math.cos(time * 0.8 + phase) * 10;

  // Size logic
  const size = Math.min(158, Math.max(88, 88 + thought.texto.length * 0.4));
  
  // Status logic
  const isStale = (new Date().getTime() - new Date(thought.fecha).getTime()) > 7 * 24 * 60 * 60 * 1000;
  const isFinished = thought.nodos.length > 0 && thought.nodos.every(n => n.completado);

  const startPress = (e: React.TouchEvent | React.MouseEvent) => {
    setIsPressing(true);
    setProgress(0);
    startTime.current = Date.now();
    
    pressTimeout.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      const p = Math.min(100, (elapsed / LONG_PRESS_DURATION) * 100);
      setProgress(p);
      
      if (p >= 100) {
        if (pressTimeout.current) clearInterval(pressTimeout.current);
        onComplete(pos.x + driftX, pos.y + driftY);
      }
    }, 20);
  };

  const endPress = () => {
    if (Date.now() - startTime.current < 200) {
      onTap();
    }
    setIsPressing(false);
    setProgress(0);
    if (pressTimeout.current) clearInterval(pressTimeout.current);
  };

  return (
    <div
      ref={containerRef}
      className={`absolute cursor-pointer flex items-center justify-center text-center p-4 rounded-full glass transition-opacity animate-popIn ${isFinished ? 'animate-pulseSoft' : ''}`}
      style={{
        left: pos.x + driftX,
        top: pos.y + driftY,
        width: size,
        height: size,
        transform: `translate(-50%, -50%) scale(${isPressing ? 1 + (progress / 100) * 0.3 : 1})`,
        borderColor: `${COLORS[thought.color]}44`,
        boxShadow: `0 8px 32px -4px ${COLORS[thought.color]}33`,
        opacity: isStale ? 0.38 : 1,
        touchAction: 'none'
      }}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
    >
      <span className="text-xs font-medium line-clamp-3 leading-tight pointer-events-none">
        {thought.texto}
      </span>
      {isStale && <span className="absolute -top-1 -right-1 text-sm bg-indigo-900 rounded-full px-1">💤</span>}
      
      {/* Progress Ring */}
      {isPressing && (
        <svg className="absolute inset-0 -rotate-90 pointer-events-none" width="100%" height="100%">
          <circle
            cx="50%"
            cy="50%"
            r="48%"
            fill="none"
            stroke={COLORS[thought.color]}
            strokeWidth="4"
            strokeDasharray="300"
            strokeDashoffset={300 - (progress / 100) * 300}
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

function InputPanel({ onClose, onSave }: { onClose: () => void; onSave: (data: any) => void }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState<BubbleColor>('blue');
  const [mood, setMood] = useState<Mood>('present');
  const [isListening, setIsListening] = useState(false);

  const handleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Navegador no soporta voz');
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setText(prev => prev + ' ' + transcript);
    };
    recognition.start();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) onSave({ texto: text, color, mood });
    }
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="panel-bottom max-h-[90dvh] flex flex-col gap-6"
    >
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <h2 className="text-xl font-bold">Nuevo Pensamiento</h2>
        <button onClick={onClose} className="p-2"><X /></button>
      </div>

      <div className="relative">
        <textarea
          autoFocus
          className="w-full h-32 bg-white/5 rounded-2xl p-4 text-[16px] outline-none focus:ring-2 ring-blue-500 transition-all border border-white/10"
          placeholder="¿Qué tienes en mente?"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button 
          onClick={handleVoice}
          className={`absolute bottom-4 right-4 p-3 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-white/10'}`}
        >
          <Mic size={20} />
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-white/50">Tono del pensamiento</p>
        <div className="flex gap-4">
          {(Object.keys(COLORS) as BubbleColor[]).map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-10 h-10 rounded-full transition-all border-2 border-transparent"
              style={{ 
                backgroundColor: COLORS[c],
                boxShadow: color === c ? `0 0 15px ${COLORS[c]}` : 'none',
                borderColor: color === c ? 'white' : 'transparent'
              }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-white/50">¿Cómo te sientes?</p>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(MOODS) as Mood[]).map(m => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${mood === m ? 'bg-white/10 ring-1 ring-white/20' : 'opacity-40'}`}
            >
              <span className="text-xl">{MOODS[m].emoji}</span>
              <span className="text-[10px] text-center line-clamp-1">{MOODS[m].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <button onClick={onClose} className="flex-1 py-4 glass rounded-2xl font-medium">Cancelar</button>
        <button 
          onClick={() => text.trim() && onSave({ texto: text, color, mood })}
          className="flex-1 py-4 bg-blue-600 rounded-2xl font-bold active:scale-95 transition-transform"
        >
          Soltar burbuja 🫧
        </button>
      </div>
    </motion.div>
  );
}

function DetailPanel({ thought, onClose, onUpdate }: { 
  thought: Thought; 
  onClose: () => void; 
  onUpdate: (updates: any) => void 
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const isStale = (new Date().getTime() - new Date(thought.fecha).getTime()) > 7 * 24 * 60 * 60 * 1000;

  const handleDecompose = async (regenerate = false) => {
    setLoading(true);
    setError(null);
    abortController.current = new AbortController();
    const timeout = setTimeout(() => abortController.current?.abort(), 10000);

    const prompt = `Como asistente empático, descompón este pensamiento o tarea en 3 a 5 pasos accionables y cortos.
    Pensamiento: "${thought.texto}"
    Mood: "${MOODS[thought.mood].label}"
    Devuelve estrictamente un JSON con formato: {"pasos": ["paso 1", "paso 2", ...]}
    Evita lenguaje genérico, sé específico al pensamiento.`;

    try {
      const data = await fetchGemini(prompt, abortController.current.signal);
      onUpdate({ nodos: data.pasos.map((p: string) => ({ id: generateId(), texto: p, completado: false })) });
    } catch (e: any) {
      if (e.name === 'AbortError') setError('Tiempo de espera agotado (10s)');
      else setError(e.message || 'Error al conectar con la IA');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const handleReview = async () => {
    setLoading(true);
    setAiMessage(null);
    setError(null);
    abortController.current = new AbortController();
    
    const prompt = `El usuario tiene un pensamiento "dormido" (más de 7 días). Ayúdale a procesarlo con un mensaje muy corto (máximo 20 palabras), empático y directo. No uses listas, solo un párrafo corto.
    Pensamiento: "${thought.texto}"`;

    try {
      const data = await fetchGemini(prompt, abortController.current.signal, false);
      setAiMessage(data); 
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (nodeId: string) => {
    const newNodes = thought.nodos.map(n => n.id === nodeId ? { ...n, completado: !n.completado } : n);
    onUpdate({ nodos: newNodes });
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="panel-bottom max-h-[92dvh] flex flex-col"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{MOODS[thought.mood].emoji}</span>
            <span className="text-sm font-semibold uppercase tracking-wider text-white/50">{MOODS[thought.mood].label}</span>
          </div>
          <p className="text-xs text-white/30">{new Date(thought.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex gap-2">
          {isStale && <span className="bg-indigo-900/50 text-indigo-200 px-3 py-1 rounded-full text-xs border border-indigo-500/30 flex items-center gap-1">💤 Dormida</span>}
          <button onClick={onClose} className="p-2 glass rounded-full"><ChevronDown /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 pr-2">
        <section>
          <p className="text-lg leading-relaxed font-semibold italic text-white/90">"{thought.texto}"</p>
        </section>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3 text-red-200 text-sm">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1"><X size={16} /></button>
          </div>
        )}

        {aiMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-500/10 border border-blue-500/30 p-5 rounded-2xl relative overflow-hidden group"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
            <p className="text-sm italic text-blue-100/80 leading-relaxed pr-6">{aiMessage}</p>
            <button onClick={() => setAiMessage(null)} className="absolute top-2 right-2 p-1 text-white/20 hover:text-white/50 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}

        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Pasos sugeridos</h3>
            {thought.nodos.length > 0 && !loading && (
              <button 
                onClick={() => handleDecompose(true)}
                className="text-xs text-blue-400 flex items-center gap-1"
              >
                <RefreshCw size={12} /> Regenerar
              </button>
            )}
          </div>
          
          <div className="space-y-2">
            {thought.nodos.map(n => (
              <button
                key={n.id}
                onClick={() => toggleNode(n.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl glass text-left transition-all ${n.completado ? 'opacity-50 grayscale' : ''}`}
              >
                {n.completado ? <CheckCircle2 className="text-blue-500" /> : <Circle className="text-white/20" />}
                <span className={`flex-1 text-sm ${n.completado ? 'line-through' : ''}`}>{n.texto}</span>
              </button>
            ))}

            {thought.nodos.length === 0 && !loading && (
              <button 
                onClick={() => handleDecompose()}
                className="w-full py-8 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center gap-2 text-white/30 hover:bg-white/5 transition-colors"
              >
                <Sparkles size={24} />
                <span className="text-sm font-medium">Burbujear pasos con IA</span>
              </button>
            )}

            {loading && (
              <div className="w-full py-8 flex flex-col items-center gap-3">
                <RefreshCw className="animate-spin text-blue-500" size={32} />
                <span className="text-sm text-white/40">Consultando a Gemini...</span>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4 pb-4">
          {isStale && (
            <button 
              onClick={handleReview}
              className="flex items-center justify-center gap-2 p-4 glass rounded-2xl text-yellow-500 border-yellow-500/20"
            >
              <Moon size={18} />
              <span className="text-sm font-bold">Revisar IA</span>
            </button>
          )}
          <button 
            onClick={() => {
              if (confirm('¿Eliminar pensamiento? Quedará en tu historial.')) {
                onUpdate({ eliminado: true, eliminadoEn: new Date().toISOString() });
                onClose();
              }
            }}
            className="flex items-center justify-center gap-2 p-4 glass rounded-2xl text-red-500 border-red-500/20"
          >
            <Trash2 size={18} />
            <span className="text-sm font-bold">Eliminar</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StatsPanel({ thoughts, onClose }: { thoughts: Thought[]; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<GeminiCategory[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completed = thoughts.filter(t => t.completado && !t.eliminado);
  const floating = thoughts.filter(t => !t.completado && !t.eliminado);
  const deleted = thoughts.filter(t => t.eliminado);

  const moodCounts = thoughts.reduce((acc, t) => {
    acc[t.mood] = (acc[t.mood] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    const abort = new AbortController();

    const prompt = `Analiza estos pensamientos completados por el usuario y agrúpalos en 3 a 5 temas o categorías significativas.
    Pensamientos: ${completed.map(t => t.texto).join(', ')}
    Devuelve un JSON array de objetos: [{"emoji": "...", "nombre": "...", "tiempo": "promedio días"}]`;

    try {
      const data = await fetchGemini(prompt, abort.signal);
      setAnalysis(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-0 z-50 glass flex flex-col p-6 overflow-y-auto"
      style={{ background: '#05091a' }}
    >
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold">Estadísticas</h2>
        <button onClick={onClose} className="p-2 glass rounded-full shadow-lg"><X /></button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="glass p-4 rounded-3xl flex flex-col items-center">
          <span className="text-2xl font-bold text-blue-400">{floating.length}</span>
          <span className="text-[10px] uppercase font-bold text-white/30">Flotando</span>
        </div>
        <div className="glass p-4 rounded-3xl flex flex-col items-center">
          <span className="text-2xl font-bold text-green-400">{completed.length}</span>
          <span className="text-[10px] uppercase font-bold text-white/30">Cumplidas</span>
        </div>
        <div className="glass p-4 rounded-3xl flex flex-col items-center">
          <span className="text-2xl font-bold text-red-400">{deleted.length}</span>
          <span className="text-[10px] uppercase font-bold text-white/30">Papelera</span>
        </div>
      </div>

      <section className="mb-8">
        <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-4">Moods predominantes</h3>
        <div className="space-y-3">
          {(Object.keys(MOODS) as Mood[]).map(m => {
            const count = moodCounts[m] || 0;
            const percentage = thoughts.length > 0 ? (count / thoughts.length) * 100 : 0;
            return (
              <div key={m} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-2">{MOODS[m].emoji} {MOODS[m].label}</span>
                  <span className="text-white/40">{count}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    className="h-full bg-blue-500/50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="flex-1">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest">Análisis IA Temático</h3>
          {analysis && <button onClick={handleAnalyze} className="text-xs text-blue-400">Reclasificar</button>}
        </div>

        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}

        {!analysis && !loading && completed.length > 0 && (
          <button 
            onClick={handleAnalyze}
            className="w-full py-12 glass rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center gap-3 text-white/40"
          >
            <Sparkles size={32} />
            <span className="text-sm font-bold">Extraer patrones con IA</span>
          </button>
        )}

        {loading && (
          <div className="py-12 flex flex-col items-center gap-4">
            <RefreshCw className="animate-spin text-blue-400" size={32} />
            <span className="text-xs text-white/30 uppercase font-bold tracking-widest">Sincronizando con Gemini...</span>
          </div>
        )}

        {analysis && (
          <div className="grid grid-cols-1 gap-3">
            {analysis.map((cat, i) => (
              <div key={i} className="glass p-4 rounded-3xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{cat.emoji}</span>
                  <div>
                    <h4 className="font-bold text-sm">{cat.nombre}</h4>
                    <p className="text-[10px] text-white/30 uppercase tracking-tighter">Tiempo de resolución: {cat.tiempo}</p>
                  </div>
                </div>
                <Info size={16} className="text-white/20" />
              </div>
            ))}
          </div>
        )}

        {completed.length === 0 && !loading && (
          <div className="py-12 text-center text-white/20 flex flex-col items-center gap-2">
            <Circle size={40} />
            <p className="text-sm">Completa pensamientos para ver el análisis</p>
          </div>
        )}
      </section>
    </motion.div>
  );
}
