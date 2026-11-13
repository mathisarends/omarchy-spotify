#!/usr/bin/env bash
#
# Installs spoti and adds the Spotify widget to the Omarchy bar.
#
#   bash install.sh               spoti, then the plugin, then connecting
#   bash install.sh --spoti-only  only spoti (the panel's "Install spoti" button)
#   bash install.sh --connect     connect your Spotify account (the panel's "Connect Spotify" button)
#   bash install.sh --speaker     make this computer a Spotify Connect speaker with spotifyd
#
# spoti is pinned to one release and checked against its published checksums.

set -euo pipefail

SPOTI_VERSION="v0.2.0"
SPOTI_REPO="mathisarends/spoti"
PLUGIN_ID="mathisarends.spotify"
PLUGIN_URL="https://github.com/mathisarends/omarchy-spotify"
REDIRECT_URI="http://127.0.0.1:8888/callback"
BIN_DIR="${HOME}/.local/bin"
SPOTIFYD_CONF="${XDG_CONFIG_HOME:-${HOME}/.config}/spotifyd/spotifyd.conf"
work=""

mode="all"
for arg in "$@"; do
  case "$arg" in
    --spoti-only) mode="spoti" ;;
    --connect) mode="connect" ;;
    --speaker) mode="speaker" ;;
    -h | --help)
      sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

say() {
  printf '\033[1m%s\033[0m\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require() {
  for tool in "$@"; do
    command -v "$tool" >/dev/null 2>&1 || fail "$tool is required but not installed"
  done
}

# The terminal, even under `curl | bash` where stdin is this script.
has_tty() {
  (: </dev/tty) 2>/dev/null
}

ask() {
  local prompt="$1" answer=""
  has_tty || fail "this step needs a terminal; run: bash install.sh --${mode}"
  read -r -p "$prompt" answer </dev/tty
  printf '%s' "$answer"
}

spoti_bin() {
  if [[ -x "${BIN_DIR}/spoti" ]]; then
    echo "${BIN_DIR}/spoti"
  elif command -v spoti >/dev/null 2>&1; then
    command -v spoti
  else
    fail "spoti is not installed; run: bash install.sh --spoti-only"
  fi
}

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo amd64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) fail "no spoti build for $(uname -m); install it with: go install github.com/${SPOTI_REPO}@${SPOTI_VERSION}" ;;
  esac
}

installed_version() {
  if [[ -x "${BIN_DIR}/spoti" ]]; then
    "${BIN_DIR}/spoti" --version 2>/dev/null | grep -oE 'v?[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true
  fi
}

install_spoti() {
  local current
  current="$(installed_version)"
  if [[ -n "$current" && "v${current#v}" == "$SPOTI_VERSION" ]]; then
    say "spoti ${SPOTI_VERSION} is already installed"
    return
  fi

  require curl tar sha256sum
  local arch asset base
  arch="$(detect_arch)"
  asset="spoti_linux_${arch}.tar.gz"
  base="https://github.com/${SPOTI_REPO}/releases/download/${SPOTI_VERSION}"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT

  say "Downloading spoti ${SPOTI_VERSION} (${arch})"
  curl -fsSL -o "${work}/${asset}" "${base}/${asset}"
  curl -fsSL -o "${work}/checksums.txt" "${base}/checksums.txt"

  say "Verifying checksum"
  (cd "$work" && grep " ${asset}\$" checksums.txt | sha256sum --check --status) \
    || fail "checksum mismatch for ${asset}"

  tar -xzf "${work}/${asset}" -C "$work" spoti
  mkdir -p "$BIN_DIR"
  install -m 0755 "${work}/spoti" "${BIN_DIR}/spoti"
  say "Installed spoti to ${BIN_DIR}/spoti"

  case ":${PATH}:" in
    *":${BIN_DIR}:"*) ;;
    *) echo "Note: ${BIN_DIR} is not on your PATH. The widget still finds spoti there." ;;
  esac
}

