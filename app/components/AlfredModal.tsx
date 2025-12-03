'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';

interface AlfredModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export default function AlfredModal({ isOpen, onClose, userId }: AlfredModalProps) {
  const [step, setStep] = useState<'loading' | 'connect' | 'connected'>('loading');
  const [botLink, setBotLink] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [connectionCode, setConnectionCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const checkConnection = async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('telegram_chat_id, telegram_username')
        .eq('user_id', userId)
        .single();

      if (data?.telegram_chat_id) {
        setTelegramUsername(data.telegram_username || 'Connected');
        setStep('connected');
      } else {
        await generateLink();
      }
    };

    checkConnection();

    const channel = supabase
      .channel('alfred-connection')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_preferences',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          if (payload.new.telegram_chat_id) {
            setTelegramUsername(payload.new.telegram_username || 'Connected');
            setStep('connected');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, userId]);

  const generateLink = async () => {
    const uniqueCode = `alfred-${Math.random().toString(36).substring(2, 8)}`;
    setConnectionCode(uniqueCode);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const realName = user?.user_metadata?.full_name || user?.user_metadata?.name || null;

      const { data: existing } = await supabase
        .from('user_preferences')
        .select('user_id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('user_preferences')
          .update({
            connection_code: uniqueCode,
            display_name: realName,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_preferences')
          .insert({
            user_id: userId,
            connection_code: uniqueCode,
            display_name: realName,
            updated_at: new Date().toISOString(),
          });
        
        if (error) throw error;
      }

      const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'goalpilot_zen_bot';
      setBotLink(`https://t.me/${botUsername}?start=${uniqueCode}`);
      setStep('connect');
    } catch (err) {
      console.error('Error generating link:', err);
      setError('Failed to generate link. Please try again.');
    }
  };

  const handleDisconnect = async () => {
    await supabase
      .from('user_preferences')
      .update({
        telegram_chat_id: null,
        telegram_username: null,
      })
      .eq('user_id', userId);

    setStep('connect');
    await generateLink();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(botLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-[#0a0a0f] border border-white/10 rounded-2xl w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="relative p-6 text-center border-b border-white/10 bg-gradient-to-b from-purple-900/20 to-transparent">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="w-16 h-16 bg-gradient-to-br from-purple-600/30 to-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-3 border border-purple-500/30"
          >
            <span className="text-3xl">🤖</span>
          </motion.div>

          <h2 className="font-roman text-xl text-white mb-1">Alfred</h2>
          <p className="text-white/50 text-sm">Your AI assistant on Telegram</p>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/50 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full mx-auto"
                />
                <p className="text-white/50 mt-4">Loading...</p>
              </motion.div>
            )}

            {step === 'connect' && (
              <motion.div
                key="connect"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* QR Code */}
                <div className="bg-white p-4 rounded-xl w-fit mx-auto">
                  <QRCodeSVG value={botLink} size={150} level="M" />
                </div>

                <p className="text-center text-white/50 text-sm">
                  Scan with your phone or click below
                </p>

                {/* Connect Button */}
                <motion.a
                  href={botLink}
                  target="_blank"
                  rel="noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition font-medium text-center"
                >
                  Open in Telegram
                </motion.a>

                <button
                  onClick={copyLink}
                  className="w-full py-2 text-white/50 hover:text-white text-sm transition"
                >
                  {copied ? '✓ Copied!' : 'Copy link'}
                </button>

                <div className="text-xs text-white/30 text-center">
                  Tap "Start" in Telegram to connect
                </div>
              </motion.div>
            )}

            {step === 'connected' && (
              <motion.div
                key="connected"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* Status */}
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <p className="text-green-400 font-medium">Connected</p>
                  </div>
                  <p className="text-white/50 text-sm">@{telegramUsername}</p>
                </div>

                {/* What Alfred can do */}
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-3">
                    What Alfred can do
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      'Check your schedule',
                      'Track your goals',
                      'Schedule tasks',
                      'Quick brain dumps',
                      'Daily reminders',
                      'Progress updates',
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="p-2 bg-white/5 rounded-lg border border-white/5 text-white/60"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Open Chat */}
                <motion.a
                  href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'goalpilot_zen_bot'}`}
                  target="_blank"
                  rel="noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition font-medium text-center"
                >
                  Open Chat
                </motion.a>

                {/* Disconnect */}
                <button
                  onClick={handleDisconnect}
                  className="w-full text-red-400/60 hover:text-red-400 text-sm transition py-2"
                >
                  Disconnect
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
