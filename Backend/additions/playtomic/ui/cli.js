const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_W = 20;
const CLEAR = "\x1b[K";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let spinnerIx = 0;
let lastLines = 0;

function spin() {
  const c = SPINNER[spinnerIx % SPINNER.length];
  spinnerIx += 1;
  return c;
}

function progressBar(n, total) {
  if (total <= 0) return "░".repeat(BAR_W);
  const filled = Math.round((BAR_W * n) / total);
  return "█".repeat(filled) + "░".repeat(BAR_W - filled);
}

function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

export function startLive() {
  spinnerIx = 0;
  lastLines = 0;
}

export function stopLive() {
  if (lastLines > 0 && process.stdout.isTTY) {
    process.stdout.write("\x1b[" + lastLines + "A");
    for (let i = 0; i < lastLines; i++) process.stdout.write("\r" + CLEAR + (i < lastLines - 1 ? "\n" : ""));
  }
  lastLines = 0;
}

export function render(state, stats) {
  const { phase, phaseLabel, current, total, clubName, error } = state;
  const sp = spin();
  const phaseStr =
    phase === "list"
      ? "Finding clubs"
      : phase === "detail"
        ? `Detail: ${(clubName || "").slice(0, 28)}${(clubName || "").length > 28 ? "…" : ""}`
        : phase === "format"
          ? "Formatting"
          : phaseLabel || "—";
  const line1 = ` ${CYAN}${sp}${RESET} ${BOLD}${phaseStr}${RESET}`;
  const n = Math.max(0, current);
  const t = Math.max(0, total);
  const bar = t > 0 ? progressBar(n, t) : "░".repeat(BAR_W);
  const prog = t > 0 ? `${n}/${t} clubs` : "—";
  const line2 = `   ${GREEN}[${bar}]${RESET} ${DIM}${prog}${RESET}`;
  const tv = `Tavily: ${stats.tavilySearches} search, ${stats.tavilyExtracts} extract, ${YELLOW}${stats.tavilyCredits} cr${RESET}`;
  const oa = `OpenAI: ${stats.openaiCalls} calls, ${fmtNum(stats.promptTokens)} in, ${fmtNum(stats.completionTokens)} out`;
  const line3 = `   ${DIM}${tv}  |  ${oa}${RESET}`;
  const lines = [line1, line2, line3];
  if (error) lines.push(`   ${BOLD}\u2716${RESET} ${error}`);

  if (!process.stdout.isTTY) {
    if (lastLines === 0) process.stdout.write(lines.join("\n") + "\n");
    lastLines = lines.length;
    return;
  }

  if (lastLines > 0) process.stdout.write("\x1b[" + lastLines + "A");
  for (const s of lines) process.stdout.write("\r" + CLEAR + s + "\n");
  lastLines = lines.length;
}

export function renderFinal(filePath, count, stats) {
  stopLive();
  const s = stats;
  process.stdout.write(
    `${GREEN}\u2713${RESET} ${BOLD}Done${RESET}  ${count} clubs → ${filePath}\n` +
      `   Tavily: ${s.tavilySearches} searches, ${s.tavilyExtracts} extracts, ${s.tavilyCredits} credits\n` +
      `   OpenAI: ${s.openaiCalls} calls, ${fmtNum(s.promptTokens)} prompt + ${fmtNum(s.completionTokens)} completion tokens\n`
  );
}
