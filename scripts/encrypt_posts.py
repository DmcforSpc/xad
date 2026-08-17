import base64
import binascii
import html
import json
import os
import re
import subprocess
import sys


PAGECRYPT_VERSION = "5.0.0"
PROTECTED_MARKER = 'data-pagecrypt-protected="v5"'


class EncryptionError(RuntimeError):
    pass


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


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise EncryptionError(
            f"PageCrypt {PAGECRYPT_VERSION} patch '{label}' expected once, found {count}."
        )
    return source.replace(old, new, 1)


def validate_payload(payload_text, context):
    compact = re.sub(r"\s+", "", html.unescape(payload_text))
    if not compact:
        raise EncryptionError(f"Missing encrypted payload in {context}.")
    try:
        decoded = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError) as error:
        raise EncryptionError(f"Invalid encrypted payload in {context}: {error}") from error
    if len(decoded) <= 64:
        raise EncryptionError(f"Encrypted payload is unexpectedly short in {context}.")
    return compact


def extract_pagecrypt_parts(pagecrypt_html, context):
    scripts = [
        script
        for script in re.findall(
            r"<script\b[^>]*>(.*?)</script\s*>", pagecrypt_html, flags=re.DOTALL | re.IGNORECASE
        )
        if script.strip()
    ]
    if len(scripts) != 1:
        raise EncryptionError(
            f"Expected one PageCrypt script in {context}, found {len(scripts)}."
        )

    payload_match = re.search(
        r"<pre\b[^>]*>(.*?)</pre\s*>", pagecrypt_html, flags=re.DOTALL | re.IGNORECASE
    )
    if not payload_match:
        raise EncryptionError(f"Missing PageCrypt payload element in {context}.")
    payload = validate_payload(payload_match.group(1), context)
    return scripts[0], payload


def patch_pagecrypt_script(raw_script):
    patches = (
        (
            '["input","header","#msg","form","#load"]',
            '["#pagecrypt-input","#pagecrypt-header","#pagecrypt-msg","#pagecrypt-form","#pagecrypt-load"]',
            "selectors",
        ),
        (
            'document.addEventListener("DOMContentLoaded",(async()=>{',
            "const __pc_init=async()=>{",
            "initialization start",
        ),
        (
            '}));const m=',
            '};const __pc_start=()=>{__pc_init().catch(__pc_fail)};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",__pc_start,{once:true})}else{Promise.resolve().then(__pc_start)}const m=',
            "initialization end",
        ),
        (
            'const e=o("pre").innerText;',
            'const e=o("#encrypted-payload").innerText;',
            "payload selector",
        ),
        ('y("No encrypted payload.")', 'y("未找到加密内容。")', "missing payload message"),
        ('innerText="Decrypting..."', 'innerText="正在解密..."', "decrypting message"),
        (
            'f(s),f(c),p(d),await',
            'f(s),f(c),p(d),o(".decrypt-card").focus(),await',
            "decrypting dialog focus",
        ),
        ('y("Wrong password.")', 'y("密码错误，请重试。")', "wrong password message"),
        (
            'y("Please use a modern browser.")',
            'y("当前浏览器不支持安全解密，请升级后重试。")',
            "unsupported browser message",
        ),
        (
            "sessionStorage.k?await h():",
            "sessionStorage.getItem(__pc_storage_key)?await h():",
            "cached key auto-unlock check",
        ),
        (
            "sessionStorage.k?await async function(e)",
            "sessionStorage.getItem(__pc_storage_key)?await async function(e)",
            "cached key import check",
        ),
        (
            "JSON.parse(sessionStorage.k)",
            "JSON.parse(sessionStorage.getItem(__pc_storage_key))",
            "cached key read",
        ),
        (
            'return sessionStorage.k=JSON.stringify(await m.exportKey("jwk",a)),o.decode(s)',
            'return sessionStorage.setItem(__pc_storage_key,JSON.stringify(await m.exportKey("jwk",a))),o.decode(s)',
            "cached key write",
        ),
        (
            'sessionStorage.k?sessionStorage.removeItem("k"):',
            "sessionStorage.getItem(__pc_storage_key)?sessionStorage.removeItem(__pc_storage_key):",
            "cached key removal",
        ),
    )
    for old, new, label in patches:
        raw_script = replace_once(raw_script, old, new, label)
    return raw_script


