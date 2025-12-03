'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: any[];
}

interface ProjectCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  calendarEvents: any[];
  onProjectCreated: () => void;
  providerToken?: string | null;
}

interface ProjectData {
  title?: string;
  specific?: string;
  measurable?: string;
  deadline?: string;
  total_hours_needed?: number;
  daily_target_hours?: number;
  preferred_times?: string;
  session_length?: number;
  stress_level?: string;
  tasks?: string[];
}

export default function ProjectCreator({ 
  isOpen, 
  onClose, 
  userId, 
  calendarEvents, 
  onProjectCreated,
  providerToken 
}: ProjectCreatorProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey! 🚀 Let's create a project together. What are you working on? Could be an exam, interview, assignment, or any goal you want to crush."
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectData, setProjectData] = useState<ProjectData>({});
  const [stage, setStage] = useState<'gathering' | 'preferences' | 'scheduling' | 'confirming'>('gathering');
  const [scheduleSuggestions, setScheduleSuggestions] = useState<any[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setMessages([{
        role: 'assistant',
        content: "Hey! 🚀 Let's create a project together. What are you working on? Could be an exam, interview, assignment, or any goal you want to crush."
      }]);
      setProjectData({});
      setStage('gathering');
      setScheduleSuggestions([]);
      setSelectedSlots([]);
    }
  }, [isOpen]);

  const createProject = async (finalData: ProjectData, scheduleSlots: any[] = []) => {
    // Create the project
    const { data: project, error } = await supabase.from('projects').insert({
      user_id: userId,
      title: finalData.title || 'New Project',
      specific: finalData.specific,
      measurable: finalData.measurable,
      deadline: finalData.deadline ? new Date(finalData.deadline).toISOString() : null,
      total_hours_needed: finalData.total_hours_needed,
      daily_target_hours: finalData.daily_target_hours,
      status: 'active',
      progress_percent: 0,
    }).select().single();

    if (error) {
      console.error('Failed to create project:', error);
      return false;
    }

    // Add tasks if any
    if (finalData.tasks && finalData.tasks.length > 0 && project) {
      const tasksToInsert = finalData.tasks.map((task, index) => ({
        project_id: project.id,
        user_id: userId,
        title: task,
        order_index: index,
      }));
      await supabase.from('project_tasks').insert(tasksToInsert);
    }

    // Schedule calendar events if slots were selected
    if (scheduleSlots.length > 0 && providerToken) {
      for (const slot of scheduleSlots) {
        try {
          await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${providerToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: `📚 ${finalData.title}`,
              description: `Goal: ${finalData.measurable || finalData.specific || ''}`,
              start: { dateTime: slot.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
              end: { dateTime: slot.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
              colorId: '9',
            }),
          });
        } catch (e) {
          console.error('Failed to create calendar event:', e);
        }
      }
    }

    return true;
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('/api/project-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: messages,
          currentProjectData: projectData,
          stage,
          calendarEvents: calendarEvents.map(e => ({
            title: e.summary,
            start: e.start.dateTime || e.start.date,
            end: e.end.dateTime || e.end.date,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update project data
        if (data.extractedData) {
          setProjectData(prev => {
            const updated = { ...prev };
            Object.entries(data.extractedData).forEach(([key, value]) => {
              if (value !== null && value !== undefined && value !== '') {
                (updated as any)[key] = value;
              }
            });
            return updated;
          });
        }

        // Update stage
        if (data.newStage) {
          setStage(data.newStage);
        }

        // Store schedule suggestions
        if (data.scheduleSuggestions) {
          setScheduleSuggestions(data.scheduleSuggestions);
        }

        // Add message with suggestions if any
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message,
          suggestions: data.scheduleSuggestions,
        }]);

        // Create project if ready
        if (data.createProject && data.projectData) {
          const success = await createProject(data.projectData, selectedSlots);
          if (success) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `✅ Project created! ${selectedSlots.length > 0 ? `I've also added ${selectedSlots.length} study sessions to your calendar.` : ''} Check your Projects gallery to see it!`
            }]);
            setTimeout(() => {
              onProjectCreated();
              onClose();
            }, 2000);
          }
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "Sorry, had trouble with that. Try again?"
        }]);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Connection issue. Try again?"
      }]);
    }

    setLoading(false);
  };

  const toggleSlotSelection = (slot: any) => {
    setSelectedSlots(prev => {
      const exists = prev.some(s => s.day === slot.day && s.time === slot.time);
      if (exists) {
        return prev.filter(s => !(s.day === slot.day && s.time === slot.time));
      } else {
        return [...prev, slot];
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-2xl mx-4 h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="font-roman text-xl text-white">Create New Project</h2>
            <p className="text-white/50 text-sm">
              {stage === 'gathering' && 'Tell me about your project'}
              {stage === 'preferences' && 'Understanding your work style'}
              {stage === 'scheduling' && 'Finding the best times'}
              {stage === 'confirming' && 'Almost done!'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition text-2xl">
            ×
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-2 border-b border-white/10">
          <div className="flex gap-1">
            {['gathering', 'preferences', 'scheduling', 'confirming'].map((s, i) => (
              <div 
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  ['gathering', 'preferences', 'scheduling', 'confirming'].indexOf(stage) >= i 
                    ? 'bg-purple-500' 
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Project summary if we have data */}
        {Object.keys(projectData).length > 0 && (
          <div className="px-4 py-2 bg-purple-900/20 border-b border-purple-500/20">
            <div className="flex flex-wrap gap-3 text-xs">
              {projectData.title && (
                <span className="text-purple-300">📌 {projectData.title}</span>
              )}
              {projectData.deadline && (
                <span className="text-purple-300">📅 Due: {new Date(projectData.deadline).toLocaleDateString()}</span>
              )}
              {projectData.total_hours_needed && (
                <span className="text-purple-300">⏱️ {projectData.total_hours_needed}h total</span>
              )}
              {projectData.stress_level && (
                <span className={`${
                  projectData.stress_level === 'high' ? 'text-red-300' : 
                  projectData.stress_level === 'medium' ? 'text-yellow-300' : 'text-green-300'
                }`}>
                  {projectData.stress_level === 'high' ? '😰' : projectData.stress_level === 'medium' ? '😊' : '💪'} {projectData.stress_level} stress
                </span>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i}>
              <div 
                className={`p-3 rounded-lg ${
                  msg.role === 'assistant' 
                    ? 'bg-purple-900/30 text-white/90' 
                    : 'bg-white/10 text-white ml-8'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
              </div>
              
              {/* Schedule suggestions as clickable cards */}
              {msg.suggestions && msg.suggestions.length > 0 && (
                <div className="mt-3 ml-4 grid grid-cols-2 gap-2">
                  {msg.suggestions.map((slot: any, j: number) => {
                    const isSelected = selectedSlots.some(s => s.day === slot.day && s.time === slot.time);
                    return (
                      <button
                        key={j}
                        onClick={() => toggleSlotSelection(slot)}
                        className={`p-3 rounded-lg text-left transition ${
                          isSelected 
                            ? 'bg-purple-600 border-purple-400' 
                            : 'bg-white/5 hover:bg-white/10 border-white/10'
                        } border`}
                      >
                        <div className="text-white text-sm font-medium">{slot.day}</div>
                        <div className="text-white/60 text-xs">{slot.time}</div>
                        {isSelected && <div className="text-purple-200 text-xs mt-1">✓ Selected</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          
          {loading && (
            <div className="p-3 rounded-lg bg-purple-900/30 text-white/50 animate-pulse">
              thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Selected slots summary */}
        {selectedSlots.length > 0 && (
          <div className="px-4 py-2 border-t border-white/10 bg-purple-900/20">
            <div className="text-xs text-purple-300">
              📅 {selectedSlots.length} time slot{selectedSlots.length > 1 ? 's' : ''} selected
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-white/10">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Tell me more..."
              disabled={loading}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
