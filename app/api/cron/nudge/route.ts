import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from '../../../../lib/telegram';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

  try {
    // Get users with Telegram linked
    const { data: users } = await supabase
      .from('user_preferences')
      .select('user_id, telegram_chat_id, last_nudge_at, nudges_enabled, reminder_minutes')
      .not('telegram_chat_id', 'is', null);

    if (!users) return NextResponse.json({ success: true });

    for (const user of users) {
      const reminderWindow = user.reminder_minutes || 10;
      const reminderTime = new Date(now.getTime() + reminderWindow * 60 * 1000);

      // --- REMINDERS ---
      const { data: upcoming } = await supabase
        .from('scheduled_blocks')
        .select('*')
        .eq('user_id', user.user_id)
        .gt('start_time', now.toISOString())
        .lt('start_time', reminderTime.toISOString())
        .eq('reminder_sent', false)
        .eq('status', 'scheduled');

      if (upcoming) {
        for (const block of upcoming) {
          const startTime = new Date(block.start_time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          });

          await sendTelegramMessage(
            `🔔 *Heads up, sir.*\n\n"${block.title}" begins in ${reminderWindow} minutes (${startTime}).\n\nShall I help you prepare, or would you prefer to reschedule?`
          );

          await supabase
            .from('scheduled_blocks')
            .update({ reminder_sent: true })
            .eq('id', block.id);
        }
      }

      // --- PROACTIVE NUDGES ---
      if (!user.nudges_enabled) continue;

      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      
      const { data: nextEvents } = await supabase
        .from('scheduled_blocks')
        .select('*')
        .eq('user_id', user.user_id)
        .gt('start_time', now.toISOString())
        .lt('start_time', twoHoursFromNow.toISOString())
        .eq('status', 'scheduled');

      // If free time detected
      if (!nextEvents || nextEvents.length === 0) {
        const lastNudge = user.last_nudge_at ? new Date(user.last_nudge_at) : null;
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        if (!lastNudge || lastNudge < twoHoursAgo) {
          // Get a high priority goal or project
          const { data: topGoal } = await supabase
            .from('goals')
            .select('title, hours_completed, total_hours')
            .eq('user_id', user.user_id)
            .eq('status', 'active')
            .eq('priority', 'high')
            .limit(1)
            .single();

          // 20% chance to nudge
          if (Math.random() < 0.2 && topGoal) {
            const hoursLeft = topGoal.total_hours - topGoal.hours_completed;
            
            await sendTelegramMessage(
              `👀 I notice you have a free moment, sir.\n\nPerhaps a quick 30-minute session on *${topGoal.title}*? You have ${hoursLeft}h remaining.\n\nReply "Yes" and I'll block it out for you.`
            );

            await supabase
              .from('user_preferences')
              .update({ last_nudge_at: now.toISOString() })
              .eq('user_id', user.user_id);
          }
        }
      }

      // --- MISSED BLOCK RESCUE ---
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      
      const { data: missedBlocks } = await supabase
        .from('scheduled_blocks')
        .select('*')
        .eq('user_id', user.user_id)
        .lt('start_time', thirtyMinutesAgo.toISOString())
        .gt('start_time', new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString())
        .eq('status', 'scheduled')
        .eq('missed_notification_sent', false);

      if (missedBlocks) {
        for (const block of missedBlocks) {
          await sendTelegramMessage(
            `I noticed "${block.title}" slipped by. No matter, sir. 🛡️\n\nShall I:\n1️⃣ Reschedule for later today\n2️⃣ Move to tomorrow\n3️⃣ Let it go\n\nJust reply with 1, 2, or 3.`
          );

          await supabase
            .from('scheduled_blocks')
            .update({ missed_notification_sent: true })
            .eq('id', block.id);
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Nudge cron error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
