'use client';

import { useState } from 'react';

interface MeetingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  calendarEvents: any[];
  providerToken: string | null;
  onScheduled: () => void;
}

interface MeetingForm {
  title: string;
  duration: number;
  theirTimezone: string;
  myAvailableStart: string;
  myAvailableEnd: string;
  preferredDays: string[];
  notes: string;
}

interface TimeSlot {
  start: Date;
  end: Date;
  theirTime: string;
  myTime: string;
}

export default function MeetingsModal({ 
  isOpen, 
  onClose, 
  userId, 
  calendarEvents,
  providerToken,
  onScheduled 
}: MeetingsModalProps) {
  const [step, setStep] = useState<'form' | 'slots' | 'confirm'>('form');
  const [form, setForm] = useState<MeetingForm>({
    title: '',
    duration: 30,
    theirTimezone: 'America/New_York',
    myAvailableStart: '09:00',
    myAvailableEnd: '17:00',
    preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    notes: '',
  });
  const [suggestedSlots, setSuggestedSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loading, setLoading] = useState(false);

  const myTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const timezones = [
    { value: 'America/New_York', label: 'Eastern (ET)' },
    { value: 'America/Chicago', label: 'Central (CT)' },
    { value: 'America/Denver', label: 'Mountain (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  ];

  const days = [
    { value: 'monday', label: 'Mon' },
    { value: 'tuesday', label: 'Tue' },
    { value: 'wednesday', label: 'Wed' },
    { value: 'thursday', label: 'Thu' },
    { value: 'friday', label: 'Fri' },
    { value: 'saturday', label: 'Sat' },
    { value: 'sunday', label: 'Sun' },
  ];

  const findAvailableSlots = () => {
    setLoading(true);
    const slots: TimeSlot[] = [];
    const now = new Date();
    
    // Check next 14 days
    for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + dayOffset);
      
      const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      // Skip if not a preferred day
      if (!form.preferredDays.includes(dayName)) continue;

      // Parse available hours
      const [startHour, startMin] = form.myAvailableStart.split(':').map(Number);
      const [endHour, endMin] = form.myAvailableEnd.split(':').map(Number);

      // Check each 30-min slot
      for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += 30) {
          if (hour === startHour && min < startMin) continue;
          if (hour === endHour - 1 && min + form.duration > 60) continue;

          const slotStart = new Date(checkDate);
          slotStart.setHours(hour, min, 0, 0);

          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + form.duration);

          // Check if slot end exceeds available end time
          if (slotEnd.getHours() > endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() > endMin)) {
            continue;
          }

          // Check for conflicts with existing events
          const hasConflict = calendarEvents.some(event => {
            const eventStart = new Date(event.start.dateTime || event.start.date);
            const eventEnd = new Date(event.end.dateTime || event.end.date);
            return (slotStart < eventEnd && slotEnd > eventStart);
          });

          if (!hasConflict) {
            // Convert to their timezone for display
            const theirTimeStr = slotStart.toLocaleString('en-US', {
              timeZone: form.theirTimezone,
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });

            const myTimeStr = slotStart.toLocaleString('en-US', {
              timeZone: myTimezone,
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });

            slots.push({
              start: slotStart,
              end: slotEnd,
              theirTime: theirTimeStr,
              myTime: myTimeStr,
            });
          }
        }
      }
    }

    setSuggestedSlots(slots.slice(0, 12)); // Limit to 12 suggestions
    setStep('slots');
    setLoading(false);
  };

  const scheduleMeeting = async () => {
    if (!selectedSlot || !providerToken) return;
    setLoading(true);

    try {
      // Create Google Meet link
      const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: form.title || 'Meeting',
          description: form.notes ? `Notes:\n${form.notes}` : '',
          start: { 
            dateTime: selectedSlot.start.toISOString(),
            timeZone: myTimezone,
          },
          end: { 
            dateTime: selectedSlot.end.toISOString(),
            timeZone: myTimezone,
          },
          conferenceData: {
            createRequest: {
              requestId: `meeting-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
          attendees: [],
        }),
      });

      if (response.ok) {
        const event = await response.json();
        const meetLink = event.conferenceData?.entryPoints?.[0]?.uri || 'No link generated';
        
        alert(`Meeting scheduled! ✅\n\nGoogle Meet link:\n${meetLink}\n\nThe link has been added to your calendar event.`);
        onScheduled();
        resetAndClose();
      } else {
        const error = await response.json();
        console.error('Failed to create meeting:', error);
        alert('Failed to schedule meeting. Try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong. Try again.');
    }

    setLoading(false);
  };

  const resetAndClose = () => {
    setStep('form');
    setForm({
      title: '',
      duration: 30,
      theirTimezone: 'America/New_York',
      myAvailableStart: '09:00',
      myAvailableEnd: '17:00',
      preferredDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      notes: '',
    });
    setSuggestedSlots([]);
    setSelectedSlot(null);
    onClose();
  };

  const toggleDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      preferredDays: prev.preferredDays.includes(day)
        ? prev.preferredDays.filter(d => d !== day)
        : [...prev.preferredDays, day]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={resetAndClose} />
      
      <div className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h2 className="font-roman text-xl text-white">Schedule Meeting</h2>
            <p className="text-white/50 text-sm">
              {step === 'form' && 'Set your preferences'}
              {step === 'slots' && 'Pick a time slot'}
              {step === 'confirm' && 'Confirm meeting'}
            </p>
          </div>
          <button onClick={resetAndClose} className="text-white/50 hover:text-white transition text-2xl">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'form' && (
            <div className="space-y-4">
              <div>
                <label className="block text-white/60 text-sm mb-1">Meeting Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., 1:1 with Alex"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                />
              </div>

              <div>
                <label className="block text-white/60 text-sm mb-1">Duration</label>
                <div className="flex gap-2">
                  {[15, 30, 45, 60, 90].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setForm(prev => ({ ...prev, duration: mins }))}
                      className={`flex-1 py-2 rounded-lg border transition ${
                        form.duration === mins
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'border-white/10 text-white/50 hover:bg-white/5'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-sm mb-1">Their Timezone</label>
                <select
                  value={form.theirTimezone}
                  onChange={(e) => setForm(prev => ({ ...prev, theirTimezone: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500/50"
                >
                  {timezones.map(tz => (
                    <option key={tz.value} value={tz.value} className="bg-[#0a0a0f]">
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="text-white/40 text-xs mt-1">Your timezone: {myTimezone}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/60 text-sm mb-1">Available From</label>
                  <input
                    type="time"
                    value={form.myAvailableStart}
                    onChange={(e) => setForm(prev => ({ ...prev, myAvailableStart: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Available Until</label>
                  <input
                    type="time"
                    value={form.myAvailableEnd}
                    onChange={(e) => setForm(prev => ({ ...prev, myAvailableEnd: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-sm mb-1">Preferred Days</label>
                <div className="flex gap-1">
                  {days.map(day => (
                    <button
                      key={day.value}
                      onClick={() => toggleDay(day.value)}
                      className={`flex-1 py-2 rounded-lg border text-xs transition ${
                        form.preferredDays.includes(day.value)
                          ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                          : 'border-white/10 text-white/40 hover:bg-white/5'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-sm mb-1">Meeting Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="What do you want to discuss?"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-none h-20"
                />
              </div>
            </div>
          )}

          {step === 'slots' && (
            <div>
              {suggestedSlots.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-white/50 mb-4">No available slots found. Try adjusting your preferences.</p>
                  <button
                    onClick={() => setStep('form')}
                    className="text-purple-400 hover:text-purple-300"
                  >
                    ← Go back
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {suggestedSlots.map((slot, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSlot(slot)}
                      className={`p-3 rounded-lg border text-left transition ${
                        selectedSlot === slot
                          ? 'bg-purple-600/30 border-purple-500'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-medium">{slot.myTime}</p>
                          <p className="text-white/50 text-sm">Your time</p>
                        </div>
                        <div className="text-right">
                          <p className="text-purple-300 text-sm">{slot.theirTime}</p>
                          <p className="text-white/40 text-xs">Their time</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex gap-3">
          {step === 'form' && (
            <>
              <button
                onClick={resetAndClose}
                className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={findAvailableSlots}
                disabled={loading || form.preferredDays.length === 0}
                className="flex-1 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50"
              >
                {loading ? 'Finding slots...' : 'Find Available Times'}
              </button>
            </>
          )}

          {step === 'slots' && (
            <>
              <button
                onClick={() => setStep('form')}
                className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 transition"
              >
                ← Back
              </button>
              <button
                onClick={scheduleMeeting}
                disabled={!selectedSlot || loading}
                className="flex-1 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50"
              >
                {loading ? 'Scheduling...' : 'Schedule & Create Link'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
