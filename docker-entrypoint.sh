#!/bin/sh
# Make sure the persistent data dir is usable before we start, and fail with a
# readable message if it isn't (rather than a Node stack trace deep in startup).
set -e

CACHE_DIR="${CACHE_DIR:-/app/cache}"
mkdir -p "$CACHE_DIR" 2>/dev/null || true

if ! ( : > "$CACHE_DIR/.write-test" ) 2>/dev/null; then
  echo "--------------------------------------------------------------------" >&2
  echo "FATAL: $CACHE_DIR is not writable (running as uid $(id -u))." >&2
  echo "The app stores its database here and cannot start without it." >&2
  echo "TrueNAS: use an ix-volume (auto-created, writable) for /app/cache," >&2
  echo "or a Host Path on a dataset the app can write to." >&2
  echo "--------------------------------------------------------------------" >&2
  exit 1
fi
rm -f "$CACHE_DIR/.write-test"

exec "$@"
