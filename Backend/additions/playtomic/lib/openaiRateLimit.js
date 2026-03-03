import OpenAI from "openai";
import { addOpenAIUsage } from "../ui/stats.js";

const WINDOW_MS = 60_000;
const MAX_RPM = 250;
const MAX_TPM = 250_000;
const RETRY_AFTER_429_MS = 20_000;

const events = [];
let client = null;

const PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();
const IS_DEEPSEEK = PROVIDER === "deepseek";

function getClient() {
  if (!client) {
    if (IS_DEEPSEEK) {
      const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
      client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
    } else {
      client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }
  return client;
}

function getDefaultModel() {
  if (IS_DEEPSEEK) return process.env.DEEPSEEK_MODEL || "deepseek-chat";
  return process.env.OPENAI_MODEL || "gpt-5.2";
}

function prune(now = Date.now()) {
  const cutoff = now - WINDOW_MS;
  while (events.length && events[0].time < cutoff) events.shift();
}

function countInWindow() {
  const now = Date.now();
  prune(now);
  const requests = events.length;
  const tokens = events.reduce((s, e) => s + e.tokens, 0);
  return { requests, tokens };
}

function waitUntilUnderLimit() {
  return new Promise((resolve) => {
    function check() {
      const now = Date.now();
      prune(now);
      const { requests, tokens } = countInWindow();
      if (requests < MAX_RPM && tokens < MAX_TPM) {
        resolve();
        return;
      }
      const oldest = events[0];
      const waitMs = oldest ? WINDOW_MS - (now - oldest.time) + 50 : 1000;
      setTimeout(check, Math.min(waitMs, 5000));
    }
    check();
  });
}

function recordUsage(usage) {
  const tokens = usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
  events.push({ time: Date.now(), tokens });
}

const OPENAI_MODEL_ALIASES = new Set(["gpt-5.2", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"]);

export async function createChatCompletion(body, stats = null) {
  const openai = getClient();
  let model = body.model || getDefaultModel();
  if (IS_DEEPSEEK && OPENAI_MODEL_ALIASES.has(model)) model = getDefaultModel();
  const req = { ...body, model };
  for (;;) {
    await waitUntilUnderLimit();
    try {
      const response = await openai.chat.completions.create(req);
      recordUsage(response.usage);
      if (stats) addOpenAIUsage(stats, response.usage);
      return response;
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const isRateLimit = status === 429 || err?.constructor?.name === "RateLimitError";
      if (isRateLimit) {
        await new Promise((r) => setTimeout(r, RETRY_AFTER_429_MS));
        continue;
      }
      throw err;
    }
  }
}
