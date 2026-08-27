#!/usr/bin/env python3
"""Translate en locale JSON packs into Asia UI languages with glossary locks."""
from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parents[2]
EN_DIR = ROOT / "Frontend/src/i18n/locales/en"

# Google target codes
LANGS = {
    "zh": "zh-CN",
    "id": "id",
    "hi": "hi",
    "th": "th",
    "ja": "ja",
}

# Applied after machine translation (and as protect tokens)
GLOSSARY = {
    "zh": {
        "Padel": "板式网球",
        "padel": "板式网球",
        "Table tennis": "乒乓球",
        "table tennis": "乒乓球",
        "Table Tennis": "乒乓球",
    },
    "id": {
        "Table tennis": "Tenis meja",
        "table tennis": "tenis meja",
        "Table Tennis": "Tenis meja",
    },
    "hi": {
        "Padel": "पैडेल",
        "padel": "पैडेल",
        "Table tennis": "टेबल टेनिस",
        "table tennis": "टेबल टेनिस",
        "Table Tennis": "टेबल टेनिस",
    },
    "th": {
        "Padel": "ปาเดล",
        "padel": "ปาเดล",
        "Table tennis": "เทเบิลเทนนิส",
        "table tennis": "เทเบิลเทนนิส",
        "Table Tennis": "เทเบิลเทนนิส",
    },
    "ja": {
        "Padel": "パデル",
        "padel": "パデル",
        "Table tennis": "卓球",
        "table tennis": "卓球",
        "Table Tennis": "卓球",
    },
}

PROTECT = [
    "Bandeja",
    "Playtomic",
    "Telegram",
    "NTRP",
    "UTR",
    "Americano",
    "Mexicano",
    "WhatsApp",
    "Apple",
    "Google",
    "iOS",
    "Android",
    "OAuth",
]

INTERP_RE = re.compile(r"\{\{[^}]+\}\}")
TAG_RE = re.compile(r"<[^>]+>")


def protect(s: str) -> tuple[str, list[str]]:
    tokens: list[str] = []

    def stash(m: re.Match[str]) -> str:
        tokens.append(m.group(0))
        return f"⟦{len(tokens) - 1}⟧"

    out = INTERP_RE.sub(stash, s)
    out = TAG_RE.sub(stash, out)
    for brand in PROTECT:
        if brand in out:
            tokens.append(brand)
            out = out.replace(brand, f"⟦{len(tokens) - 1}⟧")
    return out, tokens


def restore(s: str, tokens: list[str]) -> str:
    for i, tok in enumerate(tokens):
        s = s.replace(f"⟦{i}⟧", tok)
        s = s.replace(f"[{i}]", tok)  # occasional MT mangling
    return s


def apply_glossary(lang: str, s: str) -> str:
    for src, dst in GLOSSARY.get(lang, {}).items():
        s = s.replace(src, dst)
    return s


def translate_string(translator: GoogleTranslator, lang: str, s: str, cache: dict[str, str]) -> str:
    if not isinstance(s, str) or s.strip() == "":
        return s
    # Keep pure placeholders / punctuation
    if INTERP_RE.fullmatch(s.strip()) or s.strip() in {"-", "—", "…", "...", "/", "|"}:
        return s
    if s in cache:
        return cache[s]
    protected, tokens = protect(s)
    try:
        translated = translator.translate(protected)
        time.sleep(0.05)
    except Exception as e:
        print(f"  WARN translate fail: {e!r} :: {s[:80]}")
        translated = protected
        time.sleep(0.5)
    out = restore(translated or protected, tokens)
    out = apply_glossary(lang, out)
    cache[s] = out
    return out


def walk(obj, translator, lang, cache):
    if isinstance(obj, dict):
        return {k: walk(v, translator, lang, cache) for k, v in obj.items()}
    if isinstance(obj, list):
        return [walk(v, translator, lang, cache) for v in obj]
    if isinstance(obj, str):
        return translate_string(translator, lang, obj, cache)
    return obj


def translate_locale(lang: str) -> None:
    target = ROOT / f"Frontend/src/i18n/locales/{lang}"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(EN_DIR, target)
    # keep index.ts as-is (imports only)
    translator = GoogleTranslator(source="en", target=LANGS[lang])
    cache: dict[str, str] = {}
    files = sorted(target.rglob("*.json"))
    print(f"=== {lang}: {len(files)} files ===")
    for i, path in enumerate(files, 1):
        data = json.loads(path.read_text(encoding="utf-8"))
        data = walk(data, translator, lang, cache)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"  [{i}/{len(files)}] {path.relative_to(target)}")
    print(f"=== {lang} done, cache={len(cache)} ===")


def main() -> None:
    assert EN_DIR.is_dir(), f"missing {EN_DIR}"
    for lang in LANGS:
        translate_locale(lang)


if __name__ == "__main__":
    main()
