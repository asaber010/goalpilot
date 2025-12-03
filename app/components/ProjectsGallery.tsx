'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Project {
  id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  specific: string | null;
  measurable: string | null;
  deadline: string | null;
  status: 'planning' | 'active' | 'paused' | 'completed';
  progress_percent: number;
  total_hours_needed: number | null;
  hours_completed: number;
  daily_target_hours: number | null;
  last_session_note: string | null;
  next_session_start: string | null;
  color: string;
  review_frequency?: string;
}

interface ProjectsGalleryProps {
  userId: string;
  onCreateProject: () => void;
  onSelectProject: (project: Project) => void;
}

export default function ProjectsGallery({ userId, onCreateProject, onSelectProject }: ProjectsGalleryProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, [userId]);

  const fetchProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (data) setProjects(data);
    setLoading(false);
  };

  const getDaysRemaining = (deadline: string) => {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { text: 'Overdue', color: 'text-red-400' };
    if (days === 0) return { text: 'Today', color: 'text-orange-400' };
    if (days === 1) return { text: '1 day', color: 'text-yellow-400' };
    if (days <= 7) return { text: `${days} days`, color: 'text-white' };
    return { text: `${days} days`, color: 'text-white/60' };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'planning': return 'bg-yellow-500';
      case 'paused': return 'bg-orange-500';
      case 'completed': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its data?')) return;
    
    await supabase.from('projects').delete().eq('id', projectId);
    setProjects(projects.filter(p => p.id !== projectId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/50">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-roman text-2xl text-white">Projects</h2>
        <button
          onClick={onCreateProject}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition flex items-center gap-2"
        >
          <span>+</span> New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed border-white/20 rounded-xl">
          <p className="text-white/50 mb-4">No projects yet</p>
          <button
            onClick={onCreateProject}
            className="text-purple-400 hover:text-purple-300 transition"
          >
            Create your first project →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const deadlineInfo = project.deadline ? getDaysRemaining(project.deadline) : null;
            
            return (
              <div
                key={project.id}
                onClick={() => onSelectProject(project)}
                onMouseEnter={() => setHoveredId(project.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative group cursor-pointer rounded-xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
              >
                {/* Cover Image or Gradient */}
                <div 
                  className="h-36 relative"
                  style={{
                    background: project.cover_image 
                      ? `url(${project.cover_image}) center/cover`
                      : `linear-gradient(135deg, ${project.color}40, ${project.color}10)`
                  }}
                >
                  {/* Status Badge */}
                  <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs text-white ${getStatusColor(project.status)}`}>
                    {project.status}
                  </div>

                  {/* Review Badge */}
                  {project.review_frequency && project.review_frequency !== 'none' && (
                    <div className="absolute top-3 left-20 px-2 py-1 rounded-full text-xs bg-purple-500/50 text-purple-200">
                      {project.review_frequency}
                    </div>
                  )}

                  {/* Delete Button */}
                  {hoveredId === project.id && (
                    <button
                      onClick={(e) => deleteProject(e, project.id)}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition"
                    >
                      ×
                    </button>
                  )}

                  {/* Countdown */}
                  {deadlineInfo && (
                    <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/60 backdrop-blur-sm">
                      <span className={`text-sm font-medium ${deadlineInfo.color}`}>
                        {deadlineInfo.text}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="text-white font-medium mb-1 truncate">{project.title}</h3>
                  <p className="text-white/50 text-sm mb-3 line-clamp-2">
                    {project.specific || project.description || 'No description'}
                  </p>

                  {/* Progress Bar */}
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-white/40 mb-1">
                      <span>{project.hours_completed}h / {project.total_hours_needed || '?'}h</span>
                      <span>{project.progress_percent}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${project.progress_percent}%`,
                          backgroundColor: project.color 
                        }}
                      />
                    </div>
                  </div>

                  {/* Next Session Note */}
                  {project.next_session_start && (
                    <div className="mt-3 p-2 rounded bg-purple-500/10 border border-purple-500/20">
                      <p className="text-xs text-purple-300 truncate">
                        🎯 {project.next_session_start}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
