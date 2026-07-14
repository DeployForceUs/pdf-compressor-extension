# Stage 7 Freemium and Licensing Preflight

## Approved MVP Decisions

- Pro is a perpetual one-time purchase priced at USD 29.
- Activation uses a signed license token.
- License verification uses asymmetric signatures: the extension contains only the public key; the private key never ships in extension code.
- Pro licenses are not bound to a device fingerprint.
- The fingerprint is used only for local Free usage counters.
- The MVP has no License Server and no 90-day offline grace period.
- Free users receive 3 compression operations and 10 Split operations per UTC day.
- A shared 10-second cooldown applies between metered operations.

## Existing Integration Points

- Compression starts at `background:compression-start` and is forwarded to the offscreen runtime.
- Split starts at `split:local` and already carries the Pro-only `compressAfter` option.
- The popup already renders `compressAfter` as a Pro-labelled control, but entitlement enforcement is not implemented.
- No existing monetization, license storage, limit storage, or entitlement service exists.

## Implementation Slices

1. Foundation: approved policy constants, privacy-scoped fingerprint hashing, and atomic local usage reservation.
2. Persistence: a `chrome.storage.local` adapter and background messaging for current entitlement/usage state. **Implemented.**
3. Licensing: signed-token parsing and asymmetric verification with an embedded production public key supplied separately from the private issuer key.
4. Enforcement: reserve Free operations at the background boundary, keep Pro unlimited, and enforce Pro-only `compressAfter`.
5. UI: localized activation, remaining usage, cooldown feedback, and Pro state.
6. Quality/device policy: persisted quality selection and device-memory-aware size limits.

## Foundation Safety Properties

- Limit check and increment are a single serialized reservation operation.
- Compression and Split share the same cooldown timestamp.
- A rejected operation does not increment a counter.
- Daily counters reset on the next UTC date.
- Fingerprints never participate in Pro license validation.
- The foundation does not modify compression, Split, persistence, worker, or popup behavior.
- `monetization:state` exposes Free policy and remaining usage without exposing the stored fingerprint.
- Invalid or outdated stored counter shapes are discarded and recreated through the versioned foundation contract.

## Deferred Inputs

- The production public key and issuer tooling are not invented in the repository.
- The token claim schema will be fixed before the licensing slice and must support perpetual licenses without device binding.
- Local-only counters cannot prevent a user from clearing extension storage; the MVP accepts this limitation because no server is used.
