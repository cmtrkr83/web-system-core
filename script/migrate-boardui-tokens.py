#!/usr/bin/env python3
"""Sayfalardaki shadcn renk sınıflarını BoardUI semantic token'larına taşır.

Sadece client/src/pages/*.tsx. components/ui/* shadcn primitifleri köprü
katmanıyla (globals.css @theme inline) çalışmaya devam eder.

Sınır kuralı: (?<![\\w-]) ad(?! [\\w-]) → `bg-background` asla
`bg-background-primary-default` içinde eşleşmez; `hover:` gibi varyant
önekleri ve `/40` opaklık sonekleri korunur.
"""
import re
import sys
from pathlib import Path

MAPPING = {
    "bg-background": "bg-background-full",
    "text-foreground": "text-text-primary",
    "bg-card": "bg-background-primary-default",
    "text-card-foreground": "text-text-primary",
    "bg-popover": "bg-background-primary-default",
    "text-popover-foreground": "text-text-primary",
    "bg-primary": "bg-accent-600",
    "text-primary": "text-accent-600",
    "text-primary-foreground": "text-text-white",
    "border-primary": "border-accent-600",
    "ring-primary": "ring-border-focus-ring",
    "bg-secondary": "bg-background-secondary-default",
    "text-secondary-foreground": "text-text-primary",
    "bg-muted": "bg-background-secondary-default",
    "text-muted-foreground": "text-text-tertiary",
    "bg-accent": "bg-background-secondary-default",
    "text-accent-foreground": "text-text-primary",
    "bg-destructive": "bg-border-error-default",
    "text-destructive-foreground": "text-text-white",
    "text-destructive": "text-text-error-primary",
    "border-destructive": "border-border-error-default",
    "ring-destructive": "ring-border-error-default",
    "border-border": "border-separator-border",
    "bg-border": "bg-separator-border",
    "border-input": "border-border-button-default",
    "bg-input": "bg-border-button-default",
    "border-muted-foreground": "border-border-button-hover",
    "border-muted": "border-separator-border",
    "ring-ring": "ring-border-focus-ring",
    "border-ring": "border-border-focus-ring",
    "fill-muted": "fill-background-secondary-default",
}

# Uzun adlar önce: text-primary-foreground, text-primary'den önce denenmeli.
keys = sorted(MAPPING, key=len, reverse=True)
patterns = [
    (re.compile(r"(?<![\w-])" + re.escape(k) + r"(?![\w-])"), MAPPING[k]) for k in keys
]


def migrate(text: str):
    counts = {}
    for pattern, replacement in patterns:
        text, n = pattern.subn(replacement, text)
        if n:
            counts[replacement] = counts.get(replacement, 0) + n
    return text, counts


def main(apply: bool):
    total = {}
    files = sorted(Path("client/src/pages").glob("*.tsx"))
    changed = 0
    for path in files:
        src = path.read_text(encoding="utf-8")
        out, counts = migrate(src)
        if out == src:
            continue
        changed += 1
        for k, v in counts.items():
            total[k] = total.get(k, 0) + v
        print(f"{path.name}: {sum(counts.values())} sınıf")
        if apply:
            path.write_text(out, encoding="utf-8")
    print(f"\n{changed} dosya, {sum(total.values())} değişiklik")
    for k in sorted(total, key=lambda x: -total[x]):
        print(f"  {total[k]:>4}  {k}")
    if not apply:
        print("\n(dry-run — yazılmadı)")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
