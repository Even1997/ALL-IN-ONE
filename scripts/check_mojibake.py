from __future__ import annotations

import argparse
import difflib
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


TEXT_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".scss",
    ".html",
    ".md",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
}

@dataclass
class Finding:
    path: Path
    line_number: int
    kind: str
    original: str
    repaired: str | None = None


def iter_text_files(roots: Iterable[Path]) -> Iterable[Path]:
    for root in roots:
        if root.is_file():
            if root.suffix.lower() in TEXT_EXTENSIONS:
                yield root
            continue

        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            if any(part in {".git", "dist", "node_modules"} for part in path.parts):
                continue
            yield path


def contains_replacement_char(text: str) -> bool:
    return "\ufffd" in text


def suspicious_score(text: str) -> int:
    # Typical mojibake often retains a dense cluster of non-ASCII symbols while losing readability.
    return sum(1 for char in text if ord(char) > 127)


def looks_more_readable(candidate: str, original: str) -> bool:
    if candidate == original:
        return False

    original_cjk = sum(1 for ch in original if "\u4e00" <= ch <= "\u9fff")
    candidate_cjk = sum(1 for ch in candidate if "\u4e00" <= ch <= "\u9fff")
    original_suspicious = suspicious_score(original)
    candidate_suspicious = suspicious_score(candidate)

    return candidate_cjk > original_cjk or (
        candidate_cjk == original_cjk and candidate_suspicious < original_suspicious
    )


def repair_mojibake(text: str) -> str | None:
    try:
        candidate = text.encode("gb18030").decode("utf-8")
    except UnicodeError:
        return None

    if looks_more_readable(candidate, text):
        return candidate

    return None


def scan_file(path: Path) -> list[Finding]:
    findings: list[Finding] = []

    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as error:
        findings.append(
            Finding(
                path=path,
                line_number=error.start,
                kind="decode_error",
                original=str(error),
            )
        )
        return findings

    for line_number, line in enumerate(text.splitlines(), start=1):
        if contains_replacement_char(line):
            findings.append(
                Finding(
                    path=path,
                    line_number=line_number,
                    kind="replacement_char",
                    original=line,
                )
            )
            continue

        if not any(ord(char) > 127 for char in line):
            continue

        repaired = repair_mojibake(line)
        if repaired:
            findings.append(
                Finding(
                    path=path,
                    line_number=line_number,
                    kind="suspected_mojibake",
                    original=line,
                    repaired=repaired,
                )
            )

    return findings


def apply_fixes(findings: list[Finding]) -> int:
    grouped: dict[Path, list[Finding]] = {}
    for finding in findings:
        if finding.kind != "suspected_mojibake" or finding.repaired is None:
            continue
        grouped.setdefault(finding.path, []).append(finding)

    changed_files = 0

    for path, file_findings in grouped.items():
        lines = path.read_text(encoding="utf-8").splitlines()
        changed = False

        for finding in file_findings:
            index = finding.line_number - 1
            if 0 <= index < len(lines) and lines[index] == finding.original:
                lines[index] = finding.repaired
                changed = True

        if changed:
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            changed_files += 1

    return changed_files


def print_findings(findings: list[Finding], root: Path) -> None:
    if not findings:
        print("No mojibake findings.")
        return

    for finding in findings:
        relative_path = finding.path.relative_to(root)
        print(f"{relative_path}:{finding.line_number} [{finding.kind}]")
        print(f"  original: {finding.original}")
        if finding.repaired is not None:
            print(f"  repaired: {finding.repaired}")
            diff = difflib.ndiff([finding.original], [finding.repaired])
            for line in diff:
                print(f"  {line}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan text files for likely Chinese mojibake.")
    parser.add_argument("paths", nargs="*", default=["src", "docs", "design", "AGENTS.md"])
    parser.add_argument("--fix", action="store_true", help="Apply safe line-based repairs for detected mojibake.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path.cwd()
    roots = [root / value for value in args.paths]
    findings: list[Finding] = []

    for path in iter_text_files(roots):
        findings.extend(scan_file(path))

    print_findings(findings, root)

    if args.fix:
        changed_files = apply_fixes(findings)
        print(f"Changed files: {changed_files}")

    return 1 if any(f.kind == "decode_error" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
