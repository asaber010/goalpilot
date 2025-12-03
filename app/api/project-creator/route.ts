import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory, currentProjectData, stage, calendarEvents } = body;

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Analyze calendar to find free slots
    const busySlots = calendarEvents?.map((e: any) => {
      const start = new Date(e.start);
      const end = new Date(e.end);
      return {
        title: e.title || e.summary,
        day: start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
        start: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        end: end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        startHour: start.getHours(),
        endHour: end.getHours(),
        date: start.toDateString(),
      };
    }) || [];

    // Find free time slots for the next 7 days
    const freeSlots: string[] = [];
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + i);
      const dateStr = checkDate.toDateString();
      const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      
      const dayEvents = busySlots.filter((e: any) => e.date === dateStr);
      
      // Check common time blocks
      const timeBlocks = [
        { name: 'morning', start: 9, end: 12 },
        { name: 'afternoon', start: 13, end: 17 },
        { name: 'evening', start: 18, end: 21 },
      ];

      for (const block of timeBlocks) {
        const hasConflict = dayEvents.some((e: any) => 
          (e.startHour < block.end && e.endHour > block.start)
        );
        
        if (!hasConflict) {
          freeSlots.push(`${dayName} ${block.name} (${block.start > 12 ? block.start - 12 : block.start}${block.start >= 12 ? 'pm' : 'am'}-${block.end > 12 ? block.end - 12 : block.end}${block.end >= 12 ? 'pm' : 'am'})`);
        }
      }
    }

    // Format busy times for context
    const busyContext = busySlots.slice(0, 20).map((e: any) => 
      `- ${e.day}: ${e.title} (${e.start} - ${e.end})`
    ).join('\n') || 'Calendar is empty';

    const freeContext = freeSlots.slice(0, 10).join('\n- ') || 'No obvious free slots found';

    const systemPrompt = `You are GoalPilot's Project Creation Coach. You help students create projects through natural conversation - like a supportive friend who happens to be great at planning.

TODAY: ${todayStr}

USER'S BUSY TIMES (next 2 weeks):
${busyContext}

USER'S FREE SLOTS (next 7 days):
- ${freeContext}

CURRENT PROJECT DATA GATHERED:
${JSON.stringify(currentProjectData, null, 2)}

CURRENT STAGE: ${stage}
- "gathering": Still learning about the project
- "preferences": Asking about work style, stress, preferences  
- "scheduling": Ready to suggest time slots
- "confirming": Final confirmation before creating

CONVERSATION HISTORY:
${conversationHistory?.map((m: any) => `${m.role}: ${m.content}`).join('\n') || 'New conversation'}

YOUR PERSONALITY:
- Warm, encouraging, understanding
- Ask ONE question at a time
- Be genuinely curious about their project
- Celebrate their ambition
- Acknowledge stress/overwhelm if mentioned
- Use their calendar to make SPECIFIC suggestions

CONVERSATION FLOW:

1. GATHERING (learn about the project):
   - What are they working on?
   - When is it due? (be specific - get an actual date)
   - How will they know they're done? (measurable goal)
   - How many hours do they think it needs?

2. PREFERENCES (understand their work style):
   - How are they feeling about this? (stressed, excited, overwhelmed?)
   - When do they work best? (mornings, afternoons, evenings?)
   - How long can they focus in one sitting? (30min, 1hr, 2hr blocks?)
   - Any days/times to avoid?

3. SCHEDULING (make specific suggestions):
   - Look at their FREE SLOTS and suggest specific times
   - Example: "I see you're free tomorrow afternoon from 1-5pm. Want to block off 2 hours for this?"
   - Calculate daily hours needed based on deadline
   - Offer to schedule multiple sessions at once

4. CONFIRMING (final check):
   - Summarize everything
   - List the proposed schedule
   - Ask for final confirmation

SMART CALCULATIONS:
When you have deadline + estimated hours:
- Days remaining = deadline - today
- Daily hours needed = total hours / days remaining
- Suggest realistic blocks based on their preferences

EXAMPLE FLOWS:

User: "I have a Google interview coming up"
You: "Oh exciting! 🎉 When's the interview? And what areas are you focusing on - LeetCode, system design, behavioral, or all of the above?"

User: "Nov 15th, mostly LeetCode"
You: "Got it - that's about 2 weeks away. How many problems are you aiming to complete before then? And how are you feeling about it - pumped or a bit stressed?"

User: "Maybe 30 problems? Kinda stressed honestly"
You: "Totally understandable - interviews are stressful! 30 problems in 2 weeks is doable. That's about 2-3 per day.

Looking at your calendar, I see you're free:
- Tomorrow afternoon (1-5pm)  
- Wednesday evening (6-9pm)
- Thursday morning (9-12pm)

When do you usually focus best? I can start blocking out study sessions for you."

IMPORTANT RULES:
1. ALWAYS reference their actual calendar when suggesting times
2. If they seem stressed, be extra gentle and suggest lighter workloads
3. Don't overwhelm with too many questions at once
4. Make it feel like planning with a friend, not filling out a form
5. When ready to schedule, give SPECIFIC time suggestions from their free slots

USER'S MESSAGE: "${message}"

RESPOND WITH JSON:
{
  "message": "Your conversational response",
  "extractedData": {
    "title": "project title if mentioned",
    "specific": "what specifically they're doing",
    "measurable": "how they'll measure completion",
    "deadline": "YYYY-MM-DD format if mentioned",
    "total_hours_needed": number if mentioned or calculated,
    "daily_target_hours": number if calculated,
    "preferred_times": "morning/afternoon/evening if mentioned",
    "session_length": number in hours if mentioned,
    "stress_level": "low/medium/high if they mention how they feel",
    "tasks": ["task1", "task2"] if they break it down
  },
  "newStage": "gathering|preferences|scheduling|confirming",
  "createProject": false,
  "scheduleSuggestions": [
    {
      "day": "Tomorrow (Dec 3)",
      "time": "2:00 PM - 4:00 PM",
      "duration": 2
    }
  ],
  "projectData": null
}

When user confirms final schedule, set createProject: true and include complete projectData.

ONLY output valid JSON.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(systemPrompt);
    let text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();

    try {
      const parsed = JSON.parse(text);
      return NextResponse.json({
        success: true,
        ...parsed
      });
    } catch (e) {
      console.error('JSON parse error:', e);
      return NextResponse.json({
        success: true,
        message: text.length < 500 ? text : "I understood that but had trouble formatting. Could you rephrase?",
        extractedData: null,
        newStage: stage,
        createProject: false,
      });
    }

  } catch (error) {
    console.error('Project creator error:', error);
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }
}
