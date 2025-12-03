'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import AddGoalModal from './AddGoalModal';
import MotionButton from './MotionButton';

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

interface GoalsSidebarProps {
  userId: string;
  onScheduleGoal: (goal: Goal) => void;
  onGoalsChanged?: () => void;
}

export default function GoalsSidebar({ userId, onScheduleGoal, onGoalsChanged }: GoalsSidebarProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGoals();
  }, [userId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
        setDeleteConfirmId(null);
      }
    };

    if (menuOpenId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpenId]);

  const fetchGoals = async () => {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('deadline', { ascending: true });

    if (error) {
      console.error('Error fetching goals:', error);
    }
    if (data) setGoals(data);
    setLoading(false);
  };

  const handleGoalAdded = () => {
    fetchGoals();
    setIsAddModalOpen(false);
    setEditingGoal(null);
    onGoalsChanged?.();
  };

  const deleteGoal = async (goalId: string) => {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', goalId)
      .eq('user_id', userId); // Extra safety check

    if (error) {
      console.error('Error deleting goal:', error);
      alert('Failed to delete goal. Please try again.');
      return;
    }

    // Immediately update local state
    setGoals(goals.filter(g => g.id !== goalId));
    setMenuOpenId(null);
    setDeleteConfirmId(null);
    onGoalsChanged?.();
  };

  const markComplete = async (goalId: string) => {
    const { error } = await supabase
      .from('goals')
      .update({ status: 'completed' })
      .eq('id', goalId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error completing goal:', error);
      return;
    }

    setGoals(goals.filter(g => g.id !== goalId));
    setMenuOpenId(null);
    onGoalsChanged?.();
  };

  const editGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setIsAddModalOpen(true);
    setMenuOpenId(null);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-red-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-gray-500';
    }
  };

  const formatDeadline = (deadline: string) => {
    const date = new Date(deadline);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'Overdue', color: 'text-red-400' };
    if (diffDays === 0) return { text: 'Today', color: 'text-orange-400' };
    if (diffDays === 1) return { text: 'Tomorrow', color: 'text-yellow-400' };
    if (diffDays <= 7) return { text: `${diffDays} days`, color: 'text-white/60' };
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'text-white/40' };
  };

  return (
    <div className="w-64 p-4 border-r border-white/[0.05] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-roman text-lg text-white">Goals</h2>
        <MotionButton
          size="sm"
          onClick={() => {
            setEditingGoal(null);
            setIsAddModalOpen(true);
          }}
        >
          +
        </MotionButton>
      </div>

      {loading ? (
        <p className="text-white/30 text-sm">Loading...</p>
      ) : goals.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-white/30 text-sm mb-2">No goals yet</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="text-purple-400 text-sm hover:text-purple-300 transition"
          >
            + Add your first goal
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {goals.map((goal, index) => {
              const progress = goal.total_hours > 0 
                ? Math.round((goal.hours_completed / goal.total_hours) * 100) 
                : 0;
              const deadlineInfo = goal.deadline ? formatDeadline(goal.deadline) : null;
              const isMenuOpen = menuOpenId === goal.id;

              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`
                    relative p-3 rounded-xl 
                    bg-white/[0.03] backdrop-blur-sm
                    border-l-4 ${getPriorityColor(goal.priority)}
                    border border-white/[0.05]
                    hover:bg-white/[0.06] transition-all duration-200
                    group
                    ${isMenuOpen ? 'z-50' : 'z-10'}
                  `}
                  style={{ position: 'relative' }}
                  ref={isMenuOpen ? menuRef : null}
                >
                  {/* Menu Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(isMenuOpen ? null : goal.id);
                      setDeleteConfirmId(null);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded text-white/30 hover:text-white hover:bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10"
                  >
                    ⋮
                  </button>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {isMenuOpen && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                        className="absolute top-8 right-2 bg-[#1a1a2e] backdrop-blur-xl border border-white/20 rounded-xl shadow-2xl py-1 min-w-[140px] overflow-hidden z-[100]"
                        style={{ 
                          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => editGoal(goal)}
                          className="w-full px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 transition flex items-center gap-2"
                        >
                          <span>✏️</span> Edit
                        </button>
                        <button
                          onClick={() => markComplete(goal.id)}
                          className="w-full px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 transition flex items-center gap-2"
                        >
                          <span>✓</span> Complete
                        </button>
                        
                        {/* Delete with confirmation */}
                        {deleteConfirmId === goal.id ? (
                          <div className="px-2 py-2 border-t border-white/10">
                            <p className="text-xs text-white/50 mb-2 px-2">Delete this goal?</p>
                            <div className="flex gap-1">
                              <button
                                onClick={() => deleteGoal(goal.id)}
                                className="flex-1 px-2 py-1.5 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition"
                              >
                                Yes, delete
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="flex-1 px-2 py-1.5 text-xs bg-white/10 text-white/60 rounded hover:bg-white/20 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(goal.id)}
                            className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 transition flex items-center gap-2 border-t border-white/10"
                          >
                            <span>🗑️</span> Delete
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Goal Content */}
                  <div onClick={() => onScheduleGoal(goal)} className="cursor-pointer">
                    <h3 className="text-white text-sm font-medium pr-6 mb-1">{goal.title}</h3>
                    
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-white/40">
                        {goal.hours_completed}h / {goal.total_hours}h
                      </span>
                      {deadlineInfo && (
                        <span className={deadlineInfo.color}>{deadlineInfo.text}</span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1 bg-white/[0.08] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-purple-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Schedule Button */}
                  <button
                    onClick={() => onScheduleGoal(goal)}
                    className="mt-2 w-full text-xs text-purple-400 hover:text-purple-300 transition text-left opacity-0 group-hover:opacity-100"
                  >
                    Schedule with AI →
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Backdrop to close menu */}
      {menuOpenId && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => {
            setMenuOpenId(null);
            setDeleteConfirmId(null);
          }}
        />
      )}

      <AddGoalModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingGoal(null);
        }}
        onGoalAdded={handleGoalAdded}
        userId={userId}
        editGoal={editingGoal}
      />
    </div>
  );
}
