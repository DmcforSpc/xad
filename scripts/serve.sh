#!/usr/bin/env bash
# 本地预览：此机 Ruby 装在 ~/.rubies/x64 且编译 prefix 与实际路径不符，
# 必须显式给出 LD_LIBRARY_PATH 与 RUBYLIB，否则 ruby 连 rubygems 都加载不到。
set -euo pipefail

RB="${RB:-$HOME/.rubies/x64}"
export LD_LIBRARY_PATH="$RB/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export RUBYLIB="$RB/lib/ruby/3.3.0:$RB/lib/ruby/3.3.0/x86_64-linux${RUBYLIB:+:$RUBYLIB}"
export PATH="$RB/bin:$PATH"

cd "$(dirname "$0")/.."
exec "$RB/bin/ruby" "$RB/bin/bundle" exec jekyll serve \
  --host 0.0.0.0 --port "${PORT:-4000}" --livereload "$@"
