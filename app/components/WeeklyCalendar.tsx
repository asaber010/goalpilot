'use client';

import { useState, useEffect } from 'react';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
}

interface WeeklyCalendarProps {
  events: CalendarEvent[];
}

// Color mapping for events
const eventColors: { [key: string]: string } = {
  '1': 'bg-blue-400/80',
  '2': 'bg-green-400/80',
  '3': 'bg-purple-400/80',
  '4': 'bg-red-400/80',
  '5': 'bg-yellow-400/80',
  '6': 'bg-orange-400/80',
  '7': 'bg-teal-400/80',
  '8': 'bg-gray-400/80',
  '9': 'bg-indigo-400/80',
  '10': 'bg-pink-400/80',
  '11': 'bg-rose-400/80',
  default: 'bg-blue-400/80',
};

export default function WeeklyCalendar({ events }: WeeklyCalendarProps) {
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));

  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  // Generate week days
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return date;
  });

  // Hours to display (6am to 11pm)
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);

  // Check if a date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Format day header
  const formatDayHeader = (date: Date) => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = date.getDate();
    return { dayName, dayNum };
  };

  // Get events for a specific day
  const getEventsForDay = (date: Date) => {
    return events.filter(event => {
      const eventStart = new Date(event.start.dateTime || event.start.date || '');
      return eventStart.toDateString() === date.toDateString();
    });
  };

  // Calculate event position and height
  const getEventStyle = (event: CalendarEvent) => {
    const start = new Date(event.start.dateTime || event.start.date || '');
    const end = new Date(event.end.dateTime || event.end.date || '');
    
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    
    const top = (startHour - 6) * 60; // 60px per hour, starting from 6am
    const height = (endHour - startHour) * 60;
    
    return { top: `${top}px`, height: `${Math.max(height, 20)}px` };
  };

  // Format event time
  const formatEventTime = (event: CalendarEvent) => {
    const start = new Date(event.start.dateTime || event.start.date || '');
    const end = new Date(event.end.dateTime || event.end.date || '');
    
    const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    }).toLowerCase();
    
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  // Navigate weeks
  const prevWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(weekStart.getDate() - 7);
    setWeekStart(newStart);
  };

  const nextWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(weekStart.getDate() + 7);
    setWeekStart(newStart);
  };

  const goToToday = () => {
    setWeekStart(getWeekStart(new Date()));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={prevWeek}
            className="p-1 hover:bg-white/10 rounded transition text-white/70"
          >
            ←
          </button>
          <button 
            onClick={nextWeek}
            className="p-1 hover:bg-white/10 rounded transition text-white/70"
          >
            →
          </button>
          <button 
            onClick={goToToday}
            className="px-3 py-1 text-sm hover:bg-white/10 rounded transition text-white/70"
          >
            Today
          </button>
        </div>
        <span className="text-white/50 text-sm">
          {weekStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-8 border-b border-white/10">
        <div className="p-2 text-xs text-white/30">PST</div>
        {weekDays.map((date, i) => {
          const { dayName, dayNum } = formatDayHeader(date);
          return (
            <div 
              key={i} 
              className={`p-2 text-center ${isToday(date) ? 'bg-white/5' : ''}`}
            >
              <div className="text-xs text-white/50">{dayName}</div>
              <div className={`text-lg ${isToday(date) ? 'bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto' : 'text-white'}`}>
                {dayNum}
              </div>
            </div>
          );
        })}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-8 relative">
          {/* Time Column */}
          <div className="border-r border-white/10">
            {hours.map(hour => (
              <div key={hour} className="h-[60px] pr-2 text-right text-xs text-white/30 -mt-2">
                {hour === 12 ? '12pm' : hour > 12 ? `${hour - 12}pm` : `${hour}am`}
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {weekDays.map((date, dayIndex) => {
            const dayEvents = getEventsForDay(date);
            
            return (
              <div 
                key={dayIndex} 
                className={`relative border-r border-white/10 ${isToday(date) ? 'bg-white/5' : ''}`}
              >
                {/* Hour grid lines */}
                {hours.map(hour => (
                  <div key={hour} className="h-[60px] border-b border-white/5" />
                ))}

                {/* Events */}
                {dayEvents.map(event => {
                  const style = getEventStyle(event);
                  const colorClass = eventColors[event.colorId || 'default'] || eventColors.default;
                  
                  return (
                    <div
                      key={event.id}
                      className={`absolute left-0.5 right-0.5 ${colorClass} rounded px-1.5 py-0.5 overflow-hidden cursor-pointer hover:opacity-90 transition`}
                      style={style}
                    >
                      <div className="text-xs font-medium text-black truncate">
                        {event.summary || 'Untitled'}
                      </div>
                      <div className="text-xs text-black/70 truncate">
                        {formatEventTime(event)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
