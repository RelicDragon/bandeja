import {
  CLUB_DETAILS_SYSTEM,
  clubDetailsUser,
  DETAIL_TOOLS,
} from "../prompts/club-details.js";
import { webSearch } from "../tools/search.js";
import { fetchPage } from "../tools/fetch.js";
import { createChatCompletion } from "../lib/openaiRateLimit.js";

async function runTool(name, args, stats) {
  if (name === "web_search") return await webSearch(args.query, { stats });
  if (name === "fetch_page") return await fetchPage(args.url, { stats });
  throw new Error(`Unknown tool: ${name}`);
}

export async function runDetailAgent(clubName, url, city, country = "", options = {}) {
  const stats = options.stats ?? null;
  const messages = [
    { role: "system", content: CLUB_DETAILS_SYSTEM },
    { role: "user", content: clubDetailsUser(clubName, url, city, country) },
  ];
  const maxRounds = 12;
  for (let round = 0; round < maxRounds; round++) {
    const response = await createChatCompletion(
      {
        model: "gpt-5.2",
        messages,
        tools: DETAIL_TOOLS,
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
      return (msg.content || "").trim();
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
  const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
  return (lastAssistant?.content || "").trim();
}
