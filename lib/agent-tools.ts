import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Tool implementations - what Alfred can actually DO
export const TOOLS: Record<string, (userId: string, args: any) => Promise<string>> = {
  
  create_project: async (userId: string, args: { title: string; deadline?: string; type?: string; description?: string }) => {
    const deadlineDate = args.deadline ? new Date(args.deadline) : null;
    
    const { data, error } = await supabase.from('projects').insert({
      user_id: userId,
      title: args.title,
      deadline: deadlineDate?.toISOString() || null,
      specific: args.description || `Created via Alfred: ${args.type || 'General'}`,
      status: 'active',
      progress_percent: 0,
      color: '#8B5CF6',
    }).select().single();

    if (error) return `Error creating project: ${error.message}`;
    return `Project "${data.title}" created successfully. ID: ${data.id}`;
  },

  create_goal: async (userId: string, args: { title: string; total_hours: number; priority?: string; deadline?: string }) => {
    const { data, error } = await supabase.from('goals').insert({
      user_id: userId,
      title: args.title,
      total_hours: args.total_hours || 10,
      hours_completed: 0,
      priority: args.priority || 'medium',
      deadline: args.deadline ? new Date(args.deadline).toISOString() : null,
      status: 'active',
      color: '#8B5CF6',
    }).select().single();

    if (error) return `Error creating goal: ${error.message}`;
    return `Goal "${data.title}" created with ${data.total_hours}h allocated.`;
  },

  schedule_block: async (userId: string, args: { title: string; start_time: string; duration_minutes?: number; description?: string }) => {
    const startTime = new Date(args.start_time);
    const duration = args.duration_minutes || 60;
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const { data, error } = await supabase.from('scheduled_blocks').insert({
      user_id: userId,
      title: args.title,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      notes: args.description || null,
      status: 'scheduled',
    }).select().single();

    if (error) return `Error scheduling: ${error.message}`;
    return `Scheduled "${data.title}" for ${startTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} (${duration} mins).`;
  },

  reschedule_block: async (userId: string, args: { block_id?: string; title?: string; new_time: string }) => {
    // Find the block by ID or title
    let blockId = args.block_id;
    
    if (!blockId && args.title) {
      const { data: blocks } = await supabase
        .from('scheduled_blocks')
        .select('id, title')
        .eq('user_id', userId)
        .ilike('title', `%${args.title}%`)
        .eq('status', 'scheduled')
        .limit(1);
      
      if (blocks && blocks.length > 0) {
        blockId = blocks[0].id;
      }
    }

    if (!blockId) return "Couldn't find that block to reschedule.";

    const newStart = new Date(args.new_time);
    const { error } = await supabase
      .from('scheduled_blocks')
      .update({ 
        start_time: newStart.toISOString(),
        end_time: new Date(newStart.getTime() + 60 * 60 * 1000).toISOString() 
      })
      .eq('id', blockId);

    if (error) return `Error rescheduling: ${error.message}`;
    return `Rescheduled to ${newStart.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`;
  },

  get_schedule: async (userId: string, args: { date: string }) => {
    const startOfDay = new Date(args.date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from('scheduled_blocks')
      .select('title, start_time, end_time, status')
      .eq('user_id', userId)
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time', { ascending: true });

    if (!data || data.length === 0) {
      return `No events scheduled for ${startOfDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.`;
    }

    const formatted = data.map(e => {
      const time = new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `• ${time}: ${e.title}`;
    }).join('\n');

    return `Schedule for ${startOfDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}:\n${formatted}`;
  },

  get_goals: async (userId: string, args: {}) => {
    const { data } = await supabase
      .from('goals')
      .select('title, total_hours, hours_completed, priority, deadline')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true });

    if (!data || data.length === 0) return "No active goals.";

    const formatted = data.map(g => {
      const progress = g.total_hours > 0 ? Math.round((g.hours_completed / g.total_hours) * 100) : 0;
      const emoji = g.priority === 'high' ? '🔴' : g.priority === 'medium' ? '🟡' : '🟢';
      return `${emoji} ${g.title}: ${progress}% (${g.hours_completed}/${g.total_hours}h)`;
    }).join('\n');

    return `Your active goals:\n${formatted}`;
  },

  get_projects: async (userId: string, args: {}) => {
    const { data } = await supabase
      .from('projects')
      .select('title, progress_percent, deadline, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (!data || data.length === 0) return "No active projects.";

    const formatted = data.map(p => {
      const deadline = p.deadline ? new Date(p.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No deadline';
      return `📁 ${p.title}: ${p.progress_percent}% done (due ${deadline})`;
    }).join('\n');

    return `Your active projects:\n${formatted}`;
  },

  log_brain_dump: async (userId: string, args: { content: string; type?: string }) => {
    const { error } = await supabase.from('brain_dump').insert({
      user_id: userId,
      content: args.content,
      type: args.type || 'note',
      source: 'telegram',
    });

    if (error) return `Error saving: ${error.message}`;
    return "Noted! Saved to your brain dump.";
  },

  update_goal_progress: async (userId: string, args: { title: string; hours_to_add: number }) => {
    const { data: goals } = await supabase
      .from('goals')
      .select('id, hours_completed')
      .eq('user_id', userId)
      .ilike('title', `%${args.title}%`)
      .eq('status', 'active')
      .limit(1);

    if (!goals || goals.length === 0) return "Couldn't find that goal.";

    const goal = goals[0];
    const newHours = goal.hours_completed + args.hours_to_add;

    await supabase
      .from('goals')
      .update({ hours_completed: newHours })
      .eq('id', goal.id);

    return `Added ${args.hours_to_add}h to your progress. Total: ${newHours}h logged.`;
  },

  mark_block_complete: async (userId: string, args: { title?: string }) => {
    // Find the most recent/current block
    const now = new Date();
    const { data: blocks } = await supabase
      .from('scheduled_blocks')
      .select('id, title')
      .eq('user_id', userId)
      .eq('status', 'scheduled')
      .lte('start_time', now.toISOString())
      .order('start_time', { ascending: false })
      .limit(1);

    if (!blocks || blocks.length === 0) return "No current block to mark complete.";

    await supabase
      .from('scheduled_blocks')
      .update({ status: 'completed' })
      .eq('id', blocks[0].id);

    return `Marked "${blocks[0].title}" as complete. Nice work! 🎉`;
  },
};

// Tool definitions for Gemini - tells the AI what tools are available
export const TOOL_DEFINITIONS = [
  {
    name: "create_project",
    description: "Create a new project for a big goal like an exam, interview prep, or major assignment.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "The name of the project" },
        deadline: { type: "STRING", description: "ISO date string for deadline (optional)" },
        type: { type: "STRING", description: "Type: Exam, Interview, Work, Personal, etc." },
        description: { type: "STRING", description: "Brief description of the project" }
      },
      required: ["title"]
    }
  },
  {
    name: "create_goal",
    description: "Create a smaller goal that needs time allocation.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "The goal name" },
        total_hours: { type: "NUMBER", description: "Estimated hours needed" },
        priority: { type: "STRING", description: "high, medium, or low" },
        deadline: { type: "STRING", description: "ISO date string (optional)" }
      },
      required: ["title", "total_hours"]
    }
  },
  {
    name: "schedule_block",
    description: "Schedule a specific study block, meeting, or task at a specific time.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "What the block is for" },
        start_time: { type: "STRING", description: "ISO date string for start time" },
        duration_minutes: { type: "NUMBER", description: "Duration in minutes (default 60)" },
        description: { type: "STRING", description: "Notes for the block" }
      },
      required: ["title", "start_time"]
    }
  },
  {
    name: "reschedule_block",
    description: "Move an existing scheduled block to a new time.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Name of the block to find" },
        new_time: { type: "STRING", description: "ISO date string for new start time" }
      },
      required: ["new_time"]
    }
  },
  {
    name: "get_schedule",
    description: "Check the user's calendar for a specific date.",
    parameters: {
      type: "OBJECT",
      properties: {
        date: { type: "STRING", description: "ISO date string for the day to check" }
      },
      required: ["date"]
    }
  },
  {
    name: "get_goals",
    description: "Get a list of the user's active goals and their progress.",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "get_projects",
    description: "Get a list of the user's active projects.",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  },
  {
    name: "log_brain_dump",
    description: "Save a random thought, note, task, or idea for later.",
    parameters: {
      type: "OBJECT",
      properties: {
        content: { type: "STRING", description: "The content to save" },
        type: { type: "STRING", description: "note, task, idea, or reminder" }
      },
      required: ["content"]
    }
  },
  {
    name: "update_goal_progress",
    description: "Log hours worked on a goal.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Goal name to update" },
        hours_to_add: { type: "NUMBER", description: "Hours to add" }
      },
      required: ["title", "hours_to_add"]
    }
  },
  {
    name: "mark_block_complete",
    description: "Mark the current or most recent block as completed.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Block name (optional, uses current if not specified)" }
      }
    }
  }
];
