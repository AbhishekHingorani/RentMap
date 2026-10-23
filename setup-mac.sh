#!/bin/bash
# Sets up the rental map on a Mac and starts it. The Mac needs no Git and no Node.
# First time, paste this line into Terminal:
#   curl -fsSL https://raw.githubusercontent.com/AbhishekHingorani/RentMap/master/setup-mac.sh | bash
# After that, double-click "Rental Map" on the Desktop.
#
# Each run gets the newest code from GitHub. The app lives in ~/RentalMap:
#   node/         a private copy of Node. Nothing else on the Mac changes.
#   app/          the code from GitHub. Each run replaces it.
#   config.json   the Apps Script /exec URL. Each run copies it into app/.
#
# RENTAL_MAP_HOME sets another folder and PORT another port, for tests.
# Any arguments go to server.js, like --no-open.

# The whole script sits in main, so bash reads all of it before it runs a line.
# A cut-off download then runs nothing, and replacing app/ cannot change a running script.
main() {
  set -euo pipefail

  local app_home="${RENTAL_MAP_HOME:-$HOME/RentalMap}"
  local code_dir="$app_home/app"
  local node_dir="$app_home/node"
  local config="$app_home/config.json"
  local port="${PORT:-8790}"
  local zip_url="https://github.com/AbhishekHingorani/RentMap/archive/refs/heads/master.zip"
  local node_index="https://nodejs.org/dist/latest-v22.x"
  local shortcut="$HOME/Desktop/Rental Map.command"

  say "Rental map setup"
  mkdir -p "$app_home"

  # A map that already runs gets a new browser tab, not a second server.
  if curl -fs -m 2 "http://localhost:$port/api/config" >/dev/null 2>&1; then
    say "The rental map is already running. Opening it in the browser."
    open "http://localhost:$port"
    return 0
  fi

  get_node "$node_dir" "$node_index"
  get_code "$code_dir" "$zip_url"
  get_config "$config" "$port" "$node_dir/bin/node"
  cp "$config" "$code_dir/config.json"
  make_shortcut "$shortcut" "$app_home"

  say "Starting the rental map. Your browser opens it in a few seconds."
  say "Keep this window open while you use the map. Close it to stop the map."
  cd "$code_dir"
  PORT="$port" exec "$node_dir/bin/node" server.js "$@"
}

say() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nSetup stopped: %s\n' "$1" >&2
  printf 'Send a photo of this window to the person who gave you the map.\n' >&2
  exit 1
}

# Downloads Node 22 once. The checksum check refuses a broken or changed file.
get_node() {
  local node_dir="$1" node_index="$2"
  if [ -x "$node_dir/bin/node" ]; then
    return 0
  fi

  local arch
  case "$(uname -m)" in
    arm64) arch="arm64" ;;
    x86_64) arch="x64" ;;
    *) fail "this Mac has a $(uname -m) chip. The map needs an Apple or Intel chip." ;;
  esac

  say "Downloading Node (about 50 MB). This happens one time only."
  local sums line file sum tmp
  sums="$(curl -fsSL "$node_index/SHASUMS256.txt")" || fail "could not reach nodejs.org. Check the internet and run it again."
  line="$(printf '%s\n' "$sums" | grep -E "node-v[0-9.]+-darwin-$arch\.tar\.gz$" | head -n 1)"
  [ -n "$line" ] || fail "nodejs.org has no Node for this Mac."
  sum="${line%% *}"
  file="${line##* }"

  tmp="$(mktemp -d)"
  curl -fL --progress-bar -o "$tmp/$file" "$node_index/$file" || fail "the Node download broke. Check the internet and run it again."
  [ "$(shasum -a 256 "$tmp/$file" | cut -d ' ' -f 1)" = "$sum" ] || fail "the Node download is damaged. Run it again."

  rm -rf "$node_dir.new"
  mkdir -p "$node_dir.new"
  tar -xzf "$tmp/$file" -C "$node_dir.new" --strip-components 1
  rm -rf "$node_dir" "$tmp"
  mv "$node_dir.new" "$node_dir"
}

# Gets the newest code. Without internet, it keeps the code from the last run.
get_code() {
  local code_dir="$1" zip_url="$2"
  say "Getting the newest version of the map."
  local tmp
  tmp="$(mktemp -d)"
  if ! curl -fsSL -o "$tmp/code.zip" "$zip_url"; then
    rm -rf "$tmp"
    [ -f "$code_dir/server.js" ] || fail "could not download the map. Check the internet and run it again."
    say "No internet. Using the version from last time."
    return 0
  fi
  unzip -q "$tmp/code.zip" -d "$tmp"
  # GitHub puts the code in one folder, named like RentMap-master.
  local top
  top="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -f "$top/server.js" ] || fail "the download has no server.js."
  rm -rf "$code_dir"
  mv "$top" "$code_dir"
  rm -rf "$tmp"
}

# Asks for the Apps Script /exec URL the first time, and keeps it in config.json.
get_config() {
  local config="$1" port="$2" node="$3"
  if [ -f "$config" ]; then
    return 0
  fi

  say "The map needs its secret link. The person who gave you the map sends it to you."
  local url=""
  while true; do
    printf 'Paste the link here, then press Return: '
    read -r url </dev/tty || fail "could not read the link."
    # Drop spaces and line ends that come along with a paste.
    url="$(printf '%s' "$url" | tr -d '[:space:]')"
    case "$url" in
      https://script.google.com/macros/s/*/exec) break ;;
    esac
    printf 'That link does not look right. It starts with https://script.google.com/macros/s/ and ends with /exec. Try again.\n'
  done

  # JSON.stringify writes the URL with the right quotes and escapes.
  URL="$url" PORT_NUMBER="$port" "$node" -e '
    const config = { appsScriptUrl: process.env.URL, port: Number(process.env.PORT_NUMBER), geocoding: true };
    require("fs").writeFileSync(process.argv[1], JSON.stringify(config, null, 2) + "\n");
  ' "$config"
}

# Puts a "Rental Map" icon on the Desktop. A file made on this Mac has no download block,
# so a double-click runs it.
make_shortcut() {
  local shortcut="$1" app_home="$2"
  [ -d "$(dirname "$shortcut")" ] || return 0
  cat >"$shortcut" <<EOF
#!/bin/bash
# Starts the rental map. Made by setup-mac.sh.
RENTAL_MAP_HOME="$app_home" exec bash "$app_home/app/setup-mac.sh"
EOF
  chmod +x "$shortcut"
}

main "$@"
