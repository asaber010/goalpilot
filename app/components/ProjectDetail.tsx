'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface Project {
  id: string;
  title: string;
  specific: string | null;
  measurable: string | null;
  deadline: string | null;
  status: string;
  progress_percent: number;
  total_hours_needed: number | null;
  hours_completed: number;
  daily_target_hours: number | null;
  last_session_note: string | null;
  next_session_start: string | null;
  color: string;
  cover_image?: string | null;
  review_frequency?: string;
  ai_plan?: any;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  notes: string | null;
}

interface SessionLog {
  id: string;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  note: string | null;
  next_steps: string | null;
}

interface ProjectDetailProps {
  project: Project;
  userId: string;
  calendarEvents: any[];
  providerToken: string | null;
  onScheduled: () => void;
  onUpdate: () => void;
}

export default function ProjectDetail({ 
  project, 
  userId, 
  calendarEvents,
  providerToken,
  onScheduled,
  onUpdate 
}: ProjectDetailProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [newTask, setNewTask] = useState('');
  const [notes, setNotes] = useState('');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaved, setNotesSaved] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'notes' | 'logs' | 'ai'>('overview');
  const [coverImage, setCoverImage] = useState(project.cover_image || '');
  const [isDragging, setIsDragging] = useState(false);
  const [reviewFrequency, setReviewFrequency] = useState(project.review_frequency || 'weekly');
  const [aiChat, setAiChat] = useState<{ role: string; content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchTasks();
    fetchSessionLogs();
    fetchNotes();
  }, [project.id]);

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', project.id)
      .order('order_index');
    if (data) setTasks(data);
  };

  const fetchSessionLogs = async () => {
    const { data } = await supabase
      .from('session_logs')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false });
    if (data) setSessionLogs(data);
  };

  const fetchNotes = async () => {
    const { data } = await supabase
      .from('project_notes')
      .select('*')
      .eq('project_id', project.id)
      .single();
    
    if (data) {
      setNotes(data.content);
    }
  };

  // Auto-save notes with debounce
  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesSaved(false);

    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current);
    }

    notesTimeoutRef.current = setTimeout(async () => {
      await saveNotes(value);
    }, 1000);
  };

  const saveNotes = async (content: string) => {
    setNotesLoading(true);
    
    // Upsert notes
    const { data: existing } = await supabase
      .from('project_notes')
      .select('id')
      .eq('project_id', project.id)
      .single();

    if (existing) {
      await supabase
        .from('project_notes')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('project_notes').insert({
        project_id: project.id,
        user_id: userId,
        content,
      });
    }

    setNotesLoading(false);
    setNotesSaved(true);
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    
    await supabase.from('project_tasks').insert({
      project_id: project.id,
      user_id: userId,
      title: newTask,
      order_index: tasks.length,
    });
    
    setNewTask('');
    fetchTasks();
    updateProgress();
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    await supabase
      .from('project_tasks')
      .update({ completed: !completed })
      .eq('id', taskId);
    
    fetchTasks();
    updateProgress();
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from('project_tasks').delete().eq('id', taskId);
    fetchTasks();
    updateProgress();
  };

  const updateProgress = async () => {
    const { data: allTasks } = await supabase
      .from('project_tasks')
      .select('completed')
      .eq('project_id', project.id);

    if (allTasks && allTasks.length > 0) {
      const completedCount = allTasks.filter(t => t.completed).length;
      const progress = Math.round((completedCount / allTasks.length) * 100);
      
      await supabase
        .from('projects')
        .update({ progress_percent: progress })
        .eq('id', project.id);
      
      onUpdate();
    }
  };

  // Image handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      await uploadImage(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadImage(file);
    }
  };

  const uploadImage = async (file: File) => {
    // Convert to base64 for simple storage (for production, use Supabase Storage)
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setCoverImage(base64);
      
      await supabase
        .from('projects')
        .update({ cover_image: base64 })
        .eq('id', project.id);
      
      onUpdate();
    };
    reader.readAsDataURL(file);
  };

  const removeImage = async () => {
    setCoverImage('');
    await supabase
      .from('projects')
      .update({ cover_image: null })
      .eq('id', project.id);
    onUpdate();
  };

  // Review frequency
  const updateReviewFrequency = async (freq: string) => {
    setReviewFrequency(freq);
    
    const nextReview = new Date();
    if (freq === 'weekly') {
      nextReview.setDate(nextReview.getDate() + 7);
    } else if (freq === 'biweekly') {
      nextReview.setDate(nextReview.getDate() + 14);
    }

    await supabase
      .from('projects')
      .update({ 
        review_frequency: freq,
        next_review_date: freq !== 'none' ? nextReview.toISOString() : null,
      })
      .eq('id', project.id);
  };

  // AI Chat for plan adjustments
  const sendToAI = async () => {
    if (!aiInput.trim() || aiLoading) return;

    const userMessage = aiInput.trim();
    setAiInput('');
    setAiChat(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiLoading(true);

    try {
      const response = await fetch('/api/project-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          project: {
            ...project,
            tasks: tasks.map(t => ({ title: t.title, completed: t.completed })),
            notes,
            sessionLogs: sessionLogs.slice(0, 5),
          },
          calendarEvents: calendarEvents.slice(0, 20),
          conversationHistory: aiChat.slice(-10),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAiChat(prev => [...prev, { role: 'assistant', content: data.message }]);

        // Handle any actions the AI wants to take
        if (data.action?.type === 'UPDATE_PLAN') {
          await supabase
            .from('projects')
            .update({ ai_plan: data.action.plan })
            .eq('id', project.id);
          onUpdate();
        }

        if (data.action?.type === 'ADD_TASKS' && data.action.tasks) {
          for (const task of data.action.tasks) {
            await supabase.from('project_tasks').insert({
              project_id: project.id,
              user_id: userId,
              title: task,
              order_index: tasks.length,
            });
          }
          fetchTasks();
        }

        if (data.action?.type === 'SCHEDULE_SESSIONS' && data.action.sessions && providerToken) {
          for (const session of data.action.sessions) {
            await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${providerToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                summary: `📚 ${project.title}`,
                start: { dateTime: session.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                end: { dateTime: session.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
              }),
            });
          }
          onScheduled();
        }
      }
    } catch (error) {
      console.error('AI error:', error);
      setAiChat(prev => [...prev, { role: 'assistant', content: 'Sorry, had trouble with that. Try again?' }]);
    }

    setAiLoading(false);
  };

  const getDaysRemaining = () => {
    if (!project.deadline) return null;
    const days = Math.ceil((new Date(project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysRemaining = getDaysRemaining();

  return (
    <div className="p-6">
      {/* Cover Image Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !coverImage && fileInputRef.current?.click()}
        className={`relative h-48 rounded-xl mb-6 overflow-hidden cursor-pointer transition-all ${
          isDragging ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-black' : ''
        }`}
        style={{
          background: coverImage 
            ? `url(${coverImage}) center/cover`
            : `linear-gradient(135deg, ${project.color}40, ${project.color}10)`
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {!coverImage && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="text-center">
              <p className="text-white/60 text-sm">Drag & drop an image</p>
              <p className="text-white/40 text-xs">or click to upload</p>
            </div>
          </div>
        )}

        {coverImage && (
          <button
            onClick={(e) => { e.stopPropagation(); removeImage(); }}
            className="absolute top-3 right-3 px-3 py-1 rounded-lg bg-black/50 text-white text-sm hover:bg-black/70 transition"
          >
            Remove
          </button>
        )}

        {/* Overlay with project info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <h1 className="font-roman text-2xl text-white">{project.title}</h1>
          <p className="text-white/70 text-sm">{project.specific || project.measurable}</p>
        </div>

        {/* Countdown */}
        {daysRemaining !== null && (
          <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-black/50">
            <span className={`text-lg font-bold ${daysRemaining <= 3 ? 'text-red-400' : 'text-white'}`}>
              {daysRemaining}
            </span>
            <span className="text-white/60 text-sm ml-1">days left</span>
          </div>
        )}
      </div>

      {/* Progress & Quick Actions */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <div className="flex justify-between text-sm text-white/60 mb-1">
            <span>{project.hours_completed}h / {project.total_hours_needed || '?'}h</span>
            <span>{project.progress_percent}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${project.progress_percent}%`, backgroundColor: project.color }}
            />
          </div>
        </div>

        {/* Review Frequency */}
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs">Review:</span>
          <select
            value={reviewFrequency}
            onChange={(e) => updateReviewFrequency(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none"
          >
            <option value="weekly" className="bg-[#0a0a0f]">Weekly</option>
            <option value="biweekly" className="bg-[#0a0a0f]">Biweekly</option>
            <option value="none" className="bg-[#0a0a0f]">None</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 mb-6 overflow-x-auto">
        {['overview', 'tasks', 'notes', 'logs', 'ai'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm transition whitespace-nowrap ${
              activeTab === tab 
                ? 'text-white border-b-2 border-purple-500' 
                : 'text-white/50 hover:text-white'
            }`}
          >
            {tab === 'ai' ? '🤖 AI Assistant' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-white font-medium mb-3">📊 Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/50">Daily target:</span>
                <span className="text-white">{project.daily_target_hours || '?'}h/day</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Tasks:</span>
                <span className="text-white">{tasks.filter(t => t.completed).length}/{tasks.length} done</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Sessions:</span>
                <span className="text-white">{sessionLogs.length} logged</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/50">Review:</span>
                <span className="text-white capitalize">{reviewFrequency}</span>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-white font-medium mb-3">🎯 Next Session</h3>
            <p className="text-white/70 text-sm">
              {project.next_session_start || 'No session note yet. Add one in the Notes tab!'}
            </p>
          </div>

          {/* Recent Tasks Preview */}
          <div className="col-span-2 bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-white font-medium mb-3">Recent Tasks</h3>
            <div className="space-y-2">
              {tasks.slice(0, 5).map(task => (
                <div key={task.id} className="flex items-center gap-2 text-sm">
                  <span className={task.completed ? 'text-green-400' : 'text-white/40'}>
                    {task.completed ? '✓' : '○'}
                  </span>
                  <span className={task.completed ? 'text-white/50 line-through' : 'text-white'}>
                    {task.title}
                  </span>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-white/40 text-sm">No tasks yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
              placeholder="Add a task..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
            />
            <button
              onClick={addTask}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition"
            >
              Add
            </button>
          </div>

          <div className="space-y-2">
            {tasks.map(task => (
              <div
                key={task.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition group ${
                  task.completed 
                    ? 'bg-white/5 border-white/5' 
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <button
                  onClick={() => toggleTask(task.id, task.completed)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                    task.completed 
                      ? 'bg-green-500 border-green-500' 
                      : 'border-white/30 hover:border-white/50'
                  }`}
                >
                  {task.completed && <span className="text-white text-xs">✓</span>}
                </button>
                <span className={`flex-1 text-white ${task.completed ? 'line-through opacity-50' : ''}`}>
                  {task.title}
                </span>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-red-400/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                >
                  ×
                </button>
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="text-white/30 text-center py-8">No tasks yet. Add some above!</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white/50 text-sm">
              Write notes, track scores, plan next steps. AI can read this!
            </p>
            <span className={`text-xs ${notesSaved ? 'text-green-400' : 'text-yellow-400'}`}>
              {notesLoading ? 'Saving...' : notesSaved ? '✓ Saved' : 'Unsaved'}
            </span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="# My Notes

## Progress
- Completed chapter 1 review
- Score on practice test: 85%

## Next Session
- Review chapter 2
- Focus on weak areas: recursion, dynamic programming

## Questions to Ask
- How to approach tree problems?
"
            className="w-full h-96 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50 resize-none font-mono text-sm leading-relaxed"
          />
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-3">
          {sessionLogs.length === 0 ? (
            <p className="text-white/30 text-center py-8">No sessions logged yet.</p>
          ) : (
            sessionLogs.map(log => (
              <div key={log.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="flex justify-between text-sm text-white/50 mb-2">
                  <span>{new Date(log.started_at).toLocaleDateString()}</span>
                  <span>{log.duration_minutes} min</span>
                </div>
                {log.note && <p className="text-white mb-2">{log.note}</p>}
                {log.next_steps && (
                  <p className="text-purple-300 text-sm">→ Next: {log.next_steps}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="flex flex-col h-96">
          <p className="text-white/50 text-sm mb-3">
            Ask me to adjust your plan, add tasks, schedule sessions, or analyze your progress.
          </p>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
            {aiChat.length === 0 && (
              <div className="text-white/30 text-center py-8">
                <p>Try asking:</p>
                <p className="text-purple-400 mt-2">"Reschedule my plan to be less intense"</p>
                <p className="text-purple-400">"Add some tasks for chapter 3"</p>
                <p className="text-purple-400">"How am I doing on this project?"</p>
              </div>
            )}
            {aiChat.map((msg, i) => (
              <div 
                key={i} 
                className={`p-3 rounded-lg ${
                  msg.role === 'assistant' 
                    ? 'bg-purple-900/30 text-white/90' 
                    : 'bg-white/10 text-white ml-8'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed text-sm">
                  {msg.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="p-3 rounded-lg bg-purple-900/30 text-white/50 animate-pulse text-sm">
                thinking...
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendToAI()}
              placeholder="Ask me to adjust your plan..."
              disabled={aiLoading}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
            />
            <button
              onClick={sendToAI}
              disabled={aiLoading || !aiInput.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
