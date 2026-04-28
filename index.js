import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const SPAM_LIMIT = 3;
const TIME_DIFF_MS = 2000;

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

async function banUser(ctx, chatId, userId) {
  try {
    await ctx.telegram.banChatMember(chatId, userId);
  } catch (e) {
    console.error("Ban error:", e.message);
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

  // 🚫 Ссылки — сразу удаляем
  if (hasTelegramChannelLink(text)) {
    await safeDelete(ctx, chatId, msg.message_id);
    return;
  }

  let history = userMessages.get(userKey) || [];

  history.push({
    messageId: msg.message_id,
    time: now
  });

  // держим только последние 5 сообщений
  history = history.slice(-5);
  userMessages.set(userKey, history);

  // 🚨 проверка на быстрый спам
  if (history.length >= SPAM_LIMIT) {
    const last = history.slice(-SPAM_LIMIT);

    const isFastSpam = last.every((m, i, arr) => {
      if (i === 0) return true;
      return (m.time - arr[i - 1].time) < TIME_DIFF_MS;
    });

    if (isFastSpam) {
      console.log("SPAM DETECTED:", user.id);

      // удалить все сообщения пользователя
      for (const m of history) {
        await safeDelete(ctx, chatId, m.messageId);
      }

      // бан пользователя
      await banUser(ctx, chatId, user.id);

      userMessages.delete(userKey);
    }
  }
});

bot.launch();

console.log("Bot with auto-ban started");
