import OpenAI from "openai";
import { LIST_CLUBS_SYSTEM, listClubsUser, LIST_TOOLS } from "../prompts/list-clubs.js";
import { webSearch } from "../tools/search.js";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function runTool(name, args) {
  if (name === "web_search") return await webSearch(args.query);
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

export async function runListAgent(city, country = "") {
  const messages = [
    { role: "system", content: LIST_CLUBS_SYSTEM },
    { role: "user", content: listClubsUser(city, country) },
  ];
  const maxRounds = 8;
  for (let round = 0; round < maxRounds; round++) {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: LIST_TOOLS,
      tool_choice: "auto",
    });
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
      const result = await runTool(name, args);
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
