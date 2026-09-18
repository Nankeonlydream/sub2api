#!/bin/sh
set -eu

# Keep the executable in a writable volume so official in-app updates survive
# container recreation. Docker's restart policy handles application restarts.
release_dir=/app/creator-builds/official-release
mkdir -p "$release_dir"
if [ ! -d "$release_dir/resources" ]; then
    cp -R /app/resources "$release_dir/resources"
fi
if [ ! -f "$release_dir/sub2api" ]; then
    cp /app/sub2api "$release_dir/sub2api.tmp"
    chmod 700 "$release_dir/sub2api.tmp"
    mv "$release_dir/sub2api.tmp" "$release_dir/sub2api"
fi
cd "$release_dir"
exec "$release_dir/sub2api" "$@"
