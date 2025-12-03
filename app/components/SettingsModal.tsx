'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function SettingsModal({ isOpen, onClose, userId }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'integrations'>('general');
  
  // General settings
  const [productiveStart, setProductiveStart] = useState('09:00');
  const [productiveEnd, setProductiveEnd] = useState('17:00');
  const [focusBlockLength, setFocusBlockLength] = useState(60);
  
  // Notification settings
  const [reminderMinutes, setReminderMinutes] = useState(10);
  const [dailyRecap, setDailyRecap] = useState(true);
  const [nudgesEnabled, setNudgesEnabled] = useState(true);
  
  // Telegram settings
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  
  // SMS settings (legacy, optional)
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen, userId]);

  const loadPreferences = async () => {
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (data) {
      setPhoneNumber(data.phone_number || '');
      setSmsEnabled(data.sms_enabled || false);
      setTelegramChatId(data.telegram_chat_id || '');
      setTelegramLinked(!!data.telegram_chat_id);
      setProductiveStart(data.productive_hours_start || '09:00');
      setProductiveEnd(data.productive_hours_end || '17:00');
      setFocusBlockLength(data.focus_block_length || 60);
      setReminderMinutes(data.reminder_minutes || 10);
      setDailyRecap(data.daily_recap !== false);
      setNudgesEnabled(data.nudges_enabled !== false);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    // Format phone number if provided
    let formattedPhone = phoneNumber.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = '+1' + formattedPhone;
    } else if (formattedPhone && !formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        phone_number: formattedPhone || null,
        sms_enabled: smsEnabled,
        telegram_chat_id: telegramLinked ? telegramChatId : null,
        productive_hours_start: productiveStart,
        productive_hours_end: productiveEnd,
        focus_block_length: focusBlockLength,
        reminder_minutes: reminderMinutes,
        daily_recap: dailyRecap,
        nudges_enabled: nudgesEnabled,
        updated_at: new Date().toISOString(),
      });

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }

    setSaving(false);
  };

  const linkTelegram = async () => {
    if (!telegramChatId.trim()) return;
    
    setTelegramLoading(true);
    
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        telegram_chat_id: telegramChatId.trim(),
        updated_at: new Date().toISOString(),
      });

    if (!error) {
      setTelegramLinked(true);
      
      // Send a test message
      try {
        await fetch('/api/telegram/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: telegramChatId.trim() }),
        });
      } catch (e) {
        // Test message is optional
      }
    }
    
    setTelegramLoading(false);
  };

  const unlinkTelegram = async () => {
    await supabase
      .from('user_preferences')
      .update({ telegram_chat_id: null })
      .eq('user_id', userId);
    
    setTelegramLinked(false);
    setTelegramChatId('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <h2 className="font-roman text-2xl text-white">Settings</h2>
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-white/50 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {[
            { id: 'general', label: '⚙️ General' },
            { id: 'notifications', label: '🔔 Notifications' },
            { id: 'integrations', label: '🔗 Integrations' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-3 text-sm transition ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-purple-500'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          <AnimatePresence mode="wait">
            {/* General Tab */}
            {activeTab === 'general' && (
              <motion.div
                key="general"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-white font-medium mb-3">⏰ Productive Hours</h3>
                  <p className="text-white/50 text-sm mb-4">
                    When do you work best? AI will prioritize scheduling during these hours.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white/60 text-sm mb-1">Start</label>
                      <input
                        type="time"
                        value={productiveStart}
                        onChange={(e) => setProductiveStart(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-white/60 text-sm mb-1">End</label>
                      <input
                        type="time"
                        value={productiveEnd}
                        onChange={(e) => setProductiveEnd(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-medium mb-3">🎯 Focus Block Length</h3>
                  <p className="text-white/50 text-sm mb-4">
                    How long can you focus before needing a break?
                  </p>
                  <div className="flex gap-2">
                    {[30, 45, 60, 90, 120].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setFocusBlockLength(mins)}
                        className={`flex-1 py-2 rounded-lg border text-sm transition ${
                          focusBlockLength === mins
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'border-white/10 text-white/50 hover:bg-white/5'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-white font-medium mb-3">⏱️ Reminder Time</h3>
                  <p className="text-white/50 text-sm mb-4">
                    How many minutes before a task should I remind you?
                  </p>
                  <div className="flex gap-2">
                    {[5, 10, 15, 30].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setReminderMinutes(mins)}
                        className={`flex-1 py-2 rounded-lg border text-sm transition ${
                          reminderMinutes === mins
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'border-white/10 text-white/50 hover:bg-white/5'
                        }`}
                      >
                        {mins} min
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/[0.07] transition">
                    <div>
                      <p className="text-white">Daily Recap</p>
                      <p className="text-white/50 text-sm">Get a summary of your day at 8 PM</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={dailyRecap}
                      onChange={(e) => setDailyRecap(e.target.checked)}
                      className="w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/[0.07] transition">
                    <div>
                      <p className="text-white">Proactive Nudges</p>
                      <p className="text-white/50 text-sm">Get suggestions during free time</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={nudgesEnabled}
                      onChange={(e) => setNudgesEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                    />
                  </label>
                </div>
              </motion.div>
            )}

            {/* Integrations Tab */}
            {activeTab === 'integrations' && (
              <motion.div
                key="integrations"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                {/* Telegram Integration */}
                <div>
                  <h3 className="text-white font-medium mb-3">📱 Telegram Bot</h3>
                  <p className="text-white/50 text-sm mb-4">
                    Get nudges, reminders, and brain dump via Telegram. Way better than SMS!
                  </p>

                  {telegramLinked ? (
                    <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-green-400">✅</span>
                        <p className="text-green-400 font-medium">Telegram connected!</p>
                      </div>
                      <p className="text-white/60 text-sm mb-3">Chat ID: {telegramChatId}</p>
                      <button
                        onClick={unlinkTelegram}
                        className="text-red-400 text-sm hover:text-red-300 transition"
                      >
                        Disconnect Telegram
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                        <p className="text-white/80 text-sm mb-3">Setup Instructions:</p>
                        <ol className="text-white/50 text-sm space-y-2">
                          <li className="flex gap-2">
                            <span className="text-purple-400">1.</span>
                            Open Telegram and search for <span className="text-purple-400 font-mono">@goalpilot_bot</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-purple-400">2.</span>
                            Tap <span className="text-white/80">Start</span> or send <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">/start</code>
                          </li>
                          <li className="flex gap-2">
                            <span className="text-purple-400">3.</span>
                            The bot will reply with your Chat ID
                          </li>
                          <li className="flex gap-2">
                            <span className="text-purple-400">4.</span>
                            Paste that ID below 👇
                          </li>
                        </ol>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={telegramChatId}
                          onChange={(e) => setTelegramChatId(e.target.value)}
                          placeholder="Enter your Chat ID (e.g., 123456789)"
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                        />
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={linkTelegram}
                          disabled={!telegramChatId.trim() || telegramLoading}
                          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50 transition"
                        >
                          {telegramLoading ? '...' : 'Link'}
                        </motion.button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-white/10" />

                {/* Google Calendar Status */}
                <div>
                  <h3 className="text-white font-medium mb-3">📅 Google Calendar</h3>
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✅</span>
                      <p className="text-green-400">Connected via Google Sign-In</p>
                    </div>
                  </div>
                </div>

                {/* SMS (Optional/Legacy) */}
                <div>
                  <h3 className="text-white font-medium mb-3">💬 SMS (Legacy)</h3>
                  <p className="text-white/50 text-sm mb-4">
                    Optional backup. Telegram is recommended instead.
                  </p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-white/60 text-sm mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="(555) 123-4567"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                      />
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smsEnabled}
                        onChange={(e) => setSmsEnabled(e.target.checked)}
                        className="w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-white/80">Enable SMS (requires Twilio)</span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Settings'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
