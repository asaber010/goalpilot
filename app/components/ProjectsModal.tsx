'use client';

import { useState } from 'react';
import ProjectsGallery from './ProjectsGallery';
import ProjectCreator from './ProjectCreator';
import ProjectDetail from './ProjectDetail';

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
  daily_target_hours: number | null;  // ADD THIS LINE
  last_session_note: string | null;
  next_session_start: string | null;
  color: string;
}

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  calendarEvents: any[];
  providerToken: string | null;
  onScheduled: () => void;
}

export default function ProjectsModal({ 
  isOpen, 
  onClose, 
  userId, 
  calendarEvents,
  providerToken,
  onScheduled 
}: ProjectsModalProps) {
  const [view, setView] = useState<'gallery' | 'create' | 'detail'>('gallery');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!isOpen) return null;

  const handleCreateProject = () => {
    setView('create');
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setView('detail');
  };

  const handleProjectCreated = () => {
    setRefreshKey(prev => prev + 1);
    setView('gallery');
    onScheduled();
  };

  const handleBack = () => {
    setView('gallery');
    setSelectedProject(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-5xl mx-4 h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {view !== 'gallery' && (
              <button 
                onClick={handleBack}
                className="text-white/50 hover:text-white transition"
              >
                ← Back
              </button>
            )}
            <h2 className="font-roman text-xl text-white">
              {view === 'gallery' && 'Projects'}
              {view === 'create' && 'New Project'}
              {view === 'detail' && selectedProject?.title}
            </h2>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition text-2xl">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-60px)] overflow-y-auto">
          {view === 'gallery' && (
            <ProjectsGallery 
              key={refreshKey}
              userId={userId} 
              onCreateProject={handleCreateProject}
              onSelectProject={handleSelectProject}
            />
          )}
          
          {view === 'create' && (
            <div className="h-full">
              <ProjectCreator
                isOpen={true}
                onClose={handleBack}
                userId={userId}
                calendarEvents={calendarEvents}
                onProjectCreated={handleProjectCreated}
                providerToken={providerToken}
              />
            </div>
          )}

          {view === 'detail' && selectedProject && (
            <ProjectDetail
              project={selectedProject}
              userId={userId}
              calendarEvents={calendarEvents}
              providerToken={providerToken}
              onScheduled={onScheduled}
              onUpdate={() => setRefreshKey(prev => prev + 1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
