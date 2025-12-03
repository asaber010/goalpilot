'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  total_hours: number;
  hours_completed: number;
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatProps {
  selectedGoal: Goal | null;
  calendarEvents: any[];
  providerToken: string | null;
  onScheduled: () => void;
  userId: string;
}

export default function AIChat({ 
  selectedGoal, 
  calendarEvents, 
  providerToken,
  onScheduled,
  userId 
}: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Hey! 👋 I'm your scheduling assistant. Tell me what you need - add events, check your calendar, find time to study, whatever. Just talk to me like you would a friend." 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch goals
  useEffect(() => {
    async function fetchGoals() {
      const { data } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (data) setGoals(data);
    }
    fetchGoals();
  }, [userId]);

  // When a goal is selected from sidebar
  useEffect(() => {
    if (selectedGoal) {
      const hoursLeft = selectedGoal.total_hours - selectedGoal.hours_completed;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I see you picked "${selectedGoal.title}" - you've got ${hoursLeft}h left on this. Want me to find some time slots, or did you want to do something else with it?`
      }]);
    }
  }, [selectedGoal]);

  // Execute calendar actions
  const executeAction = async (action: any): Promise<boolean> => {
    if (!providerToken) {
      console.error('No provider token!');
      return false;
    }

    try {
      if (action.type === 'ADD_EVENT' || action.type === 'ADD_MULTIPLE_EVENTS') {
        const events = action.type === 'ADD_MULTIPLE_EVENTS' ? action.events : [action];
        
        for (const event of events) {
          const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${providerToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: event.title,
              description: event.description || '',
              start: { dateTime: event.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
              end: { dateTime: event.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            console.error('Calendar API error:', error);
            return false;
          }
        }
        onScheduled();
        return true;
      }

      if (action.type === 'REMOVE_EVENT') {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${action.eventId}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${providerToken}` },
          }
        );
        if (response.ok || response.status === 204) {
          onScheduled();
          return true;
        }
        return false;
      }

      if (action.type === 'UPDATE_EVENT') {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${action.eventId}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${providerToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: action.title,
              start: action.start ? { dateTime: action.start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined,
              end: action.end ? { dateTime: action.end, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } : undefined,
            }),
          }
        );
        if (response.ok) {
          onScheduled();
          return true;
        }
        return false;
      }

      return false;
    } catch (error) {
      console.error('Action execution error:', error);
      return false;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const userMessage = input.trim();
    const lowerMessage = userMessage.toLowerCase();
    setInput('');
    
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    // Handle confirmation of pending action
    if (pendingAction) {
      const isConfirm = /^(yes|yeah|yep|sure|ok|okay|do it|confirm|go ahead|yup|please|sounds good|perfect|let's do it|go for it)$/i.test(lowerMessage) ||
                        lowerMessage.includes('yes') && lowerMessage.length < 20;
      const isCancel = /^(no|nope|cancel|nevermind|nah|don't|stop|wait)$/i.test(lowerMessage) ||
                       lowerMessage.includes('no') && lowerMessage.length < 15;

      if (isConfirm) {
        const success = await executeAction(pendingAction);
        setPendingAction(null);
        
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: success 
            ? "Done! ✅ Your calendar's updated. What else?" 
            : "Hmm, that didn't work. Try signing out and back in to refresh your calendar access."
        }]);
        setLoading(false);
        return;
      }

      if (isCancel) {
        setPendingAction(null);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "No problem, cancelled. What would you like to do instead?"
        }]);
        setLoading(false);
        return;
      }
      
      // If neither confirm nor cancel, clear pending and process as new message
      setPendingAction(null);
    }

    // Send everything to the smart API
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          calendarEvents: calendarEvents.map(e => ({
            id: e.id,
            title: e.summary,
            start: e.start.dateTime || e.start.date,
            end: e.end.dateTime || e.end.date,
          })),
          goals: goals.map(g => ({
            id: g.id,
            title: g.title,
            hoursRemaining: g.total_hours - g.hours_completed,
            priority: g.priority,
            deadline: g.deadline,
          })),
          selectedGoal: selectedGoal ? {
            id: selectedGoal.id,
            title: selectedGoal.title,
            hoursRemaining: selectedGoal.total_hours - selectedGoal.hours_completed,
            priority: selectedGoal.priority,
            deadline: selectedGoal.deadline,
          } : null,
          conversationHistory: messages.slice(-12),
          userId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Add assistant message
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message
        }]);

        // Handle any actions the AI wants to take
        if (data.action) {
          setPendingAction(data.action);
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.error || "Sorry, I'm having trouble. Try again?"
        }]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Connection issue. Check your internet and try again?"
      }]);
    }

    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col">
      <h3 className="font-roman text-lg text-white mb-3">AI Assistant</h3>
      
      {!providerToken && (
        <div className="text-xs text-red-400 mb-2">⚠️ No calendar access - sign out and back in</div>
      )}
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1 scrollbar-thin scrollbar-thumb-white/10">
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`p-2.5 rounded-lg text-sm ${
              msg.role === 'assistant' 
                ? 'bg-purple-900/30 text-white/90' 
                : 'bg-white/10 text-white ml-4'
            }`}
          >
            <div className="whitespace-pre-wrap leading-relaxed">
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="p-2.5 rounded-lg text-sm bg-purple-900/30 text-white/50 animate-pulse">
            thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={pendingAction ? "Yes or no?" : "Talk to me..."}
          disabled={loading}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition disabled:opacity-50"
        >
          →
        </button>
      </div>
    </div>
  );
}
