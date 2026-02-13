import OpenAI from "openai";
import { FORMAT_CLUB_SYSTEM, formatClubUser } from "../prompts/format-club.js";
import { fillPlaceholders } from "../schema.js";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function extractJson(content) {
  const raw = (content || "").trim();
  const block = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const str = block ? block[1].trim() : raw;
  const objMatch = str.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    return JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
}

export async function runFormatAgent(detailBlob, city, country = "") {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: FORMAT_CLUB_SYSTEM },
      { role: "user", content: formatClubUser(detailBlob, city, country) },
    ],
  });
  const content = response.choices?.[0]?.message?.content;
  const parsed = extractJson(content);
  if (!parsed) return null;
  return fillPlaceholders(parsed);
}
