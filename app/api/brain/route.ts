import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Need service role for server-side
);

interface BrainInput {
  message: string;
  source: 'web' | 'sms' | 'mms';
  userId?: string;
  phoneNumber?: string;
  imageUrl?: string;
  calendarEvents?: any[];
  goals?: any[];
}

// Classify the incoming message
async function classifyMessage(message: string, imageUrl?: string): Promise<{
  type: 'command' | 'chat' | 'task' | 'brain_dump' | 'question';
  extracted?: any;
}> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  let prompt = `Classify this message into one of these categories:
- "command": User wants to do something (schedule, remove, show calendar)
- "task": This is a task/todo to remember (e.g., "email TA", "buy groceries")  
- "brain_dump": Random thought, note, or idea to capture
- "question": User is asking about their schedule, goals, or for advice
- "chat": General conversation

Message: "${message}"

Respond with JSON only:
{
  "type": "command|task|brain_dump|question|chat",
  "taskTitle": "extracted task if type is task",
  "intent": "what they want if command"
}`;

  // If there's an image, use vision to extract text
  if (imageUrl) {
    prompt = `This message came with an image. The user is likely sharing a photo of homework, whiteboard, or document.
    
Message: "${message || 'No text, just image'}"

Classify and extract any tasks or information from context.

Respond with JSON:
{
  "type": "task|brain_dump",
  "extractedText": "what you see in the image context",
  "tasks": ["task 1", "task 2"]
}`;
  }

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(text);
  } catch (e) {
    return { type: 'chat' };
  }
}

// Get user context for the brain
async function getUserContext(userId: string) {
  // Get goals
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Get recent brain dumps
  const { data: brainDumps } = await supabase
    .from('brain_dump')
    .select('*')
    .eq('user_id', userId)
    .eq('processed', false)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  return { goals: goals || [], brainDumps: brainDumps || [], preferences: prefs };
}

// The main brain function
async function processBrain(input: BrainInput): Promise<string> {
  const { message, source, userId, phoneNumber, imageUrl, calendarEvents, goals } = input;
  
  // Classify the message
  const classification = await classifyMessage(message, imageUrl);
  
  // Handle based on type
  if (classification.type === 'task' || classification.type === 'brain_dump') {
    // Save to brain dump
    if (userId) {
      await supabase.from('brain_dump').insert({
        user_id: userId,
        content: classification.extracted?.taskTitle || message,
        type: classification.type === 'task' ? 'task' : 'note',
        source,
        image_url: imageUrl,
      });
    }
    
    const responses = [
      "Got it. Filed away. Get back to what you were doing! 📝",
      "Captured! Your brain is now free. 🧠✨",
      "Noted! I'll remind you about this later.",
      "Brain dump received. Focus mode: ON 💪",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (classification.type === 'command') {
    // Handle commands - schedule, show calendar, etc.
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const context = userId ? await getUserContext(userId) : null;
    
    const prompt = `You are GoalPilot, a friendly SMS assistant. The user sent a command.

USER CONTEXT:
- Active Goals: ${JSON.stringify(context?.goals || goals || [])}
- Recent Brain Dumps: ${JSON.stringify(context?.brainDumps || [])}
- Calendar Events: ${JSON.stringify(calendarEvents?.slice(0, 5) || [])}

USER MESSAGE: "${message}"
INTENT: ${classification.extracted?.intent || 'unknown'}

Respond helpfully and concisely (SMS length - under 160 chars if possible). If they want to schedule something, confirm what and when.`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  if (classification.type === 'question') {
    const context = userId ? await getUserContext(userId) : null;
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `You are GoalPilot SMS assistant. Answer this question based on user's data.

USER'S GOALS: ${JSON.stringify(context?.goals || goals || [])}
USER'S TASKS: ${JSON.stringify(context?.brainDumps || [])}
CALENDAR: ${JSON.stringify(calendarEvents?.slice(0, 5) || [])}

QUESTION: "${message}"

Be helpful, concise, encouraging. Keep response SMS-friendly (under 300 chars).`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  // Default: chat
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `You are GoalPilot, a friendly productivity buddy via SMS. Be casual, warm, brief.

User says: "${message}"

Respond naturally (under 200 chars for SMS).`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Send SMS via Twilio
async function sendSMS(to: string, body: string) {
  try {
    await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    return true;
  } catch (error) {
    console.error('SMS send error:', error);
    return false;
  }
}

// API Route Handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, source, userId, phoneNumber, imageUrl, calendarEvents, goals } = body;

    const response = await processBrain({
      message,
      source: source || 'web',
      userId,
      phoneNumber,
      imageUrl,
      calendarEvents,
      goals,
    });

    // If this came from web, just return the response
    if (source === 'web') {
      return NextResponse.json({ success: true, message: response });
    }

    // If SMS, send response back
    if (source === 'sms' && phoneNumber) {
      await sendSMS(phoneNumber, response);
      
      // Log the conversation
      if (userId) {
        await supabase.from('sms_messages').insert([
          { user_id: userId, phone_number: phoneNumber, direction: 'inbound', content: message },
          { user_id: userId, phone_number: phoneNumber, direction: 'outbound', content: response },
        ]);
        
        // Update last interaction
        await supabase
          .from('user_preferences')
          .update({ last_interaction: new Date().toISOString(), unresponsive_count: 0 })
          .eq('user_id', userId);
      }
    }

    return NextResponse.json({ success: true, message: response });
  } catch (error) {
    console.error('Brain error:', error);
    return NextResponse.json({ error: 'Brain malfunction' }, { status: 500 });
  }
}
