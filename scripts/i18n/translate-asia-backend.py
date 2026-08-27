#!/usr/bin/env python3
"""Translate Backend EN notification maps into Asia languages and inject into TS files."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parents[2]
TRANS_TS = ROOT / "Backend/src/utils/translations.ts"
SYS_TS = ROOT / "Backend/src/utils/systemMessageTranslations.ts"
OUT_DIR = ROOT / "Backend/scripts/asia-be-translations"

LANGS = {"zh": "zh-CN", "id": "id", "hi": "hi", "th": "th", "ja": "ja"}

GLOSSARY = {
    "zh": [("Padel", "板式网球"), ("padel", "板式网球"), ("Table tennis", "乒乓球"), ("table tennis", "乒乓球")],
    "id": [("Table tennis", "Tenis meja"), ("table tennis", "tenis meja")],
    "hi": [("Padel", "पैडेल"), ("padel", "पैडेल"), ("Table tennis", "टेबल टेनिस"), ("table tennis", "टेबल टेनिस")],
    "th": [("Padel", "ปาเดล"), ("padel", "ปาเดล"), ("Table tennis", "เทเบิลเทนนิส"), ("table tennis", "เทเบิลเทนนิส")],
    "ja": [("Padel", "パデル"), ("padel", "パデル"), ("Table tennis", "卓球"), ("table tennis", "卓球")],
}

INTERP_RE = re.compile(r"\{\{[^}]+\}\}")


def extract_en_map(ts_text: str) -> dict[str, str]:
    m = re.search(r"\n  en: \{([\s\S]*?)\n  \},\n  [a-z]{2}:", ts_text)
    if not m:
        raise SystemExit("en block not found")
    body = m.group(1)
    return Function_return_object(body)


def Function_return_object(body: str) -> dict[str, str]:
    # Use JS-like parse via node for template literals
    import subprocess

    script = (
        "const o={"
        + body
        + "}; process.stdout.write(JSON.stringify(o));"
    )
    r = subprocess.run(["node", "-e", script], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr)
    return json.loads(r.stdout)


def protect(s: str):
    tokens = []

    def stash(m):
        tokens.append(m.group(0))
        return f"⟦{len(tokens)-1}⟧"

    out = INTERP_RE.sub(stash, s)
    for brand in ["Bandeja", "Playtomic", "Telegram", "Americano", "Mexicano", "NTRP", "UTR"]:
        if brand in out:
            tokens.append(brand)
            out = out.replace(brand, f"⟦{len(tokens)-1}⟧")
    return out, tokens


def restore(s: str, tokens):
    for i, tok in enumerate(tokens):
        s = s.replace(f"⟦{i}⟧", tok)
    return s


def translate_map(lang: str, en: dict[str, str]) -> dict[str, str]:
    tr = GoogleTranslator(source="en", target=LANGS[lang])
    out = {}
    for i, (k, v) in enumerate(en.items(), 1):
        prot, toks = protect(v)
        try:
            t = tr.translate(prot)
            time.sleep(0.04)
        except Exception as e:
            print("warn", lang, k, e)
            t = prot
            time.sleep(0.4)
        t = restore(t or prot, toks)
        for a, b in GLOSSARY.get(lang, []):
            t = t.replace(a, b)
        out[k] = t
        if i % 50 == 0:
            print(f"  {lang} {i}/{len(en)}")
    return out


def ts_object(lang: str, mp: dict[str, str]) -> str:
    lines = [f"  {lang}: {{"]
    for k, v in mp.items():
        if "\n" in v or "'" in v:
            lit = json.dumps(v, ensure_ascii=False)
            lines.append(f"    '{k}': {lit},")
        else:
            lines.append(f"    '{k}': '{v}',")
    lines.append("  },")
    return "\n".join(lines)


def inject_translations(ts_path: Path, blocks: dict[str, dict[str, str]]) -> None:
    text = ts_path.read_text(encoding="utf-8")
    # ensure date-fns locales for translations.ts only
    if ts_path.name == "translations.ts":
        if "zhCN" not in text:
            text = text.replace(
                "import { arSA } from 'date-fns/locale/ar-SA';",
                "import { arSA } from 'date-fns/locale/ar-SA';\n"
                "import { zhCN } from 'date-fns/locale/zh-CN';\n"
                "import { id } from 'date-fns/locale/id';\n"
                "import { hi } from 'date-fns/locale/hi';\n"
                "import { th } from 'date-fns/locale/th';\n"
                "import { ja } from 'date-fns/locale/ja';",
            )
            text = text.replace(
                "  ar: arSA,\n};",
                "  ar: arSA,\n  zh: zhCN,\n  id: id,\n  hi: hi,\n  th: th,\n  ja: ja,\n};",
            )
    # remove existing asia blocks if re-run
    for lang in LANGS:
        text = re.sub(rf"\n  {lang}: \{{[\s\S]*?\n  \}},", "\n", text)
    insert = "\n".join(ts_object(lang, mp) for lang, mp in blocks.items())
    # insert before closing of translations object — find last `};\n\n` after ar block end
    # Append before final `};` of the translations const — locate `const translations` end by last language
    idx = text.rfind("\n};\n\n")
    if idx < 0:
        idx = text.rfind("\n};")
    text = text[:idx] + "\n" + insert + text[idx:]
    ts_path.write_text(text, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    en = extract_en_map(TRANS_TS.read_text(encoding="utf-8"))
    print("en keys", len(en))
    blocks = {}
    for lang in LANGS:
        print("translating", lang)
        blocks[lang] = translate_map(lang, en)
        (OUT_DIR / f"{lang}.json").write_text(
            json.dumps(blocks[lang], ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    inject_translations(TRANS_TS, blocks)

    # system messages — extract first en-like structure may differ; translate flat string maps if present
    sys_text = SYS_TS.read_text(encoding="utf-8")
    # Find objects like en: { 'key': '...' }
    en_sys = None
    try:
        en_sys = extract_en_map(sys_text)
    except SystemExit:
        print("skip systemMessageTranslations structured inject")
        return
    sys_blocks = {}
    for lang in LANGS:
        print("sys translating", lang)
        sys_blocks[lang] = translate_map(lang, en_sys)
    inject_translations(SYS_TS, sys_blocks)
    print("done")


if __name__ == "__main__":
    main()
