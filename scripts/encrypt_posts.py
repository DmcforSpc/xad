import json
import os
import re
import subprocess
import sys


def parse_front_matter(path):
    with open(path, "r", encoding="utf-8") as file:
        lines = file.readlines()
    if not lines or lines[0].strip() != "---":
        return {}
    data = {}
    for line in lines[1:]:
        line = line.rstrip("\n")
        if line.strip() == "---":
            break
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        data[key] = value
    return data


def is_locked(value):
    return str(value).strip().lower() in {"true", "yes", "1"}


def slug_from_filename(filename):
    match = re.match(r"^\d{4}-\d{2}-\d{2}-(.+)\.(md|markdown)$", filename)
    if match:
        return match.group(1)
    return os.path.splitext(filename)[0]


def output_path_for_post(front_matter, filename):
    permalink = front_matter.get("permalink")
    slug = slug_from_filename(filename)
    if permalink:
        resolved = permalink.replace(":title", slug)
        if not resolved.startswith("/"):
            resolved = "/" + resolved
        if resolved.endswith(".html"):
            return os.path.join("_site", resolved.lstrip("/"))
        if not resolved.endswith("/"):
            resolved += "/"
        return os.path.join("_site", resolved.lstrip("/"), "index.html")
    return os.path.join("_site", "posts", slug, "index.html")


def main():
    raw = os.environ.get("POST_PASSWORDS", "").strip()
    if not raw:
        return 0
    mapping = json.loads(raw)
    posts_dir = "_posts"
    for name in os.listdir(posts_dir):
        if not name.endswith((".md", ".markdown")):
            continue
        path = os.path.join(posts_dir, name)
        fm = parse_front_matter(path)
        if not is_locked(fm.get("locked")):
            continue
        lock_id = fm.get("lock_id") or ""
        output_path = output_path_for_post(fm, name)
        password = mapping.get(lock_id) or mapping.get(output_path)
        if not password:
            continue
        if not os.path.exists(output_path):
            continue
        subprocess.run(["npx", "pagecrypt", output_path, password], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
