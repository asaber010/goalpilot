'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  total_hours: number;
  hours_completed: number;
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;
}

interface TimeBlock {
  start: string;
  end: string;
  title: string;
  microTasks?: string[];
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: Goal | null;
  calendarEvents: any[];
  providerToken: string | null;
  onScheduled: () => void;
}

export default function ScheduleModal({ 
  isOpen, 
  onClose, 
  goal, 
  calendarEvents,
  providerToken,
  onScheduled 
}: ScheduleModalProps) {
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [thinking, setThinking] = useState('');
  const [motivationalNote, setMotivationalNote] = useState('');
  const [selectedBlocks, setSelectedBlocks] = useState<Set<number>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [stressLevel, setStressLevel] = useState<'low' | 'high'>('low');

  if (!isOpen || !goal) return null;

  const generateSchedule = async () => {
    setLoading(true);
    setBlocks([]);
    
    try {
      const response = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          calendarEvents,
          stressLevel,
          userPreferences: {
            productiveHours: { start: 9, end: 17 }
          }
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setBlocks(data.blocks);
        setThinking(data.thinking);
        setMotivationalNote(data.motivationalNote);
        // Select all by default
        setSelectedBlocks(new Set(data.blocks.map((_: any, i: number) => i)));
      } else {
        alert(data.error || 'Failed to generate schedule');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to generate schedule');
    }
    
    setLoading(false);
  };

  const toggleBlock = (index: number) => {
    const newSelected = new Set(selectedBlocks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedBlocks(newSelected);
  };

  const addToCalendar = async () => {
    if (!providerToken || selectedBlocks.size === 0) return;
    
    setScheduling(true);
    
    try {
      const blocksToAdd = blocks.filter((_, i) => selectedBlocks.has(i));
      
      for (const block of blocksToAdd) {
        // Create Google Calendar event
        await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${providerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: `📚 ${block.title}`,
            description: block.microTasks 
              ? `Micro-tasks:\n${block.microTasks.map((t, i) => `☐ ${t}`).join('\n')}\n\nGoal: ${goal.title}`
              : `Goal: ${goal.title}`,
            start: { dateTime: block.start },
            end: { dateTime: block.end },
            colorId: goal.priority === 'high' ? '11' : goal.priority === 'medium' ? '5' : '10',
          }),
        });

        // Save to our database
        await supabase.from('scheduled_blocks').insert({
          goal_id: goal.id,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          start_time: block.start,
          end_time: block.end,
          status: 'scheduled',
        });
      }

      // Update goal hours (estimate based on scheduled blocks)
      const totalScheduledHours = blocksToAdd.reduce((sum, block) => {
        const start = new Date(block.start);
        const end = new Date(block.end);
        return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }, 0);

      alert(`✅ Added ${blocksToAdd.length} blocks to your calendar!`);
      onScheduled();
      onClose();
    } catch (error) {
      console.error('Error adding to calendar:', error);
      alert('Failed to add events to calendar');
    }
    
    setScheduling(false);
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: string, end: string) => {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const mins = Math.round((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-roman text-2xl text-white mb-2">Schedule: {goal.title}</h2>
        <p className="text-white/50 text-sm mb-4">
          {goal.total_hours - goal.hours_completed}h remaining • 
          Priority: {goal.priority} •
          {goal.deadline ? ` Due: ${new Date(goal.deadline).toLocaleDateString()}` : ' No deadline'}
        </p>

        {/* Stress Level Selector */}
        {blocks.length === 0 && (
          <div className="mb-6">
            <label className="block text-white/60 text-sm mb-2">How are you feeling?</label>
            <div className="flex gap-2">
              <button
                onClick={() => setStressLevel('low')}
                className={`flex-1 py-2 px-4 rounded-lg border transition ${
                  stressLevel === 'low' 
                    ? 'border-green-500 bg-green-500/20 text-green-400' 
                    : 'border-white/10 text-white/50 hover:bg-white/5'
                }`}
              >
                😊 I'm good, let's do this
              </button>
              <button
                onClick={() => setStressLevel('high')}
                className={`flex-1 py-2 px-4 rounded-lg border transition ${
                  stressLevel === 'high' 
                    ? 'border-purple-500 bg-purple-500/20 text-purple-400' 
                    : 'border-white/10 text-white/50 hover:bg-white/5'
                }`}
              >
                😰 Feeling overwhelmed
              </button>
            </div>
          </div>
        )}

        {/* Generate Button */}
        {blocks.length === 0 && (
          <button
            onClick={generateSchedule}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50 mb-4"
          >
            {loading ? '🧠 AI is thinking...' : '✨ Generate Schedule with AI'}
          </button>
        )}

        {/* AI Thinking */}
        {thinking && (
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-white/60 text-sm">🤔 {thinking}</p>
          </div>
        )}

        {/* Suggested Blocks */}
        {blocks.length > 0 && (
          <>
            <div className="space-y-3 mb-4">
              {blocks.map((block, index) => (
                <div
                  key={index}
                  onClick={() => toggleBlock(index)}
                  className={`p-4 rounded-lg border cursor-pointer transition ${
                    selectedBlocks.has(index)
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/10 bg-white/5 opacity-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-white font-medium">{block.title}</h4>
                      <p className="text-white/50 text-sm">
                        {formatTime(block.start)} • {formatDuration(block.start, block.end)}
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedBlocks.has(index) ? 'border-purple-500 bg-purple-500' : 'border-white/30'
                    }`}>
                      {selectedBlocks.has(index) && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>

                  {/* Micro Tasks */}
                  {block.microTasks && block.microTasks.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <p className="text-white/40 text-xs mb-1">Micro-tasks to get started:</p>
                      <ul className="space-y-1">
                        {block.microTasks.map((task, i) => (
                          <li key={i} className="text-white/60 text-sm flex items-center gap-2">
                            <span className="w-4 h-4 rounded border border-white/20 flex items-center justify-center text-xs">
                              {i + 1}
                            </span>
                            {task}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Motivational Note */}
            {motivationalNote && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-green-400 text-sm">💪 {motivationalNote}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setBlocks([]);
                  setThinking('');
                  setMotivationalNote('');
                }}
                className="flex-1 py-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 transition"
              >
                ↻ Regenerate
              </button>
              <button
                onClick={addToCalendar}
                disabled={scheduling || selectedBlocks.size === 0}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 transition disabled:opacity-50"
              >
                {scheduling ? 'Adding...' : `Add ${selectedBlocks.size} blocks to Calendar`}
              </button>
            </div>
          </>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