def build_unlock_script(raw_script):
    return (
        "<script>\n"
        "(function () {\n"
        '  "use strict";\n'
        '  const __pc_storage_key="pagecrypt:v5:"+window.location.pathname;\n'
        "  function __pc_fail(error) {\n"
        '    console.error("[pagecrypt] initialization failed", error);\n'
        '    var load = document.getElementById("pagecrypt-load");\n'
        '    var form = document.getElementById("pagecrypt-form");\n'
        '    var header = document.getElementById("pagecrypt-header");\n'
        '    var message = document.getElementById("pagecrypt-msg");\n'
        '    if (load) load.classList.add("hidden");\n'
        '    if (form) form.classList.add("hidden");\n'
        '    if (header) header.classList.remove("hidden");\n'
        '    if (message) message.textContent = "解密组件加载失败，请刷新页面后重试。";\n'
        '    if (header) header.classList.add("text-red-600");\n'
        "  }\n"
        "  function __pc_prepare_dialog() {\n"
        '    var overlay = document.querySelector(".decrypt-overlay");\n'
        '    var dialog = document.querySelector(".decrypt-card");\n'
        "    if (!overlay || !dialog) throw new Error(\"Missing unlock dialog.\");\n"
        "    Array.prototype.forEach.call(document.body.children, function (element) {\n"
        '      if (element !== overlay && element.tagName !== "SCRIPT") {\n'
        "        element.inert = true;\n"
        '        element.setAttribute("aria-hidden", "true");\n'
        "      }\n"
        "    });\n"
        "    dialog.addEventListener(\"keydown\", function (event) {\n"
        '      if (event.key !== "Tab") return;\n'
        '      var focusable = Array.prototype.filter.call(dialog.querySelectorAll("input:not([disabled]), button:not([disabled])"), function (element) { return element.offsetParent !== null; });\n'
        "      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }\n"
        "      var first = focusable[0];\n"
        "      var last = focusable[focusable.length - 1];\n"
        "      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }\n"
        "      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }\n"
        "    });\n"
        "    dialog.focus();\n"
        "  }\n"
        "  try {\n"
        "    __pc_prepare_dialog();\n"
        f"    {raw_script}\n"
        "  } catch (error) {\n"
        "    __pc_fail(error);\n"
        "  }\n"
        "})();\n"
        "</script>"
    )


