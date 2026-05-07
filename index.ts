import { Bot } from "grammy";
import { Database } from "bun:sqlite";
import { GoogleGenAI } from "@google/genai";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN not set in .env");
  process.exit(1);
}

const geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey) {
  console.error("GEMINI_API_KEY not set in .env");
  process.exit(1);
}

const db = new Database("bot.db", { create: true });
const ai = new GoogleGenAI({ apiKey: geminiKey });
const bot = new Bot(token);

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    age INTEGER NOT NULL,
    weight REAL NOT NULL,
    height REAL NOT NULL,
    sex TEXT NOT NULL,
    activity_level TEXT NOT NULL,
    bmr INTEGER NOT NULL,
    tdee INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    calories_estimated REAL DEFAULT 0,
    json_data TEXT,
    notes TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
  )
`);

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

function getUser(telegramId: number) {
  return db.query("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as {
    telegram_id: number;
    age: number;
    weight: number;
    height: number;
    sex: string;
    activity_level: string;
    bmr: number;
    tdee: number;
  } | undefined;
}

function saveUser(telegramId: number, age: number, weight: number, height: number, sex: string, activity: string, bmr: number, tdee: number) {
  db.run(
    `INSERT OR REPLACE INTO users (telegram_id, age, weight, height, sex, activity_level, bmr, tdee) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [telegramId, age, weight, height, sex, activity, bmr, tdee]
  );
}

