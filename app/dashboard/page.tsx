'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import DarkVeil from '../components/DarkVeil';
import Dock from '../components/Dock';
import WeeklyCalendar from '../components/WeeklyCalendar';
import { VscTarget, VscCalendar, VscSettingsGear, VscGraph } from 'react-icons/vsc';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      setUser(session.user);

      // Fetch calendar events
      const providerToken = session.provider_token;
      if (providerToken) {
        try {
          // Get events for current month
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);

          const response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
            new URLSearchParams({
              timeMin: startOfMonth.toISOString(),
              timeMax: endOfMonth.toISOString(),
              maxResults: '100',
              singleEvents: 'true',
              orderBy: 'startTime',
            }),
            {
              headers: {
                Authorization: `Bearer ${providerToken}`,
              },
            }
          );

          const data = await response.json();
          if (data.items) {
            setEvents(data.items);
          }
        } catch (error) {
          console.error('Error fetching calendar:', error);
        }
      }

      setLoading(false);
    }
    loadData();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Dock items
  const dockItems = [
    {
      icon: <VscTarget size={24} className="text-white" />,
      label: 'Focus',
      onClick: () => console.log('Focus'),
    },
    {
      icon: <VscCalendar size={24} className="text-white" />,
      label: 'Meeting',
      onClick: () => console.log('Meeting'),
    },
    {
      icon: <VscSettingsGear size={24} className="text-white" />,
      label: 'Settings',
      onClick: () => console.log('Settings'),
    },
    {
      icon: <VscGraph size={24} className="text-white" />,
      label: 'Recap',
      onClick: () => console.log('Recap'),
    },
  ];

  // Calculate time distribution from actual events
  const calculateTimeDistribution = () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    let classHours = 0;
    let meetingHours = 0;
    let otherHours = 0;

    events.forEach(event => {
      const start = new Date(event.start.dateTime || event.start.date || '');
      const end = new Date(event.end.dateTime || event.end.date || '');
      
      if (start >= weekStart && start < weekEnd) {
        const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const summary = (event.summary || '').toLowerCase();
        
        if (summary.includes('cs') || summary.includes('eecs') || summary.includes('lecture') || summary.includes('disc')) {
          classHours += duration;
        } else if (summary.includes('meeting') || summary.includes('1:1')) {
          meetingHours += duration;
        } else {
          otherHours += duration;
        }
      }
    });

    const totalWeekHours = 7 * 24;
    const busyHours = classHours + meetingHours + otherHours;
    const freeHours = Math.max(0, totalWeekHours - busyHours);

    return [
      { label: 'Classes', hours: Math.round(classHours * 10) / 10, color: 'bg-red-400' },
      { label: 'Meetings', hours: Math.round(meetingHours * 10) / 10, color: 'bg-blue-400' },
      { label: 'Other', hours: Math.round(otherHours * 10) / 10, color: 'bg-green-400' },
      { label: 'Free', hours: Math.round(freeHours * 10) / 10, color: 'bg-white/20' },
    ];
  };

  const timeDistribution = calculateTimeDistribution();
  const totalHours = timeDistribution.reduce((sum, item) => sum + item.hours, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-xl">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'there';
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Background */}
      <div className="absolute inset-0 -z-10 opacity-40">
        <DarkVeil speed={0.2} />
      </div>

      {/* Main Container */}
      <div className="p-6 pb-24 h-screen flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-center mb-4">
          <h1 className="font-roman text-2xl text-white">
            Welcome, {firstName}
          </h1>
          <div className="flex items-center gap-4">
            <button className="px-4 py-2 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 transition">
              Preset Feature ▾
            </button>
            <button
              onClick={handleSignOut}
              className="text-white/50 hover:text-white transition"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Month + Time Distribution */}
        <div className="mb-4">
          <h2 className="font-roman text-xl text-white mb-2">{currentMonth}</h2>

          {/* Time Distribution Bar */}
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden flex bg-white/10">
              {timeDistribution.map((item, index) => (
                <div
                  key={index}
                  className={`${item.color} h-full`}
                  style={{ width: `${(item.hours / totalHours) * 100}%` }}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-sm">
            {timeDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-white/60">{item.label} {item.hours}h</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Calendar Section */}
          <div className="flex-1 border border-white/10 rounded-xl p-4 bg-white/5 backdrop-blur-sm overflow-hidden">
            <WeeklyCalendar events={events} />
          </div>

          {/* AI Chat Section */}
          <div className="w-80 border border-purple-500/20 rounded-xl p-4 bg-purple-950/20 backdrop-blur-sm">
            <h3 className="font-roman text-lg text-white mb-4">AI Assistant</h3>
            <p className="text-white/30 text-sm">Chat functionality coming soon...</p>
          </div>
        </div>
      </div>

      {/* Dock */}
      <Dock items={dockItems} />
    </div>
  );
}