def build_locked_main(page_title, payload):
    safe_title = html.escape(page_title or "受保护内容")
    fake_article = f"""
<article class="protected-placeholder px-1 px-sm-2 px-lg-4 px-xl-0" aria-hidden="true" inert>
  <header><h1 class="post-title">{safe_title}</h1></header>
  <div class="post-content protected-placeholder__body">
    <p>此处内容已加密，仅用于展示文章版式。</p>
    <p>请输入访问密码后查看完整内容。</p>
    <h2>受保护内容</h2>
    <p>解锁成功后，页面会自动显示原始文章。</p>
  </div>
</article>
"""
    custom_style = """
<style>
  .protected-placeholder__body {
    filter: blur(8px);
    opacity: 0.45;
    pointer-events: none;
    user-select: none;
  }
  .decrypt-overlay {
    position: fixed;
    inset: 0;
    z-index: 1080;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: auto;
    overscroll-behavior: contain;
    padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    background: var(--mask-bg, rgba(11, 14, 20, 0.72));
  }
  .decrypt-card {
    box-sizing: border-box;
    width: min(100%, 26rem);
    margin: auto;
    padding: clamp(1.25rem, 5vw, 2.5rem);
    border: 1px solid var(--main-border-color, var(--dfs-hairline, rgba(138, 148, 168, 0.24)));
    border-radius: var(--dfs-r-md, 8px);
    background: var(--card-bg, var(--main-bg, #10141c));
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
    color: var(--text-color, var(--dfs-ink, #c9d1e0));
    text-align: center;
  }
  .decrypt-card:focus-visible {
    outline: 2px solid var(--dfs-acc, var(--link-color, #9bb8e1));
    outline-offset: -4px;
  }
  .decrypt-card #pagecrypt-header {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .decrypt-card .lock-icon {
    margin-bottom: 0.75rem;
    color: var(--dfs-locked, var(--dfs-acc, var(--link-color, #9bb8e1)));
    font-size: 2.5rem;
  }
  .decrypt-card #pagecrypt-title {
    margin: 0 0 0.75rem;
    color: var(--heading-color, var(--dfs-ink-strong, #edf1f8));
    font-size: 1.35rem;
  }
  .decrypt-card #pagecrypt-msg {
    margin: 0 0 1.25rem;
    color: inherit;
    font-size: 0.95rem;
  }
  .decrypt-card #pagecrypt-load { margin: 1rem 0 0; }
  .decrypt-card #pagecrypt-form:not(.hidden) {
    display: grid;
    gap: 0.75rem;
  }
  .decrypt-card .decrypt-card__label {
    color: var(--heading-color, var(--dfs-ink-strong, #edf1f8));
    font-size: 0.9rem;
    font-weight: 600;
    text-align: left;
  }
  .decrypt-card #pagecrypt-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.75rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--main-border-color, var(--dfs-hairline, currentColor));
    border-radius: var(--dfs-r-sm, 6px);
    background: var(--main-bg, var(--dfs-bg-0, #0b0e14));
    color: var(--heading-color, var(--dfs-ink-strong, #edf1f8));
  }
  .decrypt-card #pagecrypt-input:focus-visible,
  .decrypt-card .decrypt-card__submit:focus-visible {
    outline: 2px solid var(--dfs-acc, var(--link-color, #9bb8e1));
    outline-offset: 2px;
  }
  .decrypt-card .decrypt-card__submit {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.7rem 1.2rem;
    border: 1px solid var(--dfs-acc, var(--link-color, #9bb8e1));
    border-radius: var(--dfs-r-sm, 6px);
    background: var(--dfs-acc, var(--link-color, #9bb8e1));
    color: var(--dfs-bg-0, #0b0e14);
    cursor: pointer;
    font-weight: 700;
  }
  .decrypt-card .decrypt-card__submit:hover {
    box-shadow: 0 0 18px var(--dfs-acc-glow, rgba(155, 184, 225, 0.35));
  }
  .decrypt-card .hidden { display: none !important; }
  .decrypt-card .text-red-600 { color: var(--dfs-amber, #b5473c); }
  .decrypt-card .decrypt-card__noscript { color: var(--dfs-amber, #b5473c); }
  @media (max-height: 30rem) {
    .decrypt-overlay { align-items: flex-start; }
  }
  @media (prefers-reduced-motion: reduce) {
    .decrypt-card .decrypt-card__submit { transition: none; }
  }
</style>
"""
    payload_element = (
        f'<pre id="encrypted-payload" class="hidden" aria-hidden="true">{payload}</pre>'
    )
    return f"{fake_article}\n{custom_style}\n{payload_element}"


