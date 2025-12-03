'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  total_hours: number;
  hours_completed: number;
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;
  status: 'active' | 'completed' | 'paused';
  color: string;
}

interface AddGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoalAdded: () => void;
  userId: string;
  editGoal?: Goal | null;
}

export default function AddGoalModal({ isOpen, onClose, onGoalAdded, userId, editGoal }: AddGoalModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalHours, setTotalHours] = useState('');
  const [hoursCompleted, setHoursCompleted] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (editGoal) {
      setTitle(editGoal.title);
      setDescription(editGoal.description || '');
      setTotalHours(editGoal.total_hours.toString());
      setHoursCompleted(editGoal.hours_completed.toString());
      setPriority(editGoal.priority);
      setDeadline(editGoal.deadline ? editGoal.deadline.split('T')[0] : '');
    } else {
      // Reset form
      setTitle('');
      setDescription('');
      setTotalHours('');
      setHoursCompleted('0');
      setPriority('medium');
      setDeadline('');
    }
  }, [editGoal, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !totalHours) return;

    setLoading(true);

    const goalData = {
      user_id: userId,
      title,
      description: description || null,
      total_hours: parseFloat(totalHours),
      hours_completed: parseFloat(hoursCompleted) || 0,
      priority,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (editGoal) {
      // Update existing goal
      await supabase
        .from('goals')
        .update(goalData)
        .eq('id', editGoal.id);
    } else {
      // Create new goal
      await supabase.from('goals').insert({
        ...goalData,
        status: 'active',
        color: '#8B5CF6',
      });
    }

    setLoading(false);
    onGoalAdded();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4">
        <h2 className="font-roman text-xl text-white mb-4">
          {editGoal ? 'Edit Goal' : 'Add New Goal'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Finish CS 61B Project"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
              required
            />
          </div>

          <div>
            <label className="block text-white/60 text-sm mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this goal about?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/60 text-sm mb-1">Total Hours *</label>
              <input
                type="number"
                value={totalHours}
                onChange={(e) => setTotalHours(e.target.value)}
                placeholder="10"
                min="0.5"
                step="0.5"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-1">Hours Done</label>
              <input
                type="number"
                value={hoursCompleted}
                onChange={(e) => setHoursCompleted(e.target.value)}
                placeholder="0"
                min="0"
                step="0.5"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-white/60 text-sm mb-1">Priority</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-lg border transition capitalize ${
                    priority === p
                      ? p === 'high' 
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : p === 'medium'
                        ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                        : 'bg-green-500/20 border-green-500 text-green-400'
                      : 'border-white/10 text-white/40 hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-white/60 text-sm mb-1">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title || !totalHours}
              className="flex-1 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : editGoal ? 'Save Changes' : 'Add Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
