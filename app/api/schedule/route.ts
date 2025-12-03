import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Sanity check layer - validates AI suggestions
function validateTimeBlock(block: any): { valid: boolean; reason?: string } {
  const start = new Date(block.start);
  const end = new Date(block.end);
  const hour = start.getHours();
  
  // Rule 1: No scheduling before 7am or after 11pm
  if (hour < 5 || hour >= 23) {
    return { valid: false, reason: 'Outside reasonable hours (5am-11pm)' };
  }
  
  // Rule 2: Block must be at least 30 min
  const durationMs = end.getTime() - start.getTime();
  if (durationMs < 30 * 60 * 1000) {
    return { valid: false, reason: 'Block too short (min 30 min)' };
  }
  
  // Rule 3: Block can't be longer than 4 hours
  if (durationMs > 4 * 60 * 60 * 1000) {
    return { valid: false, reason: 'Block too long (max 4 hours)' };
  }
  
  // Rule 4: Must be in the future
  if (start < new Date()) {
    return { valid: false, reason: 'Cannot schedule in the past' };
  }
  
  return { valid: true };
}

// Check if a time slot conflicts with existing events
function hasConflict(block: any, existingEvents: any[]): boolean {
  const blockStart = new Date(block.start).getTime();
  const blockEnd = new Date(block.end).getTime();
  
  return existingEvents.some(event => {
    const eventStart = new Date(event.start.dateTime || event.start.date).getTime();
    const eventEnd = new Date(event.end.dateTime || event.end.date).getTime();
    
    // Check for overlap
    return blockStart < eventEnd && blockEnd > eventStart;
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal, calendarEvents, userPreferences, stressLevel } = body;

    // === THE EYES: Build context ===
    const busyTimes = calendarEvents.map((event: any) => ({
      title: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
    }));

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // === THE BRAIN: System prompt with ADHD support ===
    const systemPrompt = `You are GoalPilot, a compassionate but focused accountability partner designed for students, especially those with ADHD or executive dysfunction.

YOUR PERSONALITY:
${stressLevel === 'high' 
  ? `- The user is stressed. Be gentle, supportive, and break things into TINY steps.
- Use calming language. Remind them it's okay to start small.
- Focus on just the next 1-2 days, don't overwhelm them.`
  : `- The user seems okay. Be encouraging and structured.
- You can be a bit more direct and challenge them gently.
- Plan for the full week if needed.`
}

YOUR RULES:
1. NEVER shame the user for missed deadlines or procrastination
2. Break work into small, dopamine-friendly chunks (30-90 min blocks)
3. Schedule buffer time between blocks (at least 15 min)
4. Respect the user's energy patterns (avoid early morning if they struggle with it)
5. Front-load high-priority tasks earlier in the week
6. For exams/deadlines: increase intensity as the date approaches

SCHEDULING CONSTRAINTS:
- Only schedule between 7:00 AM and 11:00 PM
- Minimum block: 30 minutes
- Maximum block: 2 hours (ADHD brains need breaks)
- Always leave at least 15 min buffer after classes
- Weekends can be lighter unless deadline is urgent

CURRENT CONTEXT:
- Current time: ${now.toISOString()}
- Scheduling window: ${now.toLocaleDateString()} to ${weekFromNow.toLocaleDateString()}
- User preferences: ${JSON.stringify(userPreferences || { productiveHours: { start: 9, end: 17 } })}

USER'S BUSY TIMES (DO NOT DOUBLE-BOOK):
${JSON.stringify(busyTimes, null, 2)}

GOAL TO SCHEDULE:
- Title: ${goal.title}
- Description: ${goal.description || 'No description'}
- Total hours needed: ${goal.total_hours}
- Hours already completed: ${goal.hours_completed}
- Hours remaining: ${goal.total_hours - goal.hours_completed}
- Priority: ${goal.priority}
- Deadline: ${goal.deadline || 'No specific deadline'}

YOUR TASK:
Suggest time blocks to complete this goal. Return ONLY valid JSON in this exact format:

{
  "thinking": "Brief explanation of your scheduling strategy",
  "blocks": [
    {
      "start": "ISO timestamp",
      "end": "ISO timestamp", 
      "title": "What to work on",
      "microTasks": ["Tiny step 1", "Tiny step 2", "Tiny step 3"]
    }
  ],
  "motivationalNote": "A short, encouraging message for the user"
}

IMPORTANT: Return ONLY the JSON, no markdown, no code blocks, just raw JSON.`;

    // === Call Gemini ===
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    let text = response.text();
    
    // Clean up response (remove markdown if present)
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let aiResponse;
    try {
      aiResponse = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse AI response:', text);
      return NextResponse.json({ error: 'AI returned invalid format' }, { status: 500 });
    }

    // === THE SANITY CHECK LAYER ===
    const validatedBlocks = [];
    const rejectedBlocks = [];

    for (const block of aiResponse.blocks || []) {
      // Check 1: Validate time constraints
      const validation = validateTimeBlock(block);
      if (!validation.valid) {
        rejectedBlocks.push({ ...block, reason: validation.reason });
        continue;
      }

      // Check 2: No conflicts with existing events
      if (hasConflict(block, calendarEvents)) {
        rejectedBlocks.push({ ...block, reason: 'Conflicts with existing event' });
        continue;
      }

      validatedBlocks.push(block);
    }

    // If too many blocks were rejected, ask AI to retry
    if (validatedBlocks.length === 0 && aiResponse.blocks?.length > 0) {
      return NextResponse.json({
        error: 'All suggested blocks were invalid. Please try again.',
        rejectedBlocks,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      thinking: aiResponse.thinking,
      blocks: validatedBlocks,
      rejectedBlocks: rejectedBlocks.length > 0 ? rejectedBlocks : undefined,
      motivationalNote: aiResponse.motivationalNote,
      goalId: goal.id,
    });

  } catch (error) {
    console.error('Scheduling error:', error);
    return NextResponse.json({ error: 'Failed to generate schedule' }, { status: 500 });
  }
}
