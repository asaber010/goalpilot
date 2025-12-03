import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, project, calendarEvents, conversationHistory } = body;

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Format calendar events
    const calendarContext = calendarEvents?.slice(0, 15).map((e: any) => {
      const start = new Date(e.start?.dateTime || e.start?.date || e.start);
      return `- ${e.summary || e.title} on ${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }).join('\n') || 'No events';

    // Format tasks
    const tasksContext = project.tasks?.map((t: any) => 
      `- [${t.completed ? 'x' : ' '}] ${t.title}`
    ).join('\n') || 'No tasks';

    // Format session logs
    const logsContext = project.sessionLogs?.map((l: any) => 
      `- ${new Date(l.started_at).toLocaleDateString()}: ${l.duration_minutes}min - ${l.note || 'No note'}`
    ).join('\n') || 'No logs';

    const systemPrompt = `You are GoalPilot's Project AI Assistant. You help users manage and adjust their project plans.

TODAY: ${todayStr}

PROJECT DETAILS:
- Title: ${project.title}
- Goal: ${project.specific || project.measurable || 'Not specified'}
- Deadline: ${project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No deadline'}
- Progress: ${project.progress_percent}%
- Hours: ${project.hours_completed}/${project.total_hours_needed || '?'} completed
- Daily Target: ${project.daily_target_hours || '?'}h/day
- Review Frequency: ${project.review_frequency || 'weekly'}

TASKS:
${tasksContext}

USER'S NOTES:
${project.notes || 'No notes yet'}

RECENT SESSIONS:
${logsContext}

CALENDAR (next 2 weeks):
${calendarContext}

CONVERSATION HISTORY:
${conversationHistory?.map((m: any) => `${m.role}: ${m.content}`).join('\n') || 'New conversation'}

YOUR CAPABILITIES:
1. Analyze progress and give feedback
2. Adjust the plan (make it more/less intense)
3. Add new tasks
4. Schedule study sessions on their calendar
5. Provide motivation and support
6. Review notes and give insights

RESPONSE FORMAT (JSON):
{
  "message": "Your conversational response",
  "action": null or {
    "type": "UPDATE_PLAN" | "ADD_TASKS" | "SCHEDULE_SESSIONS",
    "plan": { updated plan details for UPDATE_PLAN },
    "tasks": ["task1", "task2"] for ADD_TASKS,
    "sessions": [{ "start": "ISO", "end": "ISO" }] for SCHEDULE_SESSIONS
  }
}

IMPORTANT:
- Read their notes carefully - they might have scores, progress, or preferences
- If they seem overwhelmed, suggest reducing the load
- Be encouraging and supportive
- When scheduling, check for calendar conflicts
- Calculate realistic daily targets based on deadline and remaining work
- If asked to review progress, analyze their notes and tasks

USER MESSAGE: "${message}"

Respond with JSON only.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(systemPrompt);
    let text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();

    try {
      const parsed = JSON.parse(text);
      return NextResponse.json({
        success: true,
        message: parsed.message,
        action: parsed.action || null,
      });
    } catch (e) {
      return NextResponse.json({
        success: true,
        message: text.length < 500 ? text : "I understood that but had trouble formatting. Try rephrasing?",
        action: null,
      });
    }

  } catch (error) {
    console.error('Project AI error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Something went wrong. Try again?' 
    }, { status: 500 });
  }
}
