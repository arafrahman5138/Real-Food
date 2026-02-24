#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Ensure CocoaPods runs with Homebrew + clean Ruby gem environment.
unset GEM_HOME
unset GEM_PATH
unset RUBYOPT
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

npx expo run:ios --device "iPhone 15 Pro Max"
