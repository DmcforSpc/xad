"""一次性验证：_themes.scss 重构（抽 dfs-chirpy-bridge）与 HEAD 版声明集合等价。
预期：每模式仅新增 --dfs-acc-faint / --dfs-acc-invert，零丢失零改值。跑完自删。"""

import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
old = subprocess.run(
    ['git', '-C', ROOT, 'show', 'HEAD:_sass/redesign/_themes.scss'],
    capture_output=True, text=True, check=True,
).stdout
with open(os.path.join(ROOT, '_sass/redesign/_themes.scss')) as f:
    new = f.read()


def decls(src, name):
    m = re.search(r'@mixin ' + name + r' \{(.*?)\n\}', src, re.S)
    body = re.sub(r'/\*.*?\*/', '', m.group(1), flags=re.S)
    out = {}
    for k, v in re.findall(r'(--[\w-]+|color-scheme)\s*:\s*([^;]+);', body):
        out[k] = re.sub(r'\s+', ' ', v).strip()
    return out


bridge = decls(new, 'dfs-chirpy-bridge')
ok = True
for mode in ('dfs-dark', 'dfs-light'):
    o = decls(old, mode)
    n = dict(bridge)
    n.update(decls(new, mode))
    added = sorted(set(n) - set(o))
    removed = sorted(set(o) - set(n))
    changed = sorted(k for k in set(o) & set(n) if o[k] != n[k])
    print(f'{mode}: 旧 {len(o)} 条 → 新 {len(n)} 条; 新增 {added}; 丢失 {removed}; 值变化 {changed}')
    if removed or changed or added != ['--dfs-acc-faint', '--dfs-acc-invert']:
        ok = False

print('等价性: ' + ('PASS（仅预期的两个新 token）' if ok else 'FAIL'))
os.remove(os.path.abspath(__file__))
sys.exit(0 if ok else 1)
