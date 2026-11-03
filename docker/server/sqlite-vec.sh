#!/bin/sh
# Build step (ADR 0042): puts the sqlite-vec compiled in the image build, with its SIMD
# kernels, in place of the npm package's Linux build, which is scalar. Fails unless exactly
# one sqlite-vec platform package is installed and it is the version that was compiled, so
# the extension never changes version behind the lockfile.
#   sh docker/server/sqlite-vec.sh <arch: amd64|arm64> <version> <compiled vec0.so>
set -eu
case "$1" in
  amd64) arch=x64 ;;
  arm64) arch=arm64 ;;
  *) echo "Unsupported architecture: $1" >&2; exit 1 ;;
esac
version=$2
compiled=$3
set -- node_modules/.pnpm/sqlite-vec-linux-"$arch"@*/node_modules/sqlite-vec-linux-"$arch"
if [ "$#" -ne 1 ] || [ ! -f "$1/vec0.so" ]; then
  echo "Expected one sqlite-vec-linux-$arch package with vec0.so, found: $*" >&2
  exit 1
fi
installed=$(node -p "require('./$1/package.json').version")
if [ "$installed" != "$version" ]; then
  echo "sqlite-vec $installed is installed but $version was compiled" >&2
  exit 1
fi
cp "$compiled" "$1/vec0.so"
