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
        password = str(password)
        if not os.path.exists(output_path):
            continue
        temp_output = f"{output_path}.enc"
        
        # 检查文件是否已经被加密（防止重复加密）
        with open(output_path, "r", encoding="utf-8", errors="ignore") as f:
            if "PageCrypt" in f.read():
                print(f"Skipping {output_path}: Already encrypted.")
                continue

        cmd = ["npx", "-y", "pagecrypt@5.0.0", output_path, temp_output, password]
             
        subprocess.run(
            cmd,
            check=True,
        )
        
        # 注入自定义样式（适配 Chirpy 暗色主题）
        # 因为 pagecrypt@5.0.0 CLI 不支持 --tpl 参数，所以我们需要后处理
        try:
            with open(temp_output, "r", encoding="utf-8") as f:
                content = f.read()
            
            # --- 激进的 HTML 替换策略 ---
            
            # 1. 替换整个 <body> 的内容结构
            # 原始 PageCrypt 使用 Tailwind 类名，我们直接替换 main 部分
            # 注意：这里需要保留 <pre class="hidden">...</pre> 因为它包含密文
            
            new_body_content = """
    <div class="decrypt-container">
        <div class="decrypt-card">
            <header>
                <span class="lock-icon">🔒</span>
                <p id="msg">This page is password protected.</p>
            </header>
            <div id="load">
                <p>Loading...</p>
            </div>
            <form class="hidden">
                <input type="password" id="pwd" name="pwd" aria-label="Password" autofocus placeholder="Password" />
                <button type="submit">Unlock</button>
            </form>
        </div>
    </div>
    <style>
        :root {
          --bg-color: #1b1b1e;
          --card-bg: #2a2b30;
          --text-color: #c9d1d9;
          --border-color: #444c56;
          --primary-color: #3b82f6;
          --primary-hover: #2563eb;
        }
        body { margin: 0; background-color: var(--bg-color); color: var(--text-color); font-family: system-ui, sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .decrypt-container { width: 100%; display: flex; justify-content: center; }
        .decrypt-card { background-color: var(--card-bg); padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 1px solid var(--border-color); text-align: center; max-width: 400px; width: 100%; }
        .lock-icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
        #msg { font-size: 1.1rem; margin-bottom: 1.5rem; }
        input[type="password"] { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid var(--border-color); background-color: var(--bg-color); color: #fff; border-radius: 6px; box-sizing: border-box; }
        input[type="password"]:focus { outline: none; border-color: var(--primary-color); }
        button { background-color: var(--primary-color); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; width: 100%; font-weight: 600; }
        button:hover { background-color: var(--primary-hover); }
        .hidden { display: none; }
        #load { margin: 1rem 0; }
    </style>
            """
            
            # 定位 <main>...</main> 并替换
            import re
            content = re.sub(r'<main.*?>.*?</main>', new_body_content, content, flags=re.DOTALL)
            
            # 移除原来的 Tailwind 样式引用（可选，为了干净）
            # content = re.sub(r'<style>/\*! tailwindcss.*?</style>', '', content, flags=re.DOTALL)

            with open(temp_output, "w", encoding="utf-8") as f:
                f.write(content)
        except Exception as e:
            print(f"Warning: Failed to inject custom styles: {e}")

        os.replace(temp_output, output_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
