import { FORMAT_CLUB_SYSTEM, formatClubUser } from "../prompts/format-club.js";
import { fillPlaceholders } from "../schema.js";
import { createChatCompletion } from "../lib/openaiRateLimit.js";

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

export async function runFormatAgent(detailBlob, city, country = "", options = {}) {
  const stats = options.stats ?? null;
  const response = await createChatCompletion(
    {
      model: "gpt-5.2",
      messages: [
        { role: "system", content: FORMAT_CLUB_SYSTEM },
        { role: "user", content: formatClubUser(detailBlob, city, country) },
      ],
    },
    stats
  );
  const content = response.choices?.[0]?.message?.content;
  const parsed = extractJson(content);
  if (!parsed) return null;
  return fillPlaceholders(parsed);
}
