import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const SPAM_LIMIT = Number(process.env.SPAM_LIMIT || 3);
const WINDOW_MS = Number(process.env.WINDOW_MS || 60000);

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is required");
}

const bot = new Telegraf(BOT_TOKEN);

const userMessages = new Map();

function hasTelegramChannelLink(text = "") {
  const patterns = [
    /https?:\/\/t\.me\/[a-zA-Z0-9_+/.-]+/i,
    /(?:^|\s)t\.me\/[a-zA-Z0-9_+/.-]+/i,
    /(?:^|\s)@[a-zA-Z0-9_]{5,}/i,
    /tg:\/\/resolve\?domain=[a-zA-Z0-9_]+/i
  ];

  return patterns.some((regex) => regex.test(text));
}

function getMessageText(message) {
  return [
    message.text,
    message.caption
  ].filter(Boolean).join("\n");
}

async function safeDelete(ctx, chatId, messageId) {
  try {
    await ctx.telegram.deleteMessage(chatId, messageId);
  } catch (error) {
    console.error("Delete error:", error.message);
  }
}

bot.on("message", async (ctx) => {
  const msg = ctx.message;
  const chatId = msg.chat.id;
  const user = msg.from;

  if (!user || user.is_bot) return;

  const userKey = `${chatId}:${user.id}`;
  const now = Date.now();
  const text = getMessageText(msg);

  if (hasTelegramChannelLink(text)) {
    await safeDelete(ctx, chatId, msg.message_id);
    return;
  }

  const recent = (userMessages.get(userKey) || [])
    .filter((item) => now - item.time <= WINDOW_MS);

  recent.push({
    messageId: msg.message_id,
    time: now
  });

  userMessages.set(userKey, recent);

  if (recent.length >= SPAM_LIMIT) {
    for (const item of recent) {
      await safeDelete(ctx, chatId, item.messageId);
    }
    userMessages.set(userKey, []);
  }
});

bot.launch();

console.log("Bot started");
