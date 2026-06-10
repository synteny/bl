const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GAME_URL = process.env.GAME_URL;
const GAME_SHORT_NAME = process.env.GAME_SHORT_NAME || 'my_platformer';

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    if (body.message && body.message.text === '/start') {
      await sendGameMessage(body.message.chat.id);
      return { statusCode: 200, body: 'OK' };
    }

    if (body.callback_query && body.callback_query.game_short_name === GAME_SHORT_NAME) {
      await answerCallbackQuery(body.callback_query.id, GAME_URL);
      return { statusCode: 200, body: 'OK' };
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};

async function sendGameMessage(chatId) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendGame`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, game_short_name: GAME_SHORT_NAME })
  });
}

async function answerCallbackQuery(callbackQueryId, gameUrl) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, url: gameUrl })
  });
}