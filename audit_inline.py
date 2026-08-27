"""Аудит инлайновых обработчиков перед отключением script-src 'unsafe-inline'.

Ничего не меняет — только считает. Нужно понять, сколько обработчиков
переписываются автоматически, а сколько придётся править руками.

Запуск из корня проекта:
    python audit_inline.py
"""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

FILES = [
    Path("frontend/index.html"),
    Path("frontend/app.js"),
]

# on<событие>="..." или '...'
HANDLER_RE = re.compile(
    r"""\son([a-z]+)\s*=\s*(["'])(.*?)\2""",
    re.IGNORECASE | re.DOTALL,
)

# Ровно один вызов функции: name(...) — с возможной точкой с запятой в конце
SINGLE_CALL_RE = re.compile(r"^\s*([A-Za-z_$][\w$.]*)\s*\((.*)\)\s*;?\s*$", re.DOTALL)

INLINE_SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>", re.IGNORECASE)
EVAL_RE = re.compile(r"\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['\"]")


def classify(code: str) -> str:
    """Насколько обработчик поддаётся автоматической замене."""
    body = code.strip()
    if not body:
        return "empty"

    m = SINGLE_CALL_RE.match(body)
    if not m:
        return "complex"          # несколько выражений, присваивания, тернарники

    args = m.group(2)
    if re.search(r"\bthis\b", body):
        return "uses_this"        # понадобится currentTarget
    if re.search(r"\bevent\b", body):
        return "uses_event"       # понадобится сам объект события

    # Аргументы: строковые литералы, числа, true/false/null, ${...} из шаблона
    stripped = re.sub(r"\$\{[^}]*\}", "X", args)
    stripped = re.sub(r"'[^']*'|\"[^\"]*\"", "S", stripped)
    if re.search(r"[A-Za-z_$][\w$]*", re.sub(r"\b(true|false|null|undefined)\b", "", stripped)):
        return "dynamic_args"     # переменные в аргументах — смотреть глазами

    return "simple"


def main() -> int:
    missing = [f for f in FILES if not f.exists()]
    if missing:
        print("Не найдены (запускай из корня проекта):", *missing, sep="\n  ")
        return 1

    grand = Counter()
    for path in FILES:
        text = path.read_text(encoding="utf-8", errors="replace")
        stats = Counter()
        samples: dict[str, list[str]] = {}

        for m in HANDLER_RE.finditer(text):
            event, _, code = m.groups()
            kind = classify(code)
            stats[kind] += 1
            stats[f"event:{event.lower()}"] += 1
            if kind not in ("simple", "empty"):
                samples.setdefault(kind, [])
                if len(samples[kind]) < 5:
                    line = text.count("\n", 0, m.start()) + 1
                    samples[kind].append(f"    {path.name}:{line}  {code.strip()[:110]}")

        print(f"\n=== {path} ===")
        total = sum(v for k, v in stats.items() if not k.startswith("event:"))
        print(f"обработчиков всего: {total}")
        for kind in ("simple", "dynamic_args", "uses_event", "uses_this", "complex", "empty"):
            if stats[kind]:
                print(f"  {kind:<14} {stats[kind]}")
        events = {k[6:]: v for k, v in stats.items() if k.startswith("event:")}
        print("  события:", ", ".join(f"{k}={v}" for k, v in sorted(
            events.items(), key=lambda kv: -kv[1])))

        for kind, lines in samples.items():
            print(f"\n  примеры [{kind}]:")
            print("\n".join(lines))

        inline_scripts = len(INLINE_SCRIPT_RE.findall(text))
        if inline_scripts:
            print(f"\n  инлайновых <script> без src: {inline_scripts}")

        evals = EVAL_RE.findall(text)
        if evals:
            print(f"  подозрения на unsafe-eval: {len(evals)} — {set(evals)}")

        grand.update({k: v for k, v in stats.items() if not k.startswith("event:")})

    print("\n=== итого ===")
    auto = grand["simple"] + grand["dynamic_args"]
    manual = grand["uses_event"] + grand["uses_this"] + grand["complex"]
    print(f"автоматически: {auto}")
    print(f"руками:        {manual}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
