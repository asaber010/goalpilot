const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_USER_ID = process.env.TELEGRAM_USER_ID;

export async function sendTelegramMessage(
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown',
  chatId?: string
) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId || DEFAULT_USER_ID,
        text: text,
        parse_mode: parseMode,
      }),
    });
    return response.json();
  } catch (error) {
    console.error('Telegram Error:', error);
    return null;
  }
}

export async function sendTelegramPhoto(
  photoUrl: string,
  caption?: string,
  chatId?: string
) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId || DEFAULT_USER_ID,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'Markdown',
      }),
    });
    return response.json();
  } catch (error) {
    console.error('Telegram Photo Error:', error);
    return null;
  }
}

export async function getFileUrl(fileId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const data = await response.json();
    if (data.ok && data.result.file_path) {
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
    }
    return null;
  } catch (error) {
    console.error('Get file error:', error);
    return null;
  }
}
