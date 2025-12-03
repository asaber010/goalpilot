import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { TOOLS, TOOL_DEFINITIONS } from '@/lib/agent-tools';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegram(chatId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

async function saveToHistory(userId: string, role: 'user' | 'model', content: string) {
  await supabase.from('telegram_history').insert({ user_id: userId, role, content });
}

async function getHistory(userId: string, limit: number = 10) {
  const { data } = await supabase
    .from('telegram_history')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data?.reverse() || [];
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    if (!update.message) return NextResponse.json({ ok: true });

    const chatId = String(update.message.chat.id);
    const text = update.message.text || '';
    const telegramName = update.message.from?.first_name || 'there';
    const telegramUsername = update.message.from?.username || null;

    // ============================================
    // ACCOUNT LINKING via /start <code>
    // ============================================
    if (text.startsWith('/start ')) {
      const code = text.split(' ')[1];

      if (code && code.startsWith('alfred-')) {
        const { data: userPref } = await supabase
          .from('user_preferences')
          .select('user_id, display_name')
          .eq('connection_code', code)
          .single();

        if (userPref) {
          await supabase
            .from('user_preferences')
            .update({
              telegram_chat_id: chatId,
              telegram_username: telegramUsername,
              connection_code: null,
            })
            .eq('user_id', userPref.user_id);

          const name = userPref.display_name || telegramName;
          await sendTelegram(
            chatId,
            `🤝 *Connection Successful, ${name}!*\n\nI am Alfred, your personal productivity assistant. I'm now linked to your GoalPilot dashboard.\n\n*What I can do:*\n📝 Save thoughts & ideas\n📅 Check your schedule\n🎯 Track goals & projects\n⏰ Schedule focus blocks\n😰 Help when you're overwhelmed\n\nTry saying: "What's on my schedule today?"`
          );
          return NextResponse.json({ ok: true });
        } else {
          await sendTelegram(chatId, `⚠️ *Link Failed*\n\nThat code was invalid or expired. Please go back to your GoalPilot dashboard and try again.`);
          return NextResponse.json({ ok: true });
        }
      }
    }

    // ============================================
    // REGULAR /start (no code)
    // ============================================
    if (text === '/start') {
      await sendTelegram(
        chatId,
        `Hello ${telegramName}! 🎩\n\nI'm Alfred, your GoalPilot assistant.\n\nTo get started, please connect me to your account:\n\n1. Go to *goalpilot-iota.vercel.app*\n2. Click the *Alfred* icon in the dock\n3. Scan the QR code or click Connect\n\nI look forward to serving you.`
      );
      return NextResponse.json({ ok: true });
    }

    // ============================================
    // IDENTIFY USER & GET REAL DATA
    // ============================================
    const { data: userPref } = await supabase
      .from('user_preferences')
      .select('user_id, display_name')
      .eq('telegram_chat_id', chatId)
      .single();

    if (!userPref) {
      await sendTelegram(
        chatId,
        `Hello ${telegramName}! 👋\n\nI don't have you linked yet. Please:\n\n1. Go to *goalpilot-iota.vercel.app*\n2. Click the *Alfred* icon in the dock\n3. Scan the QR code or click Connect`
      );
      return NextResponse.json({ ok: true });
    }

    const userId = userPref.user_id;
    const displayName = userPref.display_name || telegramName;

    // Save user message to history
    await saveToHistory(userId, 'user', text);

    // ============================================
    // FETCH ALL USER DATA (THE "EYES")
    // ============================================
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Today's full schedule
    const { data: schedule } = await supabase
      .from('scheduled_blocks')
      .select('id, title, start_time, end_time, status')
      .eq('user_id', userId)
      .gte('start_time', todayStart.toISOString())
      .lte('start_time', todayEnd.toISOString())
      .order('start_time', { ascending: true });

    const scheduleSummary =
      schedule && schedule.length > 0
        ? schedule
            .map((e) => {
              const time = new Date(e.start_time).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              });
              return `• ${time}: ${e.title} (${e.status})`;
            })
            .join('\n')
        : 'Nothing scheduled today.';

    // Active goals
    const { data: goals } = await supabase
      .from('goals')
      .select('id, title, priority, hours_completed, total_hours')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(5);

    const goalsSummary =
      goals && goals.length > 0
        ? goals
            .map((g) => {
              const progress = g.total_hours > 0 ? Math.round((g.hours_completed / g.total_hours) * 100) : 0;
              return `• ${g.title}: ${progress}% (${g.hours_completed}/${g.total_hours}h) [${g.priority}]`;
            })
            .join('\n')
        : 'No active goals.';

    // Active projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, title, progress_percent, deadline')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(5);

    const projectsSummary =
      projects && projects.length > 0
        ? projects
            .map((p) => {
              const deadline = p.deadline ? new Date(p.deadline).toLocaleDateString() : 'No deadline';
              return `• ${p.title}: ${p.progress_percent}% (Due: ${deadline})`;
            })
            .join('\n')
        : 'No active projects.';

    // Conversation history
    const history = await getHistory(userId, 10);

    // ============================================
    // ALFRED AI BRAIN WITH FULL CONTEXT
    // ============================================
    const systemInstruction = `You are Alfred, a loyal, intelligent, and highly capable executive assistant for GoalPilot.

YOUR PERSONA:
- You speak like Alfred Pennyworth - professional yet warm, with subtle wit
- You're supportive and empathetic. If user expresses stress, acknowledge it FIRST
- Keep responses SHORT for Telegram (2-4 sentences max unless listing data)
- Use *bold* for emphasis and emojis sparingly

CURRENT CONTEXT:
- User's Name: ${displayName} (ALWAYS use this name, never their Telegram username)
- Current Date: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
- Current Time: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}

📅 TODAY'S SCHEDULE:
${scheduleSummary}

🎯 ACTIVE GOALS:
${goalsSummary}

📁 ACTIVE PROJECTS:
${projectsSummary}

YOUR TOOLS (use when appropriate):
- create_project: For big initiatives (exams, interviews, assignments)
- create_goal: For goals needing time allocation
- schedule_block: Schedule specific time blocks
- reschedule_block: Move existing blocks
- get_schedule: Check calendar for a specific day
- get_goals: List all active goals
- get_projects: List all active projects
- log_brain_dump: Save random thoughts/ideas
- update_goal_progress: Log hours worked
- mark_block_complete: Mark tasks done

CRITICAL RULES:
1. NEVER say "I can't see your calendar" - THE DATA IS ABOVE
2. When asked "What's on my schedule?" - READ THE SCHEDULE ABOVE and respond
3. When asked about goals/projects - USE THE DATA ABOVE
4. Address user as "${displayName}", never "mooz" or any username
5. If user wants to schedule something, USE schedule_block tool
6. If user says they completed something, USE mark_block_complete tool
7. Be concise - this is Telegram, not email`;

    // ============================================
    // EXECUTE AI
    // ============================================
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ functionDeclarations: TOOL_DEFINITIONS as any }],
    });

    const geminiHistory = history.slice(0, -1).map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(`${systemInstruction}\n\n---\n\nUser message: ${text}`);
    const response = result.response;
    const functionCalls = response.functionCalls();

    let finalReply = '';

    if (functionCalls && functionCalls.length > 0) {
      const toolResults: string[] = [];

      for (const call of functionCalls) {
        const fnName = call.name as keyof typeof TOOLS;
        const fnArgs = call.args as any;

        console.log(`Alfred executing tool: ${fnName}`, fnArgs);

        if (TOOLS[fnName]) {
          try {
            const toolResult = await TOOLS[fnName](userId, fnArgs);
            toolResults.push(`${fnName}: ${toolResult}`);
          } catch (error) {
            console.error(`Tool ${fnName} failed:`, error);
            toolResults.push(`${fnName}: Failed`);
          }
        }
      }

      const followUp = await chat.sendMessage(
        `Tool results:\n${toolResults.join('\n')}\n\nRespond naturally to ${displayName}, confirming what was done. Be brief and friendly.`
      );
      finalReply = followUp.response.text();
    } else {
      finalReply = response.text();
    }

    // Clean up for Telegram
    finalReply = finalReply.replace(/\*\*/g, '*').trim();
    if (!finalReply) finalReply = "I'm here to help. What would you like to do?";

    await sendTelegram(chatId, finalReply);
    await saveToHistory(userId, 'model', finalReply);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
