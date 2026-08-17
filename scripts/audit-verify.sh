#!/usr/bin/env bash
# 样式审计修复的构建验证（2026-08-17）：
#  1) 用 HEAD 版 _themes.scss 编译一次，再用当前重构版编译一次
#  2) 对两份产物做「排序后声明集合」对比 ——
#     重构等价 ⇔ 差异仅为 --dfs-acc-faint / --dfs-acc-invert 新增行（每模式 ×2 个媒体块）
# 结束后工作区恢复为重构版，_site 为重构版产物。
set -euo pipefail

RB="${RB:-$HOME/.rubies/x64}"
export LD_LIBRARY_PATH="$RB/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export RUBYLIB="$RB/lib/ruby/3.3.0:$RB/lib/ruby/3.3.0/x86_64-linux${RUBYLIB:+:$RUBYLIB}"
export PATH="$RB/bin:$PATH"
cd "$(dirname "$0")/.."

CSS=_site/assets/css/jekyll-theme-chirpy.css
norm() {
  tr '{};' '\n' <"$CSS" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort
}

cp _sass/redesign/_themes.scss /tmp/themes-new.scss
trap 'cp /tmp/themes-new.scss _sass/redesign/_themes.scss' EXIT

git show HEAD:_sass/redesign/_themes.scss > _sass/redesign/_themes.scss
"$RB/bin/ruby" "$RB/bin/bundle" exec jekyll build >/dev/null
norm > /tmp/decls-old.txt

cp /tmp/themes-new.scss _sass/redesign/_themes.scss
"$RB/bin/ruby" "$RB/bin/bundle" exec jekyll build >/dev/null
norm > /tmp/decls-new.txt

echo '=== 声明集合差异（预期只有 dfs-acc-faint / dfs-acc-invert 的新增行）==='
diff /tmp/decls-old.txt /tmp/decls-new.txt || true
echo '=== 两次构建均成功 ==='
