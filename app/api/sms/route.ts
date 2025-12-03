import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Parse Twilio webhook data
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;
    const numMedia = parseInt(formData.get('NumMedia') as string || '0');
    
    // Check for MMS images
    let imageUrl: string | undefined;
    if (numMedia > 0) {
      imageUrl = formData.get('MediaUrl0') as string;
    }

    console.log('Incoming SMS:', { from, body, imageUrl });

    // Find user by phone number
    const { data: userPref } = await supabase
      .from('user_preferences')
      .select('user_id')
      .eq('phone_number', from)
      .single();

    // Process through the brain
    const brainResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/brain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: body,
        source: imageUrl ? 'mms' : 'sms',
        userId: userPref?.user_id,
        phoneNumber: from,
        imageUrl,
      }),
    });

    const data = await brainResponse.json();

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${data.message || "Got it! 👍"}</Message>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('SMS webhook error:', error);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Oops, brain hiccup! Try again in a sec.</Message>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
