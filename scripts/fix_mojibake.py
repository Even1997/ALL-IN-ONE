#!/usr/bin/env python3
"""
Scan and repair common UTF-8 <-> GBK/GB18030 mojibake in text files.

Default mode is dry-run. Use --apply to write changes back to disk.

Examples:
  python scripts/fix_mojibake.py
  python scripts/fix_mojibake.py --apply src src-tauri
  python scripts/fix_mojibake.py --include .ts .tsx .css .rs
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


DEFAULT_ROOTS = ("src", "src-tauri", "scripts", "docs")
DEFAULT_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".scss",
    ".html",
    ".md",
    ".rs",
    ".toml",
    ".json",
    ".yml",
    ".yaml",
}
SKIP_DIRS = {
    ".git",
    ".worktrees",
    "node_modules",
    "target",
    "dist",
    "dist-test",
    ".tmp",
}
REPLACEMENT_CHAR = "\ufffd"

# Common markers seen when UTF-8 text was decoded as GBK/GB18030 and then saved again.
SUSPICIOUS_HINT_CHARS = set(
    "\u00c3\u00c2\u00e2"
    "\u20ac\u2122\ufffd"
    "\u92eb\u20ac\u02dc\u92eb\u20ac"
    "\u95c0\u9698\u20ac\u57c6\u95c0\u6a45\u6434"
    "\u95b8\u6a3a\u5d25\u95b8\ufe44\u5d18\u95b8\u6381\u5d1c\u95b8\u65c8\u5d20\u95b8\u63c0\u5d1c"
    "\u7f02\u4f79\u7d13\u7f02\u51aa\u7cb3\u7f01\u6d4e\u7d19\u7f01\u6fc6\u7d17"
    "\u9547\u5ea3\u6f4d\u95b9\u6b0e\u53c2\u95b9\ufffd"
    "\u5b38\u30b6\u5f84\u6fb6"
)
COMMON_CHINESE_CHARS = set(
    "\u7684\u4e00\u662f\u5728\u4e0d\u4e86\u6709\u548c\u4eba\u8fd9\u4e2d\u5927\u4e3a\u4e0a\u4e2a\u56fd\u6211\u4ee5\u8981\u4ed6\u65f6\u6765\u7528\u4eec\u751f\u5230\u4f5c\u5730\u4e8e\u51fa\u5c31\u5206\u5bf9\u6210\u4f1a\u53ef\u4e3b\u53d1\u5e74\u52a8"
    "\u540c\u5de5\u4e5f\u80fd\u4e0b\u8fc7\u5b50\u8bf4\u4ea7\u79cd\u9762\u800c\u65b9\u540e\u591a\u5b9a\u884c\u5b66\u6cd5\u6240\u6c11\u5f97\u7ecf\u5341\u4e09\u4e4b\u8fdb\u7740\u7b49\u90e8\u5ea6\u5bb6\u7535\u529b\u91cc\u5982\u6c34\u5316\u9ad8"
    "\u81ea\u4e8c\u7406\u8d77\u5c0f\u7269\u73b0\u5b9e\u52a0\u91cf\u90fd\u4e24\u4f53\u5236\u673a\u5f53\u4f7f\u70b9\u4ece\u4e1a\u672c\u53bb\u628a\u6027\u597d\u5e94\u5f00\u5b83\u5408\u8fd8\u56e0\u7531\u5176\u4e9b\u7136\u524d\u5916\u5929\u653f"
    "\u56db\u65e5\u90a3\u793e\u4e49\u4e8b\u5e73\u5f62\u76f8\u5168\u8868\u95f4\u6837\u4e0e\u5173\u5404\u91cd\u65b0\u7ebf\u5185\u6570\u6b63\u5fc3\u53cd\u4f60\u660e\u770b\u539f\u53c8\u4e48\u5229\u6bd4\u6216\u4f46\u8d28\u6c14\u7b2c\u5411\u9053"
    "\u547d\u6b64\u53d8\u6761\u53ea\u6ca1\u7ed3\u89e3\u95ee\u610f\u5efa\u6708\u516c\u65e0\u7cfb\u519b\u5f88\u60c5\u8005\u6700\u7acb\u4ee3\u60f3\u5df2\u901a\u5e76\u63d0\u76f4\u9898\u515a\u7a0b\u5c55\u4e94\u679c\u6599\u8c61\u5458\u9769\u4f4d"
    "\u5165\u5e38\u6587\u603b\u6b21\u54c1\u5f0f\u6d3b\u8bbe\u53ca\u7ba1\u7279\u4ef6\u957f\u6c42\u8001\u5934\u57fa\u8d44\u8fb9\u6d41\u8def\u7ea7\u5c11\u56fe\u5c71\u7edf\u63a5\u77e5\u8f83\u5c06\u7ec4\u89c1\u8ba1\u522b\u5979\u624b\u89d2\u671f"
    "\u6839\u8bba\u8fd0\u519c\u6307\u51e0\u4e5d\u533a\u5f3a\u653e\u51b3\u897f\u88ab\u5e72\u505a\u5fc5\u6218\u5148\u56de\u5219\u4efb\u53d6\u636e\u5904\u7406\u4e16\u8f66\u738b\u5b8c\u5e76\u53e3\u773c\u8eab\u771f\u66f4\u6bcf\u6253"
    "\u65b0\u5bf9\u8bdd\u590d\u5236\u53d6\u6d88\u5df2\u5904\u7406\u7ba1\u7406\u63a8\u8350\u7cfb\u7edf\u4e2a\u4eba\u5b89\u88c5\u5bfc\u5165\u672c\u5730\u6280\u80fd\u4e0b\u8f7d\u4ed3\u5e93\u8def\u5f84\u6b63\u5728\u52a0\u8f7d\u5185\u5bb9"
)
CJK_PUNCTUATION = set(
    "\u3001\u3002\uff0c\uff01\uff1f\uff1a\uff1b\uff08\uff09\u300a\u300b\u3010\u3011\u201c\u201d\u2018\u2019\u2026\u00b7\u2014"
)
SEGMENT_PATTERN = re.compile(r"[^\x00-\x7F]{2,}\??")


@dataclass
class Replacement:
    start: int
    end: int
    original: str
    fixed: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair likely mojibake in repository text files.")
    parser.add_argument("paths", nargs="*", default=list(DEFAULT_ROOTS), help="Paths to scan.")
    parser.add_argument("--apply", action="store_true", help="Write repaired text back to files.")
    parser.add_argument(
        "--include",
        nargs="*",
        default=sorted(DEFAULT_EXTENSIONS),
        help="File extensions to include, e.g. .ts .tsx .css",
    )
    parser.add_argument("--verbose", action="store_true", help="Print every replacement candidate.")
    return parser.parse_args()


def iter_files(root_paths: list[str], include_exts: set[str]) -> list[Path]:
    files: list[Path] = []

    for raw_path in root_paths:
        path = Path(raw_path)
        if not path.exists():
            continue
        if path.is_file():
            if path.suffix.lower() in include_exts:
                files.append(path)
            continue

        for candidate in path.rglob("*"):
            if any(part in SKIP_DIRS for part in candidate.parts):
                continue
            if candidate.is_file() and candidate.suffix.lower() in include_exts:
                files.append(candidate)

    return files


def has_enough_hints(segment: str) -> bool:
    hint_count = sum(1 for char in segment if char in SUSPICIOUS_HINT_CHARS)
    if hint_count >= 2 or REPLACEMENT_CHAR in segment or any("\u00c0" <= char <= "\u024f" for char in segment):
        return True

    cjk_count = sum(1 for char in segment if "\u4e00" <= char <= "\u9fff")
    if cjk_count < 2:
        return False

    common_count = sum(1 for char in segment if char in COMMON_CHINESE_CHARS)
    return common_count / cjk_count < 0.35


def score_text(text: str) -> float:
    score = 0.0

    for char in text:
        if char == REPLACEMENT_CHAR:
            score -= 8.0
        elif char in SUSPICIOUS_HINT_CHARS:
            score -= 3.2

        if char in COMMON_CHINESE_CHARS:
            score += 4.0
        elif "\u4e00" <= char <= "\u9fff":
            score += 1.2
        elif char in CJK_PUNCTUATION:
            score += 0.8
        elif char.isascii() and char.isprintable():
            score += 0.05

    return score


def try_decode(segment: str, encoding: str) -> str | None:
    variants = [segment]
    if REPLACEMENT_CHAR in segment:
        variants.append(segment.replace(REPLACEMENT_CHAR, ""))
        variants.append(segment.rstrip(REPLACEMENT_CHAR))
    if segment.endswith("?"):
        variants.append(segment[:-1])

    for variant in variants:
        if not variant:
            continue
        try:
            repaired = variant.encode(encoding).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if repaired != segment:
            return repaired

    return None


def repair_segment(segment: str) -> str | None:
    if not has_enough_hints(segment):
        return None

    baseline = score_text(segment)
    best: str | None = None
    best_score = baseline

    for encoding in ("gb18030", "gbk"):
        repaired = try_decode(segment, encoding)
        if not repaired or REPLACEMENT_CHAR in repaired:
            continue

        repaired_score = score_text(repaired)
        improvement = repaired_score - baseline
        if improvement >= max(4.0, len(segment) * 0.45) and repaired_score > best_score:
            best = repaired
            best_score = repaired_score

    return best


def rewrite_text(text: str) -> tuple[str, list[Replacement]]:
    replacements: list[Replacement] = []
    parts: list[str] = []
    cursor = 0

    for match in SEGMENT_PATTERN.finditer(text):
        start, end = match.span()
        segment = match.group(0)
        fixed = repair_segment(segment)
        if not fixed:
            continue

        parts.append(text[cursor:start])
        parts.append(fixed)
        replacements.append(Replacement(start=start, end=end, original=segment, fixed=fixed))
        cursor = end

    if not replacements:
        return text, []

    parts.append(text[cursor:])
    return "".join(parts), replacements


def line_number_for_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def escape_preview(value: str, limit: int = 80) -> str:
    preview = value.encode("unicode_escape").decode("ascii")
    if len(preview) > limit:
        preview = f"{preview[: limit - 3]}..."
    return preview


def process_file(path: Path, apply: bool, verbose: bool) -> tuple[int, int]:
    try:
        original = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return (0, 0)

    updated, replacements = rewrite_text(original)
    if not replacements:
        return (0, 0)

    if apply:
        path.write_text(updated, encoding="utf-8", newline="")

    print(f"{path}  candidates={len(replacements)}{'  [applied]' if apply else ''}")
    if verbose:
        for replacement in replacements:
            line_no = line_number_for_offset(original, replacement.start)
            before = escape_preview(replacement.original)
            after = escape_preview(replacement.fixed)
            print(f"  L{line_no}: {before}  =>  {after}")

    return (1, len(replacements))


def main() -> int:
    args = parse_args()
    include_exts = {
        extension.lower() if extension.startswith(".") else f".{extension.lower()}"
        for extension in args.include
    }
    files = iter_files(args.paths, include_exts)

    touched_files = 0
    total_replacements = 0

    for path in files:
        file_count, replacement_count = process_file(path, apply=args.apply, verbose=args.verbose)
        touched_files += file_count
        total_replacements += replacement_count

    mode = "applied" if args.apply else "found"
    print(f"\nSummary: {mode} {total_replacements} replacements across {touched_files} files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
