import OpenAI from "openai";
import {
  CLUB_DETAILS_SYSTEM,
  clubDetailsUser,
  DETAIL_TOOLS,
} from "../prompts/club-details.js";
import { webSearch } from "../tools/search.js";
import { fetchPage } from "../tools/fetch.js";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function runTool(name, args) {
  if (name === "web_search") return await webSearch(args.query);
  if (name === "fetch_page") return await fetchPage(args.url);
  throw new Error(`Unknown tool: ${name}`);
}

export async function runDetailAgent(clubName, url, city, country = "") {
  const messages = [
    { role: "system", content: CLUB_DETAILS_SYSTEM },
    { role: "user", content: clubDetailsUser(clubName, url, city, country) },
  ];
  const maxRounds = 12;
  for (let round = 0; round < maxRounds; round++) {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages,
      tools: DETAIL_TOOLS,
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
      return (msg.content || "").trim();
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
  const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
  return (lastAssistant?.content || "").trim();
}
