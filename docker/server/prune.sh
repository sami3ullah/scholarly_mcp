#!/bin/sh
# Build step: drops what the image never loads from node_modules. ONNX Runtime and sharp
# ship binaries for every platform; only Linux on the target architecture (glibc) stays.
# onnxruntime-web is the browser backend of transformers.js; its WebAssembly builds are
# never loaded in Node, which uses onnxruntime-node.
set -eu
case "$1" in
  amd64) arch=x64 ;;
  arm64) arch=arm64 ;;
  *) echo "Unsupported architecture: $1" >&2; exit 1 ;;
esac
store=node_modules/.pnpm
for bin in "$store"/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v6; do
  find "$bin" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +
  find "$bin/linux" -mindepth 1 -maxdepth 1 ! -name "$arch" -exec rm -rf {} +
done
rm -f "$store"/onnxruntime-web@*/node_modules/onnxruntime-web/dist/*.wasm
for img in "$store"/@img+sharp-*; do
  case "$img" in
    *"-linux-$arch@"*) ;;
    *) rm -rf "$img" ;;
  esac
done
