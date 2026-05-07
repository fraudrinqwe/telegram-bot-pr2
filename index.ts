import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN not set in .env");
  process.exit(1);
}

const bot = new Bot(token);

bot.command("start", (ctx) => {
  ctx.reply(
    "👋 Вітаю! Я простий Telegram-бот.\n\n"
      + "Я можу відповідати на команди та повідомлення.\n"
      + "Напиши /help щоб побачити список команд."
  );
});

bot.command("help", (ctx) => {
  ctx.reply(
    "📋 Доступні команди:\n\n"
      + "/start — привітання\n"
      + "/help — список команд\n"
      + "/info — інформація про бота\n"
      + "/joke — випадковий жарт\n\n"
      + "А ще я реагую на \"привіт\" та \"hello\" 😊"
  );
});

bot.command("info", (ctx) => {
  ctx.reply(
    "ℹ️ Про бота:\n\n"
      + "Мова: TypeScript\n"
      + "Бібліотека: grammY\n"
      + "Рантайм: Bun\n"
      + "Час створення: Травень 2026\n\n"
      + "Просто надішли мені будь-яке повідомлення!"
  );
});

bot.command("joke", (ctx) => {
  const jokes = [
    "Чому програмісти не люблять природу? — Там забагато багів.",
    "Як називається єдиноріг без інтернету? — Немає мережі.",
    "Скільки програмістів потрібно, щоб вкрутити лампочку? — Жодного, це hardware проблема.",
    "404: Жарт не знайдено.",
    "Чому Java-розробники носять окуляри? — Бо не бачать C#.",
  ];
  const joke = jokes[Math.floor(Math.random() * jokes.length)];
  ctx.reply(joke);
});

bot.on("message:text", (ctx) => {
  const text = ctx.message.text.toLowerCase();

  if (text === "привіт" || text === "hello") {
    const greetings = [
      "Привіт! Як справи? 😊",
      "Hello! Чим можу допомогти?",
      "Вітаю! Напиши /help щоб дізнатись що я вмію.",
      "Привіт-привіт! 🎉",
    ];
    ctx.reply(greetings[Math.floor(Math.random() * greetings.length)]);
    return;
  }

  if (text === "help") {
    ctx.reply("Спробуй команду /help (зі слешем) 😉");
    return;
  }

  ctx.reply(`Я отримав твоє повідомлення: ${ctx.message.text}`);
});

console.log("Бот запущено...");
bot.start();
