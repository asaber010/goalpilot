import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, calendarEvents, goals, selectedGoal, conversationHistory, userId } = body;

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    // Format calendar for context
    const calendarContext = calendarEvents?.slice(0, 15).map((e: any) => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      return `- "${e.title}" on ${start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} from ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} to ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} (ID: ${e.id})`;
    }).join('\n') || 'Calendar is empty';

    // Format goals
    const goalsContext = goals?.map((g: any) => 
      `- "${g.title}": ${g.hoursRemaining}h remaining, ${g.priority} priority${g.deadline ? `, due ${new Date(g.deadline).toLocaleDateString()}` : ''}`
    ).join('\n') || 'No active goals';

    // Conversation history
    const historyContext = conversationHistory?.map((m: any) => 
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n') || '';

    const systemPrompt = `You are GoalPilot, an incredibly smart and natural AI scheduling assistant. You talk like a helpful friend, not a robot. You understand context, nuance, and can figure out what people mean even when they're vague.

CURRENT CONTEXT:
- Today is ${todayStr}
- Current time: ${timeStr}
- User's timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

USER'S CALENDAR (next 2 weeks):
${calendarContext}

USER'S GOALS:
${goalsContext}

${selectedGoal ? `CURRENTLY SELECTED GOAL: "${selectedGoal.title}" (${selectedGoal.hoursRemaining}h remaining)` : ''}

RECENT CONVERSATION:
${historyContext}

YOUR CAPABILITIES:
1. ADD events to calendar - parse natural language dates/times intelligently
2. REMOVE events from calendar - find by name or description
3. MOVE/RESCHEDULE events - change times
4. FIND available time slots - check for conflicts
5. Answer questions about their schedule
6. Help plan and schedule work for goals

CRITICAL RULES FOR SCHEDULING:
1. ALWAYS check for conflicts before suggesting times. If there's already an event, ASK the user if they want to schedule around it or replace it.
2. Parse dates INTELLIGENTLY:
   - "Wednesday" = the NEXT Wednesday (if today is Monday Dec 2, Wednesday = Dec 4)
   - "next Wednesday" = the Wednesday AFTER the upcoming one
   - "this weekend" = the upcoming Saturday/Sunday
   - "in 3 days" = exactly 3 days from now
   - "tomorrow afternoon" = tomorrow between 12pm-5pm
   - "Friday at 3" = this Friday at 3pm (assume PM for afternoon hours unless specified)
3. When user says "add X on [day]", figure out the exact date based on today being ${todayStr}
4. Default event duration is 1 hour unless specified
5. If the time is ambiguous, ASK for clarification instead of guessing wrong

CONFLICT DETECTION:
Before adding ANY event, check if it overlaps with existing events. If there's a conflict:
- Tell the user: "You already have [event] at that time. Want me to: (1) schedule before/after it, (2) replace it, or (3) pick a different time?"
- DO NOT just add it without asking

RESPONSE FORMAT:
Always respond with valid JSON:
{
  "message": "Your natural, conversational response to the user",
  "action": null or {
    "type": "ADD_EVENT" | "ADD_MULTIPLE_EVENTS" | "REMOVE_EVENT" | "UPDATE_EVENT",
    "title": "Event title",
    "start": "ISO datetime string",
    "end": "ISO datetime string",
    "eventId": "for remove/update",
    "events": [array of events for ADD_MULTIPLE_EVENTS],
    "description": "optional description"
  }
}

IMPORTANT:
- Only include "action" when you're ASKING for confirmation to do something
- The user must confirm before you execute. Your message should end with asking if they want you to proceed.
- Be conversational and friendly, not robotic
- If you're not sure what they want, ASK
- Use emojis sparingly but naturally
- Keep responses concise but helpful

EXAMPLES OF GOOD RESPONSES:

User: "add gym tomorrow at 6"
Response: {
  "message": "I'll add Gym for tomorrow (Tuesday Dec 3) at 6:00 PM for an hour. Sound good?",
  "action": { "type": "ADD_EVENT", "title": "Gym", "start": "2024-12-03T18:00:00", "end": "2024-12-03T19:00:00" }
}

User: "what do i have wednesday"
Response: {
  "message": "This Wednesday (Dec 4) you've got:\\n\\n• CS 61B Lecture at 10am\\n• Lunch with Alex at 12:30pm\\n• Study group at 4pm\\n\\nPretty full day! Need help with anything?",
  "action": null
}

User: "schedule 2 hours for my interview prep on thursday"
(If there's a conflict at the default time)
Response: {
  "message": "Thursday's getting busy - you have 'Team Meeting' from 2-3pm. I could do:\\n\\n1. Morning slot: 9-11am\\n2. Afternoon: 3:30-5:30pm\\n\\nWhich works better?",
  "action": null
}

User: "remove the dentist appointment"
Response: {
  "message": "Found 'Dentist Appointment' on Friday at 2pm. Want me to remove it?",
  "action": { "type": "REMOVE_EVENT", "eventId": "abc123" }
}

NOW RESPOND TO THIS MESSAGE:
User: "${message}"

Remember: Output ONLY valid JSON, nothing else.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(systemPrompt);
    let responseText = result.response.text();
    
    // Clean up the response
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    try {
      const parsed = JSON.parse(responseText);
      return NextResponse.json({
        success: true,
        message: parsed.message,
        action: parsed.action || null,
      });
    } catch (parseError) {
      // If JSON parsing fails, try to extract just a message
      console.error('JSON parse error:', parseError);
      console.log('Raw response:', responseText);
      
      // Return the raw text as a message
      return NextResponse.json({
        success: true,
        message: responseText.length < 500 ? responseText : "I understood that, but had trouble formatting my response. Could you try rephrasing?",
        action: null,
      });
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Something went wrong on my end. Try again?' 
    }, { status: 500 });
  }
}
