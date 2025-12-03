'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import DarkVeil from '../components/DarkVeil';
import Dock from '../components/Dock';
import WeeklyCalendar from '../components/WeeklyCalendar';
import GoalsSidebar from '../components/GoalsSidebar';
import AIChat from '../components/AIChat';
import SettingsModal from '../components/SettingsModal';
import ProjectsModal from '../components/ProjectsModal';
import MeetingsModal from '../components/MeetingsModal';
import RecapModal from '../components/RecapModal';
import AlfredModal from '../components/AlfredModal';
import GlassCard from '../components/GlassCard';
import { VscProject, VscGraph, VscSettingsGear } from 'react-icons/vsc';
import { HiOutlineUsers } from 'react-icons/hi';
import { RiRobot2Line } from 'react-icons/ri';

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
}

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

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  },
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isMeetingsOpen, setIsMeetingsOpen] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const [isAlfredOpen, setIsAlfredOpen] = useState(false);

  const [hasRecapNotification, setHasRecapNotification] = useState(false);
  const [isAlfredConnected, setIsAlfredConnected] = useState(false);

  const [goalsRefreshKey, setGoalsRefreshKey] = useState(0);

  useEffect(() => {
    const checkAlfredConnection = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('user_preferences')
        .select('telegram_chat_id')
        .eq('user_id', user.id)
        .single();

      setIsAlfredConnected(!!data?.telegram_chat_id);
    };
    checkAlfredConnection();
  }, [user]);

  useEffect(() => {
    const checkRecapNotification = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('user_preferences')
        .select('last_recap_date')
        .eq('user_id', user.id)
        .single();

      if (data?.last_recap_date) {
        const lastRecap = new Date(data.last_recap_date);
        const daysSince = Math.floor(
          (Date.now() - lastRecap.getTime()) / (1000 * 60 * 60 * 24)
        );
        setHasRecapNotification(daysSince >= 7);
      } else {
        setHasRecapNotification(true);
      }
    };
    checkRecapNotification();
  }, [user]);

  useEffect(() => {
    const fetchGoals = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (data) setGoals(data);
    };
    fetchGoals();
  }, [user, goalsRefreshKey]);

  useEffect(() => {
    async function loadData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      setUser(session.user);
      setSession(session);

      const providerToken = session.provider_token;
      if (providerToken) {
        try {
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

  const handleScheduleGoal = (goal: Goal) => {
    setSelectedGoal(goal);
  };

  const refreshCalendar = async () => {
    if (!session?.provider_token) return;

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
          Authorization: `Bearer ${session.provider_token}`,
        },
      }
    );

    const data = await response.json();
    if (data.items) {
      setEvents(data.items);
    }
  };

  const refreshGoals = () => {
    setGoalsRefreshKey((prev) => prev + 1);
  };

  const handleApplySuggestion = (suggestion: string) => {
    console.log('Applying suggestion:', suggestion);
  };

  const dockItems = [
    {
      icon: <VscProject size={24} className="text-white" />,
      label: 'Projects',
      onClick: () => setIsProjectsOpen(true),
    },
    {
      icon: <HiOutlineUsers size={24} className="text-white" />,
      label: 'Meetings',
      onClick: () => setIsMeetingsOpen(true),
    },
    {
      icon: (
        <div className="relative">
          <VscGraph size={24} className="text-white" />
          {hasRecapNotification && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-pink-500 rounded-full animate-pulse" />
          )}
        </div>
      ),
      label: 'Recap',
      onClick: () => setIsRecapOpen(true),
    },
    {
      icon: (
        <div className="relative">
          <RiRobot2Line size={24} className="text-purple-400" />
          {isAlfredConnected && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
          )}
          {!isAlfredConnected && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
          )}
        </div>
      ),
      label: 'Alfred',
      onClick: () => setIsAlfredOpen(true),
    },
  ];

  const calculateTimeDistribution = () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    let classHours = 0;
    let meetingHours = 0;
    let studyHours = 0;
    let otherHours = 0;

    events.forEach((event) => {
      const start = new Date(event.start.dateTime || event.start.date || '');
      const end = new Date(event.end.dateTime || event.end.date || '');

      if (start >= weekStart && start < weekEnd) {
        const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const summary = (event.summary || '').toLowerCase();

        if (
          summary.includes('cs') ||
          summary.includes('eecs') ||
          summary.includes('lecture') ||
          summary.includes('disc') ||
          summary.includes('class')
        ) {
          classHours += duration;
        } else if (
          summary.includes('meeting') ||
          summary.includes('1:1') ||
          summary.includes('sync') ||
          summary.includes('call')
        ) {
          meetingHours += duration;
        } else if (
          summary.includes('study') ||
          summary.includes('📚') ||
          summary.includes('prep') ||
          summary.includes('homework')
        ) {
          studyHours += duration;
        } else {
          otherHours += duration;
        }
      }
    });

    const totalWakingHours = 112;
    const busyHours = classHours + meetingHours + studyHours + otherHours;
    const freeHours = Math.max(0, totalWakingHours - busyHours);

    return [
      { label: 'Classes', hours: Math.round(classHours * 10) / 10, color: 'bg-red-400' },
      { label: 'Meetings', hours: Math.round(meetingHours * 10) / 10, color: 'bg-blue-400' },
      { label: 'Study', hours: Math.round(studyHours * 10) / 10, color: 'bg-purple-400' },
      { label: 'Other', hours: Math.round(otherHours * 10) / 10, color: 'bg-green-400' },
      { label: 'Free', hours: Math.round(freeHours * 10) / 10, color: 'bg-white/20' },
    ];
  };

  const timeDistribution = calculateTimeDistribution();
  const totalHours = timeDistribution.reduce((sum, item) => sum + item.hours, 0);

  const getWeekRange = () => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return `${weekStart.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} - ${weekEnd.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-white text-xl"
        >
          Loading...
        </motion.div>
      </div>
    );
  }

  if (!user) return null;

  const firstName =
    user.user_metadata?.full_name?.split(' ')[0] ||
    user.email?.split('@')[0] ||
    'there';

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 -z-10 opacity-40">
        <DarkVeil speed={0.2} />
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="h-screen flex flex-col"
      >
        <motion.header
          variants={item}
          className="flex justify-between items-center p-4 border-b border-white/[0.05]"
        >
          <h1 className="font-roman text-2xl text-white">Welcome, {firstName}</h1>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] text-white/70 hover:bg-white/[0.08] transition backdrop-blur-sm"
            >
              Preset Feature ▾
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsSettingsOpen(true)}
              className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.08] transition"
            >
              <VscSettingsGear size={18} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSignOut}
              className="text-white/50 hover:text-white transition px-3 py-2"
            >
              Sign Out
            </motion.button>
          </div>
        </motion.header>

        <motion.div
          variants={item}
          className="px-4 py-3 border-b border-white/[0.05]"
        >
          <h2 className="font-roman text-lg text-white mb-2">
            This Week: {getWeekRange()}
          </h2>
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-white/[0.05]">
              {timeDistribution
                .filter((item) => item.hours > 0)
                .map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.hours / totalHours) * 100}%` }}
                    transition={{ duration: 0.8, delay: index * 0.1 }}
                    className={`${item.color} h-full`}
                  />
                ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {timeDistribution.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-white/60">
                  {item.label}: {item.hours}h
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="flex flex-1 min-h-0 pb-20">
          <motion.div variants={item}>
            <GoalsSidebar
              key={goalsRefreshKey}
              userId={user.id}
              onScheduleGoal={handleScheduleGoal}
              onGoalsChanged={refreshGoals}
            />
          </motion.div>

          <motion.div variants={item} className="flex-1 p-4 overflow-hidden">
            <GlassCard className="h-full p-4" hover={false}>
              <WeeklyCalendar
  events={events}
  userId={user.id}
  providerToken={session?.provider_token || null}
  onBlocksChanged={refreshCalendar}
/>
            </GlassCard>
          </motion.div>

          <motion.div variants={item} className="w-80 p-4">
            <div className="h-full bg-purple-950/20 backdrop-blur-xl border border-purple-500/10 rounded-2xl p-4 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
              <AIChat
                selectedGoal={selectedGoal}
                calendarEvents={events}
                providerToken={session?.provider_token || null}
                onScheduled={refreshCalendar}
                userId={user.id}
              />
            </div>
          </motion.div>
        </div>
      </motion.div>

      <Dock items={dockItems} />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userId={user.id}
      />

      <ProjectsModal
        isOpen={isProjectsOpen}
        onClose={() => setIsProjectsOpen(false)}
        userId={user.id}
        calendarEvents={events}
        providerToken={session?.provider_token || null}
        onScheduled={refreshCalendar}
      />

      <MeetingsModal
        isOpen={isMeetingsOpen}
        onClose={() => setIsMeetingsOpen(false)}
        userId={user.id}
        calendarEvents={events}
        providerToken={session?.provider_token || null}
        onScheduled={refreshCalendar}
      />

      <RecapModal
        isOpen={isRecapOpen}
        onClose={() => {
          setIsRecapOpen(false);
          setHasRecapNotification(false);
        }}
        userId={user.id}
        calendarEvents={events}
        goals={goals}
        projects={[]}
        providerToken={session?.provider_token || null}
        onApplySuggestion={handleApplySuggestion}
      />

      <AlfredModal
        isOpen={isAlfredOpen}
        onClose={() => {
          setIsAlfredOpen(false);
          supabase
            .from('user_preferences')
            .select('telegram_chat_id')
            .eq('user_id', user.id)
            .single()
            .then(({ data }) => {
              setIsAlfredConnected(!!data?.telegram_chat_id);
            });
        }}
        userId={user.id}
      />
    </div>
  );
}