# With `curl | bash`, stdin is this script. Hand omarchy the terminal so it can
# ask before installing and let you pick the bar section.
omarchy_with_terminal() {
  if has_tty; then
    omarchy "$@" </dev/tty
  else
    omarchy "$@" --yes
  fi
}

install_plugin() {
  require omarchy git
  if [[ -d "${HOME}/.config/omarchy/plugins/${PLUGIN_ID}" ]]; then
    say "The Spotify widget is already installed; updating it"
    omarchy_with_terminal plugin update "$PLUGIN_ID"
    return
  fi

  say "Adding the Spotify widget to the bar"
  omarchy_with_terminal plugin add "$PLUGIN_URL" --enable
}

connected() {
  "$1" auth status >/dev/null 2>&1
}

# spoti signs in with your own Spotify developer app (OAuth with PKCE, no
# client secret). Tokens are stored by spoti and refreshed on their own.
connect() {
  local spoti client_id
  spoti="$(spoti_bin)"
  if connected "$spoti"; then
    say "Spotify is already connected"
    return
  fi

  echo
  say "Connect Spotify"
  echo "spoti needs a Spotify app of your own. It takes a minute and is free:"
  echo
  echo "  1. Open https://developer.spotify.com/dashboard and choose \"Create app\"."
  echo "  2. Name and description: anything, for example \"Omarchy\"."
  echo "  3. Redirect URI: ${REDIRECT_URI}"
  echo "  4. Under \"Which API/SDKs are you planning to use?\" tick \"Web API\", then save."
  echo "  5. Copy the app's Client ID."
  echo
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "https://developer.spotify.com/dashboard" >/dev/null 2>&1 || true
  fi

  client_id="$(ask "Client ID: ")"
  client_id="${client_id//[[:space:]]/}"
  [[ "$client_id" =~ ^[A-Za-z0-9]{16,64}$ ]] || fail "that does not look like a Client ID"

  "$spoti" auth setup --client-id "$client_id" --redirect-uri "$REDIRECT_URI"
  say "Opening Spotify to sign in"
  "$spoti" auth login </dev/tty

  if connected "$spoti"; then
    say "Connected. Open the Spotify panel in the bar."
  else
    fail "sign-in did not finish; run: bash install.sh --connect"
  fi
}

# Optional: spotifyd plays Spotify on this computer without the desktop app.
# It shows up as a Spotify Connect device the panel can pick.
speaker() {
  require systemctl
  if ! command -v spotifyd >/dev/null 2>&1; then
    require pacman sudo
    say "Installing spotifyd"
    sudo pacman -S --needed --noconfirm spotifyd </dev/tty
  fi

  if [[ ! -e "$SPOTIFYD_CONF" ]]; then
    mkdir -p "$(dirname "$SPOTIFYD_CONF")"
    cat >"$SPOTIFYD_CONF" <<CONF
[global]
device_name = "$(hostname 2>/dev/null || echo Omarchy)"
device_type = "computer"
backend = "pulseaudio"
bitrate = 320
cache_path = "${XDG_CACHE_HOME:-${HOME}/.cache}/spotifyd"
volume_normalisation = true
CONF
    say "Wrote ${SPOTIFYD_CONF}"
  fi

  say "Signing spotifyd in to Spotify"
  echo "A browser window opens; sign in with the same account."
  spotifyd authenticate </dev/tty || fail "spotifyd could not sign in"

  systemctl --user enable spotifyd.service >/dev/null 2>&1 || true
  systemctl --user restart spotifyd.service
  say "spotifyd is running. Pick \"$(hostname 2>/dev/null || echo this computer)\" under the device row in the panel."
  echo "Tip: set it as the widget's preferred device so playback starts there."
}

case "$mode" in
  spoti)
    install_spoti
    ;;
  connect)
    connect
    ;;
  speaker)
    speaker
    ;;
  all)
    install_spoti
    install_plugin
    if has_tty; then
      connect
    else
      echo
      say "Next: connect Spotify"
      echo "Open the Spotify panel in the bar and choose \"Connect Spotify\"."
    fi
    ;;
esac