def build_unlock_dialog():
    return f"""
<div class="decrypt-overlay" {PROTECTED_MARKER}>
  <section class="decrypt-card" role="dialog" aria-modal="true" aria-labelledby="pagecrypt-title" aria-describedby="pagecrypt-msg" tabindex="-1">
    <header id="pagecrypt-header">
      <i class="fas fa-lock lock-icon" aria-hidden="true"></i>
      <h2 id="pagecrypt-title">受保护内容</h2>
      <p id="pagecrypt-msg" role="status" aria-live="polite" aria-atomic="true">请输入访问密码以查看此文章。</p>
    </header>
    <div id="pagecrypt-load" role="status" aria-live="polite" aria-atomic="true">
      <p>正在加载解密组件...</p>
    </div>
    <form id="pagecrypt-form" class="hidden">
      <label class="decrypt-card__label" for="pagecrypt-input">访问密码</label>
      <input type="password" id="pagecrypt-input" name="pwd" required autocomplete="current-password" autocapitalize="none" spellcheck="false" placeholder="请输入访问密码">
      <button class="decrypt-card__submit" type="submit">解锁</button>
    </form>
    <noscript><p class="decrypt-card__noscript">请启用 JavaScript 后解锁此文章。</p></noscript>
  </section>
</div>
"""


def replace_main(original_html, replacement, context):
    main_start = re.search(r"<main\b[^>]*>", original_html, flags=re.IGNORECASE)
    main_end = re.search(r"</main\s*>", original_html, flags=re.IGNORECASE)
    if not main_start or not main_end or main_end.start() <= main_start.end():
        raise EncryptionError(f"Could not locate a valid <main> element in {context}.")
    return original_html[: main_start.end()] + replacement + original_html[main_end.start() :]


def insert_after_body_open(document, markup, context):
    body_matches = list(re.finditer(r"<body\b[^>]*>", document, flags=re.IGNORECASE))
    if len(body_matches) != 1:
        raise EncryptionError(
            f"Expected one <body> element in {context}, found {len(body_matches)}."
        )
    body = body_matches[0]
    return document[: body.end()] + "\n" + markup + document[body.end() :]


def insert_unlock_script(document, script):
    closing_body = re.search(r"</body\s*>", document, flags=re.IGNORECASE)
    if closing_body:
        return document[: closing_body.start()] + script + "\n" + document[closing_body.start() :]
    closing_html = re.search(r"</html\s*>", document, flags=re.IGNORECASE)
    if closing_html:
        return document[: closing_html.start()] + script + "\n" + document[closing_html.start() :]
    return document + "\n" + script


