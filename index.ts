import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN not set in .env");
  process.exit(1);
}

const bot = new Bot(token);

interface UserProfile {
  age: number;
  height: number;
  weight: number;
  sex: "male" | "female";
  activity: "low" | "light" | "medium" | "high";
  bmr: number;
  tdee: number;
}

const activityMap: Record<string, number> = {
  low: 1.2,
  light: 1.375,
  medium: 1.55,
  high: 1.725,
};

const activityLabels: Record<string, string> = {
  low: "Мінімальна (сидячий спосіб життя)",
  light: "Легка (1-3 тренування/тиждень)",
  medium: "Помірна (3-5 тренувань/тиждень)",
  high: "Висока (6-7 тренувань/тиждень)",
};

function calculateBMR(weight: number, height: number, age: number, sex: "male" | "female"): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

function calculateTDEE(bmr: number, activity: "low" | "light" | "medium" | "high"): number {
  return Math.round(bmr * activityMap[activity]);
}

const userProfiles = new Map<number, UserProfile>();
const userStates = new Map<number, { step: string; data: Partial<UserProfile> }>();

bot.command("start", (ctx) => {
  ctx.reply(
    "👋 Вітаю! Я бот для підрахунку калорій.\n\n"
      + "Я можу розрахувати твій BMR та TDEE.\n"
      + "Напиши /help щоб побачити список команд."
  );
});

bot.command("help", (ctx) => {
  ctx.reply(
    "📋 Доступні команди:\n\n"
      + "/start — привітання\n"
      + "/help — список команд\n"
      + "/set_profile — заповнити профіль та розрахувати калорії\n"
      + "/my_profile — переглянути свій профіль\n"
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
      + "Формула: Mifflin-St Jeor\n"
      + "Час створення: Травень 2026"
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
  ctx.reply(jokes[Math.floor(Math.random() * jokes.length)]);
});

bot.command("set_profile", (ctx) => {
  const id = ctx.from.id;
  userStates.set(id, { step: "waiting_age", data: {} });
  ctx.reply("Давай створимо твій профіль!\n\n1️⃣ Введіть ваш **вік** (10-100):", { parse_mode: "Markdown" });
});

bot.command("my_profile", (ctx) => {
  const id = ctx.from.id;
  const profile = userProfiles.get(id);
  if (!profile) {
    ctx.reply("У тебе ще немає профілю. Використай /set_profile щоб створити.");
    return;
  }
  ctx.reply(
    "📊 **Твій профіль:**\n\n"
      + `Вік: ${profile.age}\n`
      + `Зріст: ${profile.height} см\n`
      + `Вага: ${profile.weight} кг\n`
      + `Стать: ${profile.sex === "male" ? "Чоловік" : "Жінка"}\n`
      + `Активність: ${activityLabels[profile.activity]}\n\n`
      + `🔥 **BMR:** ${profile.bmr} ккал/день\n`
      + `⚡ **TDEE:** ${profile.tdee} ккал/день`,
    { parse_mode: "Markdown" }
  );
});

bot.on("message:text", (ctx) => {
  const text = ctx.message.text;
  const lower = text.toLowerCase();
  const id = ctx.from.id;

  const state = userStates.get(id);
  if (state) {
    switch (state.step) {
      case "waiting_age": {
        const age = Number(text);
        if (!Number.isInteger(age) || age < 10 || age > 100) {
          ctx.reply("❌ Вік має бути числом від 10 до 100. Спробуй ще раз:");
          return;
        }
        state.data.age = age;
        state.step = "waiting_height";
        ctx.reply("2️⃣ Введіть ваш **зріст** у см (100-250):", { parse_mode: "Markdown" });
        break;
      }
      case "waiting_height": {
        const height = Number(text);
        if (!Number.isFinite(height) || height < 100 || height > 250) {
          ctx.reply("❌ Зріст має бути числом від 100 до 250. Спробуй ще раз:");
          return;
        }
        state.data.height = height;
        state.step = "waiting_weight";
        ctx.reply("3️⃣ Введіть вашу **вагу** у кг (30-300):", { parse_mode: "Markdown" });
        break;
      }
      case "waiting_weight": {
        const weight = Number(text);
        if (!Number.isFinite(weight) || weight < 30 || weight > 300) {
          ctx.reply("❌ Вага має бути числом від 30 до 300. Спробуй ще раз:");
          return;
        }
        state.data.weight = weight;
        state.step = "waiting_sex";
        ctx.reply("4️⃣ Введіть вашу **стать** (male / female):", { parse_mode: "Markdown" });
        break;
      }
      case "waiting_sex": {
        const sex = lower as "male" | "female";
        if (sex !== "male" && sex !== "female") {
          ctx.reply("❌ Введіть `male` або `female`:", { parse_mode: "Markdown" });
          return;
        }
        state.data.sex = sex;
        state.step = "waiting_activity";
        ctx.reply(
          "5️⃣ Введіть ваш **рівень активності**:\n\n"
            + "• `low` — Мінімальна (сидячий спосіб життя)\n"
            + "• `light` — Легка (1-3 тренування/тиждень)\n"
            + "• `medium` — Помірна (3-5 тренувань/тиждень)\n"
            + "• `high` — Висока (6-7 тренувань/тиждень)",
          { parse_mode: "Markdown" }
        );
        break;
      }
      case "waiting_activity": {
        const activity = lower as "low" | "light" | "medium" | "high";
        if (!["low", "light", "medium", "high"].includes(activity)) {
          ctx.reply("❌ Введіть одне з: `low`, `light`, `medium`, `high`:", { parse_mode: "Markdown" });
          return;
        }
        const data = state.data as Required<typeof state.data>;
        const bmr = Math.round(calculateBMR(data.weight, data.height, data.age, data.sex));
        const tdee = calculateTDEE(bmr, activity);

        const profile: UserProfile = {
          age: data.age,
          height: data.height,
          weight: data.weight,
          sex: data.sex,
          activity,
          bmr,
          tdee,
        };
        userProfiles.set(id, profile);
        userStates.delete(id);

        ctx.reply(
          "✅ **Профіль створено!**\n\n"
            + `🔥 **BMR:** ${bmr} ккал/день — базовий обмін речовин\n`
            + `⚡ **TDEE:** ${tdee} ккал/день — денна норма з урахуванням активності\n\n`
            + `Щоб переглянути профіль, напиши /my_profile`,
          { parse_mode: "Markdown" }
        );
        break;
      }
    }
    return;
  }

  if (lower === "привіт" || lower === "hello") {
    const greetings = [
      "Привіт! Як справи? 😊",
      "Hello! Чим можу допомогти?",
      "Вітаю! Напиши /help щоб дізнатись що я вмію.",
      "Привіт-привіт! 🎉",
    ];
    ctx.reply(greetings[Math.floor(Math.random() * greetings.length)]);
    return;
  }

  if (lower === "help") {
    ctx.reply("Спробуй команду /help (зі слешем) 😉");
    return;
  }

  ctx.reply(`Я отримав твоє повідомлення: ${text}`);
});

console.log("Бот запущено...");
bot.start();