function saveMeal(userId: number, rawText: string, calories: number, jsonData: string | null, notes: string | null) {
  db.run(
    `INSERT INTO meals (user_id, raw_text, calories_estimated, json_data, notes, timestamp) VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [userId, rawText, calories, jsonData, notes]
  );
}

function getTodayMeals(userId: number) {
  return db.query(
    `SELECT * FROM meals WHERE user_id = ? AND date(timestamp) = date('now') ORDER BY timestamp ASC`
  ).all(userId) as {
    id: number;
    user_id: number;
    raw_text: string;
    calories_estimated: number;
    json_data: string | null;
    notes: string | null;
    timestamp: string;
  }[];
}

async function estimateCalories(mealText: string): Promise<{
  items: { name: string; grams: number; calories: number }[];
  total_calories: number;
  confidence: number;
} | null> {
  const prompt = `Analyze this meal description and estimate calories. Return ONLY valid JSON (no markdown, no extra text) in this exact format:
{
  "items": [
    { "name": "product name", "grams": 100, "calories": 155 }
  ],
  "total_calories": 235,
  "confidence": 0.82
}
Break down into individual items, estimate grams and calories for each. Total calories should sum all items. Confidence is 0-1.

Meal: "${mealText}"`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const text = response.text?.trim() || "";
    const json = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, ""));

    if (!Array.isArray(json.items) || typeof json.total_calories !== "number" || typeof json.confidence !== "number") {
      return null;
    }

    return json;
  } catch {
    return null;
  }
}

const userStates = new Map<number, { step: string; data: Record<string, unknown> }>();

bot.command("start", (ctx) => {
  ctx.reply(
    "👋 Вітаю! Я бот для підрахунку калорій.\n\n"
      + "Я можу розрахувати твій BMR та TDEE, «оцінювати калорії з їжі за допомогою AI.\n"
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
      + "/add_meal — додати прийом їжі\n"
      + "/today — подивитись що з'їли сьогодні\n"
      + "/info — інформація про бота"
  );
});

bot.command("info", (ctx) => {
  ctx.reply(
    "ℹ️ Про бота:\n\n"
      + "Мова: TypeScript\n"
      + "Бібліотека: grammY\n"
      + "Рантайм: Bun\n"
      + "База даних: SQLite\n"
      + "AI: Gemini 2.0 Flash\n"
      + "Формула: Mifflin-St Jeor\n"
      + "Час створення: Травень 2026"
  );
});

bot.command("set_profile", (ctx) => {
  const id = ctx.from.id;
  userStates.set(id, { step: "waiting_age", data: {} });
  ctx.reply("Давай створимо твій профіль!\n\n1️⃣ Введіть ваш вік (10-100):");
});

bot.command("my_profile", (ctx) => {
  const id = ctx.from.id;
  const user = getUser(id);
  if (!user) {
    ctx.reply("У тебе ще немає профілю. Використай /set_profile щоб створити.");
    return;
  }
  ctx.reply(
    `📊 Твій профіль:\n\n`
      + `Вік: ${user.age}\n`
      + `Зріст: ${user.height} см\n`
      + `Вага: ${user.weight} кг\n`
      + `Стать: ${user.sex === "male" ? "Чоловік" : "Жінка"}\n`
      + `Активність: ${activityLabels[user.activity_level]}\n\n`
      + `🔥 BMR: ${user.bmr} ккал/день\n`
      + `⚡ TDEE: ${user.tdee} ккал/день`
  );
});

bot.command("add_meal", (ctx) => {
  const id = ctx.from.id;
  const user = getUser(id);
  if (!user) {
    ctx.reply("Спочатку створи профіль через /set_profile.");
    return;
  }
  userStates.set(id, { step: "waiting_meal_text", data: {} });
  ctx.reply("🍽 Що ви їли? Опишіть страви та приблизну кількість.");
});

bot.command("today", (ctx) => {
  const id = ctx.from.id;
  const user = getUser(id);
  if (!user) {
    ctx.reply("Спочатку створи профіль через /set_profile.");
    return;
  }

  const meals = getTodayMeals(id);
  if (meals.length === 0) {
    ctx.reply("Сьогодні ще немає записаних прийомів їжі.");
    return;
  }

  const total = meals.reduce((sum, m) => sum + m.calories_estimated, 0);
  const lines = meals.map((m, i) => {
    const time = m.timestamp.slice(11, 16);
    return `${i + 1}. ${m.raw_text} — ${Math.round(m.calories_estimated)} kcal 🕐 ${time}`;
  });

  ctx.reply(
    `📅 Сьогодні ви з'їли:\n\n${lines.join("\n")}\n\nВсього: ${Math.round(total)} kcal`
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
        ctx.reply("2️⃣ Введіть ваш зріст у см (100-250):");
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
        ctx.reply("3️⃣ Введіть вашу вагу у кг (30-300):");
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
        ctx.reply("4️⃣ Введіть вашу стать (male / female):");
        break;
      }
      case "waiting_sex": {
        const sex = lower;
        if (sex !== "male" && sex !== "female") {
          ctx.reply("❌ Введіть male або female:");
          return;
        }
        state.data.sex = sex;
        state.step = "waiting_activity";
        ctx.reply(
          "5️⃣ Введіть ваш рівень активності:\n\n"
            + "• low — Мінімальна (сидячий спосіб життя)\n"
            + "• light — Легка (1-3 тренування/тиждень)\n"
            + "• medium — Помірна (3-5 тренувань/тиждень)\n"
            + "• high — Висока (6-7 тренувань/тиждень)"
        );
        break;
      }
      case "waiting_activity": {
        const activity = lower;
        if (!["low", "light", "medium", "high"].includes(activity)) {
          ctx.reply("❌ Введіть одне з: low, light, medium, high:");
          return;
        }
        const data = state.data as { age: number; height: number; weight: number; sex: "male" | "female" };
        const bmr = Math.round(calculateBMR(data.weight, data.height, data.age, data.sex));
        const tdee = calculateTDEE(bmr, activity as "low" | "light" | "medium" | "high");

        saveUser(id, data.age, data.weight, data.height, data.sex, activity, bmr, tdee);
        userStates.delete(id);

        ctx.reply(
          `✅ Профіль створено!\n\n`
            + `🔥 BMR: ${bmr} ккал/день — базовий обмін речовин\n`
            + `⚡ TDEE: ${tdee} ккал/день — денна норма з урахуванням активності\n\n`
            + `Щоб переглянути профіль, напиши /my_profile\n`
            + `Щоб додати їжу, напиши /add_meal`
        );
        break;
      }
      case "waiting_meal_text": {
        userStates.delete(id);

        ctx.reply("⏳ Аналізую їжу...");

        estimateCalories(text).then((result) => {
          if (!result) {
            saveMeal(id, text, 0, null, null);
            ctx.reply(
              `✅ Прийом їжі збережено.\n`
              + `Не вдалося проаналізувати їжу. Спробуйте описати простіше.`
            );
            return;
          }

          saveMeal(id, text, result.total_calories, JSON.stringify(result), null);

          const items = result.items.map(
            (i) => `• ${i.name} — ${Math.round(i.calories)} kcal (${i.grams}g)`
          ).join("\n");

          ctx.reply(
            `🍽 Знайдено:\n\n${items}\n\n`
              + `Всього: ${Math.round(result.total_calories)} kcal\n`
              + `Confidence: ${result.confidence}\n\n`
              + `Примітка: це орієнтовна оцінка калорій.`
          );
        });
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
