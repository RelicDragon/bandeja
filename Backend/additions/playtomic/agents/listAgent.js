import { LIST_CLUBS_SYSTEM, listClubsUser, LIST_TOOLS } from "../prompts/list-clubs.js";
import { webSearch } from "../tools/search.js";
import { createChatCompletion } from "../lib/openaiRateLimit.js";

async function runTool(name, args, stats) {
  if (name === "web_search") return await webSearch(args.query, { stats });
  throw new Error(`Unknown tool: ${name}`);
}

function parseListResponse(content) {
  const raw = content.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const arr = JSON.parse(jsonMatch[0]);
    return Array.isArray(arr)
      ? arr.map((x) => ({ name: x.name || x.title || "", url: x.url || x.link || "" }))
      : [];
  } catch {
    return [];
  }
}

export async function runListAgent(city, country = "", options = {}) {
  const stats = options.stats ?? null;
  const listHint = options.listHint ?? "";
  const messages = [
    { role: "system", content: LIST_CLUBS_SYSTEM },
    { role: "user", content: listClubsUser(city, country, listHint) },
  ];
  const maxRounds = 18;
  for (let round = 0; round < maxRounds; round++) {
    const response = await createChatCompletion(
      {
        model: "gpt-5.2",
        messages,
        tools: LIST_TOOLS,
        tool_choice: "auto",
      },
      stats
    );
    const choice = response.choices?.[0];
    if (!choice) throw new Error("No response from OpenAI");
    const msg = choice.message;
    messages.push({
      role: "assistant",
      content: msg.content || null,
      tool_calls: msg.tool_calls,
    });
    if (!msg.tool_calls?.length) {
      return parseListResponse(msg.content || "[]");
    }
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name;
      const args = JSON.parse(tc.function?.arguments || "{}");
      const result = await runTool(name, args, stats);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }
  const lastContent = messages[messages.length - 2]?.content;
  return parseListResponse(lastContent || "[]");
}
