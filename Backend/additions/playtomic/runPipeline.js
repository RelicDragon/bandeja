import { runListAgent } from "./agents/listAgent.js";
import { runDetailAgent } from "./agents/detailAgent.js";
import { runFormatAgent } from "./agents/formatAgent.js";
import { slugify } from "./schema.js";
import fs from "fs";
import path from "path";

const DELAY_MS = 2000;

function mergeListItems(items) {
  const byKey = new Map();
  for (const it of items) {
    const name = (it.name || "").trim();
    if (!name) continue;
    const key = slugify(name);
    const existing = byKey.get(key);
    if (!existing || (!existing.url && it.url)) byKey.set(key, { name, url: it.url || "" });
  }
  return [...byKey.values()];
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function noop() {}

function ensureDefaults(club) {
  const c = { ...club };
  if (!c.address) c.address = {};
  if (!c.resources?.length) c.resources = [{ name: "Padel 1", sport: "PADEL", features: ["outdoor", "double", "wall"] }];
  if (!c.resources.every((r) => r.resourceId)) {
    c.resources = c.resources.map((r, i) => ({
      ...r,
      resourceId: r.resourceId && !String(r.resourceId).startsWith("PLACEHOLDER") ? r.resourceId : crypto.randomUUID(),
    }));
  }
  if (!c.sport_ids?.length) c.sport_ids = ["PADEL"];
  if (!c.properties) c.properties = {};
  const props = [
    "CONTACT_PHONE", "FACILITY_CHANGEROOM", "FACILITY_FREE_PARKING", "FACILITY_PRIVATE_PARKING",
    "FACILITY_CAFETERIA", "FACILITY_WIFI", "FACILITY_LOCKERS", "FACILITY_DISABLED_ACCESS", "SPORT_PADEL",
  ];
  for (const p of props) {
    if (c.properties[p] === undefined) c.properties[p] = p === "CONTACT_PHONE" ? "" : "false";
  }
  if (!c.opening_hours) {
    const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "HOLIDAYS"];
    c.opening_hours = Object.fromEntries(days.map((d) => [d, { opening_time: "08:00", closing_time: "22:00" }]));
  }
  if (!c.images) c.images = [];
  if (!c.communications_language) c.communications_language = "en_US";
  return c;
}

export async function runPipeline(city, country = "", options = {}) {
  const outDir = options.outDir ?? path.join(process.cwd(), "jsons");
  const maxClubs = options.maxClubs ?? 0;
  const stats = options.stats ?? null;
  const onPhase = options.onPhase ?? noop;
  const onProgress = options.onProgress ?? noop;
  const onError = options.onError ?? noop;
  const clubs = [];
  onPhase("list", { current: 0, total: 0, clubName: "" });
  const expandSeeds = options.expandListSeeds ?? null;
  let list = await runListAgent(city, country, { stats });
  if (Array.isArray(expandSeeds) && expandSeeds.length > 0) {
    for (const hint of expandSeeds) {
      const extra = await runListAgent(city, country, { stats, listHint: hint });
      list = mergeListItems([...list, ...extra]);
    }
  }
  const toProcess = maxClubs > 0 ? list.slice(0, maxClubs) : list;
  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    const name = (item.name || "").trim();
    if (!name) continue;
    const current = i + 1;
    const total = toProcess.length;
    onPhase("detail", { current, total, clubName: name });
    onProgress(current, total, name);
    try {
      const detailBlob = await runDetailAgent(name, item.url || "", city, country, { stats });
      await delay(DELAY_MS);
      onPhase("format", { current, total, clubName: name });
      const formatted = await runFormatAgent(detailBlob, city, country, { stats });
      await delay(DELAY_MS);
      if (formatted) clubs.push(ensureDefaults(formatted));
    } catch (err) {
      onError(name, err);
    }
  }
  const citySlug = slugify(city);
  const filename = country ? `${citySlug}-${slugify(country)}-clubs.json` : `${citySlug}-clubs.json`;
  const filePath = path.join(outDir, filename);
  await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(clubs, null, 2), "utf-8");
  return { filePath, clubs, count: clubs.length, stats };
}
