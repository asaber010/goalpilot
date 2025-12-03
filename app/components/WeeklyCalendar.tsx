'use client';

import { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
}

interface ScheduledBlock {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'completed' | 'skipped';
  goal_id?: string;
  project_id?: string;
  notes?: string;
  google_event_id?: string;
}

interface WeeklyCalendarProps {
  events: CalendarEvent[];
  userId?: string;
  providerToken?: string | null;
  onBlocksChanged?: () => void;
}

export default function WeeklyCalendar({ events, userId, providerToken, onBlocksChanged }: WeeklyCalendarProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [blocks, setBlocks] = useState<ScheduledBlock[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduledBlock | null>(null);
  const [editingGoogleEvent, setEditingGoogleEvent] = useState<CalendarEvent | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: Date; hour: number } | null>(null);
  const [draggedBlock, setDraggedBlock] = useState<ScheduledBlock | null>(null);
  const [draggedGoogleEvent, setDraggedGoogleEvent] = useState<CalendarEvent | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ dayIndex: number; hour: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [syncToGoogle, setSyncToGoogle] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetchBlocks();
  }, [userId]);

  const fetchBlocks = async () => {
    if (!userId) return;

    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const { data, error } = await supabase
      .from('scheduled_blocks')
      .select('*')
      .eq('user_id', userId)
      .gte('start_time', startOfWeek.toISOString())
      .lte('start_time', endOfWeek.toISOString())
      .order('start_time', { ascending: true });

    if (error) console.error('Error fetching blocks:', error);
    if (data) setBlocks(data);
  };

  const weekDays = useMemo(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      return date;
    });
  }, []);

  const hours = Array.from({ length: 14 }, (_, i) => i + 7);

  const getEventStyle = (event: CalendarEvent) => {
    const colors: Record<string, string> = {
      '1': 'bg-blue-500/30 border-blue-400/50 text-blue-200',
      '2': 'bg-green-500/30 border-green-400/50 text-green-200',
      '3': 'bg-purple-500/30 border-purple-400/50 text-purple-200',
      '4': 'bg-red-500/30 border-red-400/50 text-red-200',
      '5': 'bg-yellow-500/30 border-yellow-400/50 text-yellow-200',
      '6': 'bg-orange-500/30 border-orange-400/50 text-orange-200',
      '7': 'bg-cyan-500/30 border-cyan-400/50 text-cyan-200',
      '8': 'bg-gray-500/30 border-gray-400/50 text-gray-200',
      '9': 'bg-indigo-500/30 border-indigo-400/50 text-indigo-200',
      '10': 'bg-emerald-500/30 border-emerald-400/50 text-emerald-200',
      '11': 'bg-pink-500/30 border-pink-400/50 text-pink-200',
    };
    return colors[event.colorId || '3'] || colors['3'];
  };

  const getEventsForDay = (date: Date) => {
    return events.filter((event) => {
      const eventDate = new Date(event.start.dateTime || event.start.date || '');
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const getBlocksForDay = (date: Date) => {
    return blocks.filter((block) => {
      const blockDate = new Date(block.start_time);
      return blockDate.toDateString() === date.toDateString();
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getCurrentTimePosition = () => {
    const hour = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    if (hour < 7 || hour > 20) return null;
    return ((hour - 7) + minutes / 60) * 60;
  };

  const currentTimePos = getCurrentTimePosition();

  // Google Calendar API helpers
  const createGoogleEvent = async (title: string, startTime: Date, endTime: Date) => {
    if (!providerToken) return null;

    try {
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${providerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: title,
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() },
          }),
        }
      );

      if (!response.ok) {
        console.error('Failed to create Google event:', await response.text());
        return null;
      }

      const data = await response.json();
      return data.id;
    } catch (error) {
      console.error('Error creating Google event:', error);
      return null;
    }
  };

  const updateGoogleEvent = async (eventId: string, title: string, startTime: Date, endTime: Date) => {
    if (!providerToken) return false;

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${providerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: title,
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() },
          }),
        }
      );

      if (!response.ok) {
        console.error('Failed to update Google event:', await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating Google event:', error);
      return false;
    }
  };

  const deleteGoogleEvent = async (eventId: string) => {
    if (!providerToken) return false;

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${providerToken}`,
          },
        }
      );

      return response.ok || response.status === 404;
    } catch (error) {
      console.error('Error deleting Google event:', error);
      return false;
    }
  };

  // Handle clicking empty slot
  const handleSlotClick = (date: Date, hour: number) => {
    setSelectedSlot({ date, hour });
    setEditingBlock(null);
    setEditingGoogleEvent(null);

    const startTime = new Date(date);
    startTime.setHours(hour, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(hour + 1);

    setFormTitle('');
    setFormStartTime(startTime.toTimeString().slice(0, 5));
    setFormEndTime(endTime.toTimeString().slice(0, 5));
    setFormNotes('');
    setSyncToGoogle(!!providerToken);
    setIsModalOpen(true);
  };

  // Handle clicking existing block
  const handleBlockClick = (block: ScheduledBlock, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBlock(block);
    setEditingGoogleEvent(null);
    setSelectedSlot(null);

    const startTime = new Date(block.start_time);
    const endTime = new Date(block.end_time);

    setFormTitle(block.title);
    setFormStartTime(startTime.toTimeString().slice(0, 5));
    setFormEndTime(endTime.toTimeString().slice(0, 5));
    setFormNotes(block.notes || '');
    setSyncToGoogle(!!block.google_event_id);
    setIsModalOpen(true);
  };

  // Handle clicking Google Calendar event
  const handleGoogleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGoogleEvent(event);
    setEditingBlock(null);
    setSelectedSlot(null);

    const startTime = new Date(event.start.dateTime || event.start.date || '');
    const endTime = new Date(event.end.dateTime || event.end.date || '');

    setFormTitle(event.summary);
    setFormStartTime(startTime.toTimeString().slice(0, 5));
    setFormEndTime(endTime.toTimeString().slice(0, 5));
    setFormNotes('');
    setSyncToGoogle(true);
    setIsModalOpen(true);
  };

  // Save block
  const handleSaveBlock = async () => {
    if (!userId || !formTitle.trim()) return;
    setSaving(true);

    const baseDate = editingBlock
      ? new Date(editingBlock.start_time)
      : editingGoogleEvent
      ? new Date(editingGoogleEvent.start.dateTime || editingGoogleEvent.start.date || '')
      : selectedSlot?.date || new Date();

    const [startHour, startMin] = formStartTime.split(':').map(Number);
    const [endHour, endMin] = formEndTime.split(':').map(Number);

    const startTime = new Date(baseDate);
    startTime.setHours(startHour, startMin, 0, 0);

    const endTime = new Date(baseDate);
    endTime.setHours(endHour, endMin, 0, 0);

    try {
      if (editingGoogleEvent) {
        // Update existing Google Calendar event
        await updateGoogleEvent(editingGoogleEvent.id, formTitle, startTime, endTime);
      } else if (editingBlock) {
        // Update existing block
        if (editingBlock.google_event_id) {
          await updateGoogleEvent(editingBlock.google_event_id, formTitle, startTime, endTime);
        } else if (syncToGoogle && providerToken) {
          // Create new Google event for existing block
          const googleEventId = await createGoogleEvent(formTitle, startTime, endTime);
          if (googleEventId) {
            await supabase
              .from('scheduled_blocks')
              .update({ google_event_id: googleEventId })
              .eq('id', editingBlock.id);
          }
        }

        await supabase
          .from('scheduled_blocks')
          .update({
            title: formTitle,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            notes: formNotes || null,
          })
          .eq('id', editingBlock.id);
      } else {
        // Create new block
        let googleEventId = null;
        if (syncToGoogle && providerToken) {
          googleEventId = await createGoogleEvent(formTitle, startTime, endTime);
        }

        await supabase.from('scheduled_blocks').insert({
          user_id: userId,
          title: formTitle,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          notes: formNotes || null,
          status: 'scheduled',
          google_event_id: googleEventId,
        });
      }

      setIsModalOpen(false);
      fetchBlocks();
      onBlocksChanged?.();
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setSaving(false);
    }
  };

  // Delete block
  const handleDeleteBlock = async () => {
    setSaving(true);

    try {
      if (editingGoogleEvent) {
        await deleteGoogleEvent(editingGoogleEvent.id);
      } else if (editingBlock) {
        if (editingBlock.google_event_id) {
          await deleteGoogleEvent(editingBlock.google_event_id);
        }
        await supabase.from('scheduled_blocks').delete().eq('id', editingBlock.id);
      }

      setIsModalOpen(false);
      fetchBlocks();
      onBlocksChanged?.();
    } catch (error) {
      console.error('Error deleting:', error);
    } finally {
      setSaving(false);
    }
  };

  // Mark complete
  const handleToggleComplete = async () => {
    if (!editingBlock) return;

    const newStatus = editingBlock.status === 'completed' ? 'scheduled' : 'completed';

    await supabase
      .from('scheduled_blocks')
      .update({ status: newStatus })
      .eq('id', editingBlock.id);

    setIsModalOpen(false);
    fetchBlocks();
    onBlocksChanged?.();
  };

  // Drag handlers for blocks
  const handleDragStart = (block: ScheduledBlock, e: React.DragEvent) => {
    setDraggedBlock(block);
    setDraggedGoogleEvent(null);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Drag handlers for Google events
  const handleGoogleEventDragStart = (event: CalendarEvent, e: React.DragEvent) => {
    setDraggedGoogleEvent(event);
    setDraggedBlock(null);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (dayIndex: number, hour: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSlot({ dayIndex, hour });
  };

  const handleDragLeave = () => {
    setDragOverSlot(null);
  };

  const handleDrop = async (dayIndex: number, hour: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSlot(null);

    const targetDate = new Date(weekDays[dayIndex]);

    if (draggedGoogleEvent && providerToken) {
      // Moving a Google Calendar event
      const originalStart = new Date(draggedGoogleEvent.start.dateTime || draggedGoogleEvent.start.date || '');
      const originalEnd = new Date(draggedGoogleEvent.end.dateTime || draggedGoogleEvent.end.date || '');
      const duration = originalEnd.getTime() - originalStart.getTime();

      const newStart = new Date(targetDate);
      newStart.setHours(hour, 0, 0, 0);
      const newEnd = new Date(newStart.getTime() + duration);

      await updateGoogleEvent(draggedGoogleEvent.id, draggedGoogleEvent.summary, newStart, newEnd);
      onBlocksChanged?.();
    } else if (draggedBlock && userId) {
      // Moving a scheduled block
      const originalStart = new Date(draggedBlock.start_time);
      const originalEnd = new Date(draggedBlock.end_time);
      const duration = originalEnd.getTime() - originalStart.getTime();

      const newStart = new Date(targetDate);
      newStart.setHours(hour, 0, 0, 0);
      const newEnd = new Date(newStart.getTime() + duration);

      // Update Google Calendar if synced
      if (draggedBlock.google_event_id) {
        await updateGoogleEvent(draggedBlock.google_event_id, draggedBlock.title, newStart, newEnd);
      }

      await supabase
        .from('scheduled_blocks')
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
        })
        .eq('id', draggedBlock.id);

      fetchBlocks();
      onBlocksChanged?.();
    }

    setDraggedBlock(null);
    setDraggedGoogleEvent(null);
  };

  const handleDragEnd = () => {
    setDraggedBlock(null);
    setDraggedGoogleEvent(null);
    setDragOverSlot(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-8 border-b border-white/[0.05] pb-2 mb-2">
        <div className="w-16" />
        {weekDays.map((date, i) => (
          <div key={i} className="text-center px-1">
            <div className={`text-xs uppercase tracking-wide ${isToday(date) ? 'text-purple-400' : 'text-white/40'}`}>
              {date.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div
              className={`
              text-lg font-medium mt-1 w-10 h-10 mx-auto rounded-full flex items-center justify-center
              transition-all duration-300
              ${isToday(date) ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/30' : 'text-white/80'}
            `}
            >
              {date.getDate()}
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="grid grid-cols-8 min-h-full">
          {/* Time Labels */}
          <div className="w-16">
            {hours.map((hour) => (
              <div key={hour} className="h-[60px] pr-2 text-right">
                <span className="text-xs text-white/30">
                  {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                </span>
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {weekDays.map((date, dayIndex) => (
            <div
              key={dayIndex}
              className={`relative border-l border-white/[0.02] ${isToday(date) ? 'bg-purple-500/[0.03]' : ''}`}
            >
              {/* Hour slots */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={`
                    h-[60px] border-b border-white/[0.02] cursor-pointer
                    hover:bg-purple-500/10 transition-colors
                    ${dragOverSlot?.dayIndex === dayIndex && dragOverSlot?.hour === hour ? 'bg-purple-500/20' : ''}
                  `}
                  onClick={() => handleSlotClick(date, hour)}
                  onDragOver={(e) => handleDragOver(dayIndex, hour, e)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(dayIndex, hour, e)}
                />
              ))}

              {/* Google Calendar Events - now editable */}
              {getEventsForDay(date).map((event) => {
                const startDate = new Date(event.start.dateTime || event.start.date || '');
                const endDate = new Date(event.end.dateTime || event.end.date || '');
                const startHour = startDate.getHours() + startDate.getMinutes() / 60;
                const endHour = endDate.getHours() + endDate.getMinutes() / 60;

                if (startHour < 7 || startHour > 20) return null;

                const top = (startHour - 7) * 60;
                const height = Math.max((endHour - startHour) * 60, 30);
                const isDragging = draggedGoogleEvent?.id === event.id;

                return (
                  <div
                    key={event.id}
                    draggable={!!providerToken}
                    onDragStart={(e) => handleGoogleEventDragStart(event, e)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleGoogleEventClick(event, e)}
                    className={`
                      absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden
                      backdrop-blur-sm border-l-2 transition-all duration-200
                      hover:scale-[1.02] hover:shadow-lg cursor-grab active:cursor-grabbing
                      ${getEventStyle(event)}
                      ${isDragging ? 'opacity-50 scale-95' : ''}
                    `}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      zIndex: isDragging ? 50 : 10,
                    }}
                  >
                    <div className="text-xs font-medium truncate flex items-center gap-1">
                      <span>📅</span>
                      {event.summary}
                    </div>
                    {height > 35 && (
                      <div className="text-xs opacity-70">
                        {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Scheduled Blocks */}
              {getBlocksForDay(date).map((block) => {
                const startDate = new Date(block.start_time);
                const endDate = new Date(block.end_time);
                const startHour = startDate.getHours() + startDate.getMinutes() / 60;
                const endHour = endDate.getHours() + endDate.getMinutes() / 60;

                if (startHour < 7 || startHour > 20) return null;

                const top = (startHour - 7) * 60;
                const height = Math.max((endHour - startHour) * 60, 30);
                const isCompleted = block.status === 'completed';
                const isDragging = draggedBlock?.id === block.id;

                return (
                  <div
                    key={block.id}
                    draggable
                    onDragStart={(e) => handleDragStart(block, e)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleBlockClick(block, e)}
                    className={`
                      absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden
                      backdrop-blur-sm border-l-2 transition-all duration-200
                      hover:scale-[1.02] hover:shadow-lg cursor-grab active:cursor-grabbing
                      ${
                        isCompleted
                          ? 'bg-green-500/20 border-green-400/50 text-green-200 line-through opacity-60'
                          : 'bg-purple-500/30 border-purple-400/50 text-purple-200'
                      }
                      ${isDragging ? 'opacity-50 scale-95' : ''}
                    `}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      zIndex: isDragging ? 50 : 10,
                    }}
                  >
                    <div className="text-xs font-medium truncate flex items-center gap-1">
                      {isCompleted && <span>✓</span>}
                      {block.google_event_id && <span className="opacity-50">📅</span>}
                      {block.title}
                    </div>
                    {height > 35 && (
                      <div className="text-xs opacity-70">
                        {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Current Time Indicator */}
              {isToday(date) && currentTimePos !== null && (
                <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${currentTimePos}px` }}>
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-lg shadow-red-500/50 -ml-1" />
                    <div className="flex-1 h-0.5 bg-red-500 shadow-lg shadow-red-500/50" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-md mx-4 p-6"
            >
              <h2 className="text-xl text-white font-medium mb-4">
                {editingGoogleEvent ? 'Edit Event' : editingBlock ? 'Edit Block' : 'New Block'}
              </h2>

              {selectedSlot && (
                <p className="text-white/50 text-sm mb-4">
                  {selectedSlot.date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-white/50 text-sm block mb-1">Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Study session, Meeting, etc."
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white/50 text-sm block mb-1">Start</label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="text-white/50 text-sm block mb-1">End</label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>

                {!editingGoogleEvent && (
                  <div>
                    <label className="text-white/50 text-sm block mb-1">Notes (optional)</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Any notes..."
                      rows={2}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
                    />
                  </div>
                )}

                {/* Sync to Google option */}
                {providerToken && !editingGoogleEvent && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncToGoogle}
                      onChange={(e) => setSyncToGoogle(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/50"
                    />
                    <span className="text-white/70 text-sm">Sync to Google Calendar</span>
                  </label>
                )}

                {/* Actions for editing */}
                {(editingBlock || editingGoogleEvent) && (
                  <div className="flex gap-3 pt-2">
                    {editingBlock && (
                      <button
                        onClick={handleToggleComplete}
                        disabled={saving}
                        className={`flex-1 py-2.5 rounded-xl transition ${
                          editingBlock.status === 'completed'
                            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                      >
                        {editingBlock.status === 'completed' ? 'Undo' : '✓ Complete'}
                      </button>
                    )}
                    <button
                      onClick={handleDeleteBlock}
                      disabled={saving}
                      className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-2.5 bg-white/5 text-white/70 rounded-xl hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveBlock}
                    disabled={!formTitle.trim() || saving}
                    className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving && (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {editingBlock || editingGoogleEvent ? 'Save' : 'Create'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
