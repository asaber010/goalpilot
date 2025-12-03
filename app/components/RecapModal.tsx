'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import DarkVeil from './DarkVeil';

interface RecapData {
  totalHours: number;
  completionRate: number;
  distribution: { label: string; hours: number; color: string }[];
  busiestDay: string;
  quietestDay: string;
  peakHour: number;
  archetype: string;
  archetypeDescription: string;
  focusScore: number;
  keyInsight: string;
  patterns: { strength: string; weakness: string; trend: string };
  suggestions: string[];
  motivationalNote: string;
}

interface RecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  calendarEvents: any[];
  goals: any[];
  projects: any[];
  providerToken: string | null;
  onApplySuggestion: (suggestion: string) => void;
}

export default function RecapModal({
  isOpen,
  onClose,
  userId,
  calendarEvents,
  goals,
  projects,
  providerToken,
  onApplySuggestion,
}: RecapModalProps) {
  const [slide, setSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecapData | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [appliedSuggestions, setAppliedSuggestions] = useState<string[]>([]);
  const [countUpValue, setCountUpValue] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setSlide(0);
      setLoading(true);
      setIsChatOpen(false);
      setChatMessages([]);
      setAppliedSuggestions([]);
      generateRecap();
    }
  }, [isOpen]);

  // Count up animation for hours
  useEffect(() => {
    if (data && slide === 1) {
      const target = data.totalHours;
      const duration = 2000;
      const steps = 60;
      const increment = target / steps;
      let current = 0;
      
      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          setCountUpValue(target);
          clearInterval(timer);
        } else {
          setCountUpValue(Math.round(current * 10) / 10);
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }
  }, [data, slide]);

  const generateRecap = async () => {
    try {
      const response = await fetch('/api/recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          calendarEvents,
          goals,
          projects,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setData(result.recap);
      }
    } catch (error) {
      console.error('Failed to generate recap:', error);
    }
    setLoading(false);
  };

  const handleApplySuggestion = (suggestion: string) => {
    setAppliedSuggestions(prev => [...prev, suggestion]);
    onApplySuggestion(suggestion);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[RECAP CONTEXT] The user just reviewed their weekly recap. Their archetype is "${data?.archetype}". Key insight: "${data?.keyInsight}". They said: "${userMessage}". Respond helpfully about their schedule/productivity.`,
          calendarEvents,
          goals,
          conversationHistory: chatMessages.slice(-6),
        }),
      });

      const result = await response.json();
      if (result.success) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
      }
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, had trouble with that. Try again?" }]);
    }
    setChatLoading(false);
  };

  const nextSlide = () => {
    if (slide < 4) setSlide(s => s + 1);
  };

  const prevSlide = () => {
    if (slide > 0) setSlide(s => s - 1);
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  if (!isOpen) return null;

  const slides = [
    // Slide 0: Loading / Intro
    <motion.div
      key="intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-full text-center px-8"
    >
      {loading ? (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full mb-8"
          />
          <h2 className="text-2xl font-roman text-white mb-2">Analyzing your week...</h2>
          <p className="text-white/50">Finding patterns and insights</p>
        </>
      ) : (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="text-6xl mb-6"
          >
            📊
          </motion.div>
          <h2 className="text-3xl font-roman text-white mb-2">Your Weekly Mission Debrief</h2>
          <p className="text-white/50 mb-8">Let's see how you performed, Pilot.</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={nextSlide}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-medium transition"
          >
            Begin Debrief →
          </motion.button>
        </>
      )}
    </motion.div>,

    // Slide 1: The Big Number
    <motion.div
      key="hours"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center justify-center h-full text-center"
    >
      <p className="text-white/50 text-xl mb-4">This week you logged</p>
      <motion.div
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="relative"
      >
        <span className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-purple-600">
          {countUpValue}
        </span>
        <span className="text-4xl text-white/60 ml-2">hours</span>
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="text-white/40 mt-6 text-lg"
      >
        {data && data.totalHours >= 30 ? "That's some serious dedication! 💪" : 
         data && data.totalHours >= 20 ? "Solid effort this week!" :
         "Quality over quantity, right?"}
      </motion.p>
    </motion.div>,

    // Slide 2: Distribution Donut
    <motion.div
      key="distribution"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-full"
    >
      <h3 className="text-2xl font-roman text-white mb-8">Where Your Time Went</h3>
      
      <div className="relative w-64 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data?.distribution.map(d => ({ ...d, value: d.hours })) || []}
              innerRadius={70}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              animationBegin={0}
              animationDuration={1000}
            >
              {data?.distribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{data?.totalHours}h</p>
            <p className="text-white/50 text-sm">total</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-2">
        {data?.distribution.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="flex items-center gap-2"
          >
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-white/70">{item.label}</span>
            <span className="text-white font-medium">{item.hours}h</span>
          </motion.div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="mt-8 flex gap-8 text-center">
        <div>
          <p className="text-white/50 text-sm">Busiest Day</p>
          <p className="text-white font-medium">{data?.busiestDay}</p>
        </div>
        <div>
          <p className="text-white/50 text-sm">Peak Hour</p>
          <p className="text-white font-medium">{data ? formatHour(data.peakHour) : '-'}</p>
        </div>
        <div>
          <p className="text-white/50 text-sm">Quietest Day</p>
          <p className="text-white font-medium">{data?.quietestDay}</p>
        </div>
      </div>
    </motion.div>,

    // Slide 3: Archetype Reveal
    <motion.div
      key="archetype"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-full text-center px-8"
    >
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-white/50 text-lg mb-4"
      >
        Your Pilot Call Sign
      </motion.p>
      
      <motion.h2
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: "spring" }}
        className="text-5xl md:text-6xl font-roman text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-purple-400 mb-4"
      >
        {data?.archetype}
      </motion.h2>
      
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-white/60 text-lg max-w-md"
      >
        {data?.archetypeDescription}
      </motion.p>

      {/* Focus Score */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="mt-12"
      >
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="8"
            />
            <motion.circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 56}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - (data?.focusScore || 0) / 100) }}
              transition={{ delay: 1.5, duration: 1.5 }}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-3xl font-bold text-white">{data?.focusScore}</span>
          </div>
        </div>
        <p className="text-white/50 mt-2">Focus Score</p>
      </motion.div>
    </motion.div>,

    // Slide 4: Insights & Actions
    <motion.div
      key="insights"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-full p-8 overflow-y-auto"
    >
      {!isChatOpen ? (
        <>
          {/* Key Insight */}
          <div className="mb-8">
            <h3 className="text-xl font-roman text-white mb-3">💡 Key Insight</h3>
            <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl">
              <p className="text-lg text-purple-200 leading-relaxed">"{data?.keyInsight}"</p>
            </div>
          </div>

          {/* Patterns */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <p className="text-green-400 text-sm mb-1">💪 Strength</p>
              <p className="text-white">{data?.patterns.strength}</p>
            </div>
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <p className="text-yellow-400 text-sm mb-1">🎯 Growth Area</p>
              <p className="text-white">{data?.patterns.weakness}</p>
            </div>
          </div>

          {/* Suggestions */}
          <div className="mb-8">
            <h3 className="text-xl font-roman text-white mb-3">🚀 Suggested Actions</h3>
            <div className="space-y-2">
              {data?.suggestions.map((suggestion, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition ${
                    appliedSuggestions.includes(suggestion)
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <span className="text-white/80">{suggestion}</span>
                  {appliedSuggestions.includes(suggestion) ? (
                    <span className="text-green-400 text-sm">✓ Applied</span>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleApplySuggestion(suggestion)}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm"
                    >
                      Apply
                    </motion.button>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Motivational Note */}
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
            <p className="text-white/70 italic">"{data?.motivationalNote}"</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-auto">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsChatOpen(true)}
              className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white transition"
            >
              💬 Discuss with AI
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose}
              className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl text-white transition"
            >
              Done
            </motion.button>
          </div>
        </>
      ) : (
        // Chat Interface
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-roman text-white">Discuss Your Week</h3>
            <button
              onClick={() => setIsChatOpen(false)}
              className="text-white/50 hover:text-white"
            >
              ← Back
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-4">
            {chatMessages.length === 0 && (
              <div className="text-center py-8 text-white/40">
                <p>Ask me anything about your week.</p>
                <p className="text-sm mt-2">Try: "Why do I always miss Friday blocks?"</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl ${
                  msg.role === 'assistant'
                    ? 'bg-purple-900/30 text-white/90'
                    : 'bg-white/10 text-white ml-8'
                }`}
              >
                {msg.content}
              </div>
            ))}
            {chatLoading && (
              <div className="p-3 rounded-xl bg-purple-900/30 text-white/50 animate-pulse">
                thinking...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="Ask about your productivity..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={sendChatMessage}
              disabled={chatLoading || !chatInput.trim()}
              className="px-4 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl text-white disabled:opacity-50"
            >
              →
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>,
  ];

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Background */}
      <div className="absolute inset-0 bg-black">
        <div className="absolute inset-0 opacity-30">
          <DarkVeil speed={0.1} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 via-black to-pink-900/20" />
      </div>

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex gap-2 z-10">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: slide >= i ? "100%" : "0%" }}
              transition={{ duration: 0.3 }}
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
            />
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      {slide > 0 && slide < 4 && (
        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10 transition"
        >
          ←
        </button>
      )}
      {slide > 0 && slide < 4 && (
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10 transition"
        >
          →
        </button>
      )}

      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/50 hover:text-white z-10 transition"
      >
        ✕ Close
      </button>

      {/* Main Content */}
      <div className="relative z-0 h-full w-full max-w-2xl mx-auto pt-12">
        <AnimatePresence mode="wait">
          {slides[slide]}
        </AnimatePresence>
      </div>

      {/* Tap to advance hint */}
      {slide > 0 && slide < 4 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-sm"
        >
          Click arrows or swipe to continue
        </motion.p>
      )}
    </div>
  );
}
