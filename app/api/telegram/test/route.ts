import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage } from '../../../../lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const { chatId } = await req.json();
    
    // Send test message
    await sendTelegramMessage(
      `✅ *Connection successful!*\n\nI'm Alfred, your GoalPilot assistant. I'm now linked and ready to help you manage your productivity.\n\nTry saying:\n• "What's on my schedule today?"\n• "Create a project for my exam"\n• "I'm feeling overwhelmed"`
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Test message failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to send test message' }, { status: 500 });
  }
}
