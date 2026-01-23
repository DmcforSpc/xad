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
        try:
            # 1. 读取原文件的完整内容，以提取其页面结构（侧边栏、顶部等）
            with open(output_path, "r", encoding="utf-8") as f:
                original_html = f.read()
                
                # 尝试提取 <main>...</main> 标签之外的所有内容（即保留侧边栏和顶部导航）
                # 我们假设 Chirpy 主题的主体内容包裹在 <main> 标签中
                # 策略：找到 <main ...> 和 </main> 的位置，把中间的内容替换成模糊的占位符
                
                main_start_match = re.search(r'(<main[^>]*>)', original_html)
                main_end_match = re.search(r'(</main>)', original_html)
                
                if main_start_match and main_end_match:
                    # 提取原始页面结构（除了 main 内容）
                    # 注意：pagecrypt 生成的文件只包含解密逻辑，我们需要把解密逻辑嵌入到原页面的 main 区域中
                    
                    # 读取 pagecrypt 生成的解密逻辑（从 temp_output）
                    with open(temp_output, "r", encoding="utf-8") as pf:
                        pagecrypt_content = pf.read()
                        
                    # 从 pagecrypt 生成的文件中提取 <script> 标签（包含解密算法和密文）
                    # 通常是 type="module" 或者内联 script
                    # PageCrypt v5 的结构比较复杂，它可能把密文放在 <pre> 里，把逻辑放在 <script> 里
                    
                    # 提取 pagecrypt 的核心部分
                    # 1. <script> 标签（包含解密逻辑）
                    scripts = re.findall(r'<script.*?>.*?</script>', pagecrypt_content, flags=re.DOTALL)
                    pagecrypt_scripts = "\n".join(scripts)
                    pagecrypt_scripts = pagecrypt_scripts.replace(
                        '["input","header","#msg","form","#load"]',
                        '["#pagecrypt-input","#pagecrypt-header","#pagecrypt-msg","#pagecrypt-form","#pagecrypt-load"]',
                    )
                    
                    
                    # 2. 密文 payload（通常在 <pre id="encrypted-payload"> 或类似结构，PageCrypt v5 使用 <pre hidden>）
                    payload_match = re.search(r'<pre[^>]*>.*?</pre>', pagecrypt_content, flags=re.DOTALL)
                    pagecrypt_payload = payload_match.group(0) if payload_match else ""
                    
                    # 构建新的 main 内容：模糊的假文章 + 锁屏覆盖层
                    # 尝试提取 title
                    title_match = re.search(r'<title>(.*?)</title>', original_html)
                    page_title = title_match.group(1).replace(" - D.FS", "") if title_match else "Protected Page"
                    
                    fake_article = f"""
                    <div class="post-content blur-content">
                        <h1>{page_title}</h1>
                        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                        <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
                        <h2>Protected Content</h2>
                        <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
                        <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
                        <ul>
                            <li>Elementum tempus egestas sed sed risus pretium quam vulputate.</li>
                            <li>Dictum fusce ut placerat orci nulla pellentesque dignissim enim.</li>
                        </ul>
                        <p>Pretium fusce id velit ut tortor pretium viverra suspendisse. Cursus metus aliquam eleifend mi in nulla posuere.</p>
                    </div>
                    """
                    
                    decrypt_ui = """
                    <div class="decrypt-overlay">
                        <div class="decrypt-card">
                            <header id="pagecrypt-header">
                                <span class="lock-icon">🔒</span>
                                <p id="pagecrypt-msg">This content is password protected.</p>
                            </header>
                            <div id="pagecrypt-load">
                                <p>Loading...</p>
                            </div>
                            <form id="pagecrypt-form" class="hidden">
                                <input type="password" id="pagecrypt-input" name="pwd" aria-label="Password" autofocus placeholder="Password" />
                                <button type="submit">Unlock</button>
                            </form>
                        </div>
                    </div>
                    """
                    
                    custom_style = """
                    <style>
                        /* 模糊内容 */
                        .blur-content {
                            filter: blur(8px);
                            opacity: 0.6;
                            pointer-events: none;
                            user-select: none;
                        }
                        
                        /* 锁屏悬浮层 - 覆盖全屏 */
                        .decrypt-overlay { 
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            z-index: 100;
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            background-color: rgba(0, 0, 0, 0.4);
                        }
                        
                        .decrypt-card { 
                            background-color: var(--card-bg); 
                            padding: 2.5rem; 
                            border-radius: 12px; 
                            box-shadow: 0 10px 25px rgba(0,0,0,0.5); 
                            border: 1px solid var(--border-color); 
                            text-align: center; 
                            max-width: 400px; 
                            width: 90%; 
                            backdrop-filter: blur(10px);
                        }
                        
                        .lock-icon { font-size: 3rem; margin-bottom: 1rem; display: block; }
                        #pagecrypt-msg { font-size: 1.1rem; margin-bottom: 1.5rem; }
                        input[type="password"] { width: 100%; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid var(--border-color); background-color: var(--bg-color); color: #fff; border-radius: 6px; box-sizing: border-box; }
                        input[type="password"]:focus { outline: none; border-color: var(--primary-color); }
                        button { background-color: var(--primary-color); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; width: 100%; font-weight: 600; }
                        button:hover { background-color: var(--primary-hover); }
                        .hidden { display: none; }
                        #pagecrypt-load { margin: 1rem 0; }
                    </style>
                    """
                    
                    # 组装新的 main 内容（仅替换正文）
                    new_main_inner = f"{fake_article}\n{custom_style}\n{pagecrypt_payload}"
                    
                    # 替换原 HTML 中的 main 内容
                    # 使用字符串切片保留 main 标签本身（包含 class 等属性）
                    final_html = (
                        original_html[:main_start_match.end()] + 
                        new_main_inner + 
                        original_html[main_end_match.start():]
                    )
                    
                    # 在 body 开头插入解锁 UI，保证选择器能找到正确的元素
                    final_html = final_html.replace("<body>", f"<body>\n{decrypt_ui}")

                    # 将 pagecrypt 的脚本注入到 body 结束标签前
                    final_html = final_html.replace("</body>", f"{pagecrypt_scripts}\n</body>")
                    
                    with open(temp_output, "w", encoding="utf-8") as f:
                        f.write(final_html)
                else:
                    print(f"Warning: Could not find <main> tag in {output_path}, skipping custom injection.")
            
        except Exception as e:
            print(f"Warning: Failed to inject custom styles: {e}")

        os.replace(temp_output, output_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