def validate_final_html(document, context):
    required_counts = (
        (PROTECTED_MARKER, 1),
        ('id="encrypted-payload"', 1),
        ('id="pagecrypt-input"', 1),
        ('role="dialog"', 1),
        ('aria-modal="true"', 1),
        ("const __pc_init=async()=>{", 1),
        ('const __pc_storage_key="pagecrypt:v5:"+window.location.pathname;', 1),
        ('p(d),o(".decrypt-card").focus(),await', 1),
        ("sessionStorage.getItem(__pc_storage_key)", 4),
        ("sessionStorage.setItem(__pc_storage_key,", 1),
        ("sessionStorage.removeItem(__pc_storage_key)", 1),
    )
    for marker, expected_count in required_counts:
        actual_count = document.count(marker)
        if actual_count != expected_count:
            raise EncryptionError(
                f"Final encrypted page {context} expected {expected_count} occurrence(s) "
                f"of {marker!r}, found {actual_count}."
            )
    for legacy_storage_access in ("sessionStorage.k", 'sessionStorage.removeItem("k")'):
        if legacy_storage_access in document:
            raise EncryptionError(
                f"Final encrypted page {context} retains legacy storage access "
                f"{legacy_storage_access!r}."
            )
    payload_match = re.search(
        r'<pre\b[^>]*\bid="encrypted-payload"[^>]*>(.*?)</pre\s*>',
        document,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not payload_match:
        raise EncryptionError(f"Final encrypted page {context} has no payload element.")
    validate_payload(payload_match.group(1), context)


def password_for_post(mapping, lock_id, output_path, source_path):
    keys = [key for key in (lock_id, output_path) if key]
    for key in keys:
        if key in mapping:
            password = mapping[key]
            if not isinstance(password, str) or not password:
                raise EncryptionError(f"Password for {source_path} must be a non-empty string.")
            return password
    expected = " or ".join(repr(key) for key in keys) or "a lock_id"
    raise EncryptionError(f"Missing password for locked post {source_path}; expected key {expected}.")


def encrypt_post(source_path, filename, front_matter, mapping):
    output_path = output_path_for_post(front_matter, filename)
    lock_id = front_matter.get("lock_id") or ""
    password = password_for_post(mapping, lock_id, output_path, source_path)
    if not os.path.isfile(output_path):
        raise EncryptionError(f"Built output for locked post {source_path} is missing: {output_path}")

    with open(output_path, "r", encoding="utf-8") as file:
        original_html = file.read()
    if PROTECTED_MARKER in original_html:
        validate_final_html(original_html, output_path)
        print(f"Validated existing encrypted post: {output_path}")
        return

    temp_output = f"{output_path}.enc"
    if os.path.exists(temp_output):
        os.remove(temp_output)
    try:
        try:
            subprocess.run(
                [
                    "npx",
                    "-y",
                    f"pagecrypt@{PAGECRYPT_VERSION}",
                    output_path,
                    temp_output,
                    password,
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
        except subprocess.CalledProcessError as error:
            raise EncryptionError(
                f"PageCrypt failed for {output_path} with exit code {error.returncode}."
            ) from error
        if not os.path.isfile(temp_output):
            raise EncryptionError(f"PageCrypt did not create {temp_output}.")
        with open(temp_output, "r", encoding="utf-8") as file:
            pagecrypt_html = file.read()

        raw_script, payload = extract_pagecrypt_parts(pagecrypt_html, temp_output)
        patched_script = patch_pagecrypt_script(raw_script)
        page_title = front_matter.get("title") or "受保护内容"
        final_html = replace_main(
            original_html,
            build_locked_main(page_title, payload),
            output_path,
        )
        final_html = insert_after_body_open(final_html, build_unlock_dialog(), output_path)
        final_html = insert_unlock_script(final_html, build_unlock_script(patched_script))
        validate_final_html(final_html, output_path)

        with open(temp_output, "w", encoding="utf-8") as file:
            file.write(final_html)
        os.replace(temp_output, output_path)
        print(f"Encrypted and validated: {output_path}")
    except Exception:
        if os.path.exists(temp_output):
            os.remove(temp_output)
        raise


def main():
    posts_dir = "_posts"
    if not os.path.isdir(posts_dir):
        raise EncryptionError(f"Posts directory is missing: {posts_dir}")

    locked_posts = []
    for name in sorted(os.listdir(posts_dir)):
        if not name.endswith((".md", ".markdown")):
            continue
        source_path = os.path.join(posts_dir, name)
        front_matter = parse_front_matter(source_path)
        if not is_locked(front_matter.get("locked")):
            continue
        description = str(front_matter.get("description") or "").strip()
        if not description:
            raise EncryptionError(f"Locked post {source_path} must define a non-empty description.")
        locked_posts.append((source_path, name, front_matter))

    if not locked_posts:
        print("No locked posts found; encryption validation passed.")
        return 0

    raw = os.environ.get("POST_PASSWORDS", "").strip()
    if not raw:
        raise EncryptionError("POST_PASSWORDS is required because locked posts exist.")
    try:
        mapping = json.loads(raw)
    except json.JSONDecodeError as error:
        raise EncryptionError(f"POST_PASSWORDS is not valid JSON: {error}") from error
    if not isinstance(mapping, dict):
        raise EncryptionError("POST_PASSWORDS must be a JSON object.")

    for source_path, name, front_matter in locked_posts:
        encrypt_post(source_path, name, front_matter, mapping)
    print(f"Encrypted and validated {len(locked_posts)} locked post(s).")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (EncryptionError, OSError, subprocess.CalledProcessError) as error:
        print(f"Encryption failed: {error}", file=sys.stderr)
        sys.exit(1)
