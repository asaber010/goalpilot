import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function GET(request: NextRequest) {
  // Verify cron secret (for security)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Find users who haven't responded to reminders
    const { data: unresponsiveUsers } = await supabase
      .from('user_preferences')
      .select('*, goals(*)')
      .eq('sms_enabled', true)
      .lt('last_interaction', twoHoursAgo.toISOString())
      .gt('unresponsive_count', 1)
      .eq('rescue_mode', false);

    for (const user of unresponsiveUsers || []) {
      if (!user.phone_number) continue;

      // Check if they have scheduled tasks today
      const { data: todayBlocks } = await supabase
        .from('scheduled_blocks')
        .select('*')
        .eq('user_id', user.user_id)
        .eq('status', 'scheduled')
        .gte('start_time', now.toISOString())
        .lte('start_time', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());

      if (todayBlocks && todayBlocks.length > 0) {
        // Send rescue message
        const rescueMessages = [
          "Hey, looks like the day got away from us. No stress! 🛡️ I've moved your tasks to tomorrow. Enjoy your evening guilt-free.",
          "Life happens! I've rescheduled today's blocks to give you breathing room. Fresh start tomorrow? 💪",
          "Taking today off your plate. Sometimes rest IS the productive choice. See you tomorrow! ✨",
        ];

        const message = rescueMessages[Math.floor(Math.random() * rescueMessages.length)];

        await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: user.phone_number,
        });

        // Mark blocks as rescheduled
        await supabase
          .from('scheduled_blocks')
          .update({ status: 'rescheduled' })
          .eq('user_id', user.user_id)
          .eq('status', 'scheduled')
          .gte('start_time', now.toISOString())
          .lte('start_time', new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString());

        // Enable rescue mode
        await supabase
          .from('user_preferences')
          .update({ rescue_mode: true, unresponsive_count: 0 })
          .eq('user_id', user.user_id);

        console.log(`Rescue mode activated for user ${user.user_id}`);
      }
    }

    return NextResponse.json({ success: true, processed: unresponsiveUsers?.length || 0 });
  } catch (error) {
    console.error('Rescue cron error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
