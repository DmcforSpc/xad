"""WCAG 2.x relative luminance contrast verification for audit findings 1/2/7."""


def srgb(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


pairs = [
    ("F1 dark  CTA #9bb8e1 on #edf1f8", "9bb8e1", "edf1f8"),
    ("F1 light CTA #35608f on #14171d", "35608f", "14171d"),
    ("F1 ref acc on dark bg #9bb8e1 / #0b0e14", "9bb8e1", "0b0e14"),
    ("F1 ref acc on light bg #35608f / #f6f4ee", "35608f", "f6f4ee"),
    ("F2 dark  link vs text #9bb8e1 / #c9d1e0", "9bb8e1", "c9d1e0"),
    ("F2 light link vs text #35608f / #22262e", "35608f", "22262e"),
    ("F7 locked light on page bg #8a6d1f / #f6f4ee", "8a6d1f", "f6f4ee"),
    ("F7 locked light on card bg #8a6d1f / #fcfbf7", "8a6d1f", "fcfbf7"),
    ("F7 locked dark on card bg #d9b45c / #10141c", "d9b45c", "10141c"),
    ("F7 suggested #7a5f14 / #fcfbf7", "7a5f14", "fcfbf7"),
    ("F7 suggested #7a5f14 / #f6f4ee", "7a5f14", "f6f4ee"),
]
for name, a, b in pairs:
    print(f"{name}: {ratio(a, b):.3f}:1")

print()
for rem in (0.62, 0.68, 0.7, 0.75, 0.8, 0.85):
    print(f"{rem}rem = {rem * 16:.2f}px")
