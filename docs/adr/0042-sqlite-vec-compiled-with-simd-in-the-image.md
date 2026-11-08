# 0042 sqlite-vec compiled with SIMD in the image

- Status: accepted
- Date: 2026-11-03
- Builds on ADR 0037 (container image), ADR 0040 (vector scan by Euclidean distance), ADR 0041 (search on worker threads)

## Context

After ADR 0041 the server serves 19.4 tool calls a second on 2 vCPUs at p95 517 ms, CPU-bound, against the plan's 500 ms. In the Linux image the exact L2 scan over the full index takes 65 ms against 29 ms on macOS.

sqlite-vec 0.1.9 has NEON and AVX kernels for L2, behind `SQLITE_VEC_ENABLE_NEON` and `SQLITE_VEC_ENABLE_AVX`. Its Makefile sets them only when `uname -sm` is `Darwin arm64` or `Darwin x86_64`, and the release builds the npm Linux packages with that Makefile, so their `vec0.so` runs the scalar loop. The NEON int8 kernels also pass signed vectors to unsigned intrinsics, which clang accepts and GCC rejects unless given `-flax-vector-conversions`; the bits are the same (absolute differences), so the code is correct either way.

Measured in the arm64 image on the full index (176,536 chunks, 384 dimensions), top 50 by L2, median of 25 queries on 1 vCPU: npm build 65.8 ms, the same source compiled with NEON 32.5 ms.

## Decision

1. **The image compiles sqlite-vec from its pinned release.** A `sqlite-vec` build stage fetches the release's amalgamation (`sqlite-vec.c` and `sqlite-vec.h`) with `ADD --checksum=sha256:…`, installs gcc, libc headers and the SQLite extension headers from the Debian base, and compiles `vec0.so` with `-O3` plus, per `TARGETARCH`, `-DSQLITE_VEC_ENABLE_NEON -flax-vector-conversions` (arm64) or `-mavx -DSQLITE_VEC_ENABLE_AVX` (amd64). The source is not patched.
2. **It replaces the npm package's binary in place.** `docker/server/sqlite-vec.sh` copies the compiled `vec0.so` over the one in `sqlite-vec-linux-<arch>`, after checking that exactly one such package is installed and that its version is `SQLITE_VEC_VERSION`. The code is unchanged: `sqliteVec.load(db)` keeps resolving the platform package, in the server, the search workers and the ingest alike.
3. **The npm package stays the source everywhere else.** Local development, tests and CI outside the image use the npm binaries (NEON on macOS already).

## Consequences

- At 20 tool calls a second offered on 2 vCPUs, the full index serves 19.6 to 19.9 a second at p50 217 to 222 ms, p95 346 to 361 ms, p99 618 to 1,122 ms, with no `TIMEOUT` in three runs (before: 19.4 a second, p95 517 ms, 1 `TIMEOUT`). The 20-a-second target is met on SQLite.
- Results are unchanged: for 100 chunk vectors as queries, the top 50 from the scalar and the NEON build held the same chunks in the same order.
- The amd64 image needs a CPU with AVX, which every x86-64 server CPU since 2011 and every common cloud instance has; on one without it the extension fails to load (`SIGILL`). arm64 needs nothing beyond the base ISA.
- Bumping sqlite-vec means changing `SQLITE_VEC_VERSION` and the amalgamation checksum in the Dockerfile with the lockfile. A Dependabot bump alone fails the image build on the version check, so the image never runs a binary from a different release than the lockfile names.
- The supply chain gains one pinned, checksummed source download and three Debian build packages in a stage that does not ship; the runtime image still holds only the compiled `.so`. The build stage adds about 5 s.
