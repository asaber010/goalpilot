import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId, calendarEvents, goals, projects } = await request.json();

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    // Filter events from past week
    const weekEvents = calendarEvents?.filter((e: any) => {
      const start = new Date(e.start?.dateTime || e.start?.date || e.start);
      return start >= weekStart && start <= now;
    }) || [];

    // Calculate time distribution
    let classHours = 0;
    let meetingHours = 0;
    let studyHours = 0;
    let projectHours = 0;
    let otherHours = 0;

    weekEvents.forEach((event: any) => {
      const start = new Date(event.start?.dateTime || event.start?.date || event.start);
      const end = new Date(event.end?.dateTime || event.end?.date || event.end);
      const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      const summary = (event.summary || event.title || '').toLowerCase();

      if (summary.includes('cs') || summary.includes('eecs') || summary.includes('lecture') || summary.includes('disc')) {
        classHours += duration;
      } else if (summary.includes('meeting') || summary.includes('1:1') || summary.includes('sync')) {
        meetingHours += duration;
      } else if (summary.includes('study') || summary.includes('📚') || summary.includes('prep')) {
        studyHours += duration;
      } else if (summary.includes('project') || summary.includes('work on')) {
        projectHours += duration;
      } else {
        otherHours += duration;
      }
    });

    const totalHours = classHours + meetingHours + studyHours + projectHours + otherHours;

    const distribution = [
      { label: 'Classes', hours: Math.round(classHours * 10) / 10, color: '#ef4444' },
      { label: 'Meetings', hours: Math.round(meetingHours * 10) / 10, color: '#3b82f6' },
      { label: 'Study', hours: Math.round(studyHours * 10) / 10, color: '#a855f7' },
      { label: 'Projects', hours: Math.round(projectHours * 10) / 10, color: '#22c55e' },
      { label: 'Other', hours: Math.round(otherHours * 10) / 10, color: '#6b7280' },
    ].filter(d => d.hours > 0);

    // Analyze patterns
    const dayBreakdown: Record<string, number> = {};
    const hourBreakdown: Record<number, number> = {};
    
    weekEvents.forEach((event: any) => {
      const start = new Date(event.start?.dateTime || event.start?.date || event.start);
      const day = start.toLocaleDateString('en-US', { weekday: 'long' });
      const hour = start.getHours();
      const duration = (new Date(event.end?.dateTime || event.end?.date || event.end).getTime() - start.getTime()) / (1000 * 60 * 60);
      
      dayBreakdown[day] = (dayBreakdown[day] || 0) + duration;
      hourBreakdown[hour] = (hourBreakdown[hour] || 0) + duration;
    });

    // Find busiest/quietest days
    const busiestDay = Object.entries(dayBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
    const quietestDay = Object.entries(dayBreakdown).sort((a, b) => a[1] - b[1])[0]?.[0] || 'None';
    
    // Find peak hours
    const peakHour = Object.entries(hourBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || '9';

    // Goals progress
    const goalsContext = goals?.map((g: any) => ({
      title: g.title,
      progress: g.total_hours > 0 ? Math.round((g.hours_completed / g.total_hours) * 100) : 0,
      deadline: g.deadline,
    })) || [];

    // Projects progress
    const projectsContext = projects?.map((p: any) => ({
      title: p.title,
      progress: p.progress_percent,
      deadline: p.deadline,
    })) || [];

    // AI Analysis
    const systemPrompt = `You are GoalPilot's Recap AI. Analyze this student's week and provide deep insights.

WEEK DATA:
- Total logged hours: ${totalHours}h
- Distribution: ${JSON.stringify(distribution)}
- Busiest day: ${busiestDay}
- Quietest day: ${quietestDay}
- Peak productivity hour: ${peakHour}:00
- Day breakdown: ${JSON.stringify(dayBreakdown)}

GOALS STATUS:
${JSON.stringify(goalsContext)}

PROJECTS STATUS:
${JSON.stringify(projectsContext)}

ARCHETYPES (pick one that fits):
- "The Machine" - Consistent, high output, rarely misses blocks
- "The Night Owl" - Most productive late in the day
- "The Early Bird" - Crushes mornings, fades by afternoon
- "The Sprinter" - Intense bursts with recovery days
- "The Deep Diver" - Long focused sessions, few breaks
- "The Architect" - Methodical planner, balanced schedule
- "The Grinder" - Pure hustle, maybe too much
- "The Phoenix" - Recovering from a rough patch
- "The Explorer" - Trying new approaches, experimental
- "The Guardian" - Protecting mental health, sustainable pace

OUTPUT (JSON only):
{
  "archetype": "The [Name]",
  "archetypeDescription": "One sentence explaining why this fits them",
  "focusScore": 1-100 based on consistency and completion,
  "keyInsight": "One deep observation about their work patterns (be specific, reference actual data)",
  "patterns": {
    "strength": "What they're doing well",
    "weakness": "What could improve",
    "trend": "up/down/stable compared to typical"
  },
  "suggestions": [
    "Specific actionable suggestion 1",
    "Specific actionable suggestion 2",
    "Specific actionable suggestion 3"
  ],
  "motivationalNote": "A brief encouraging message tailored to their archetype"
}

Be specific, reference actual numbers, and be genuinely helpful. Don't be generic.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(systemPrompt);
    let text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();

    let aiAnalysis;
    try {
      aiAnalysis = JSON.parse(text);
    } catch (e) {
      aiAnalysis = {
        archetype: "The Explorer",
        archetypeDescription: "Charting your own path this week",
        focusScore: 70,
        keyInsight: `You logged ${totalHours} hours this week with most activity on ${busiestDay}.`,
        patterns: { strength: "Showing up", weakness: "Could optimize timing", trend: "stable" },
        suggestions: ["Try time-blocking your most important tasks", "Add buffer time between events"],
        motivationalNote: "Keep experimenting to find what works best for you!"
      };
    }

    // Calculate completion rate (rough estimate)
    const completionRate = Math.min(100, Math.round((totalHours / 40) * 100)); // Assuming 40h target

    // Save recap to database
    const { data: recap, error } = await supabase.from('recaps').insert({
      user_id: userId,
      start_date: weekStart.toISOString(),
      end_date: now.toISOString(),
      type: 'weekly',
      total_hours_logged: totalHours,
      total_hours_planned: 40, // Could be dynamic based on scheduled blocks
      completion_rate: completionRate,
      focus_score: aiAnalysis.focusScore,
      distribution,
      key_insight: aiAnalysis.keyInsight,
      pilot_archetype: aiAnalysis.archetype,
      archetype_description: aiAnalysis.archetypeDescription,
      suggestions: aiAnalysis.suggestions,
    }).select().single();

    // Update user preferences
    await supabase
      .from('user_preferences')
      .update({ last_recap_date: now.toISOString(), recap_notification: false })
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      recap: {
        id: recap?.id,
        totalHours: Math.round(totalHours * 10) / 10,
        completionRate,
        distribution,
        busiestDay,
        quietestDay,
        peakHour: parseInt(peakHour),
        ...aiAnalysis,
      }
    });

  } catch (error) {
    console.error('Recap error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate recap' }, { status: 500 });
  }
}
