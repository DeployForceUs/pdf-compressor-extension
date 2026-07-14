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
3. Licensing: signed-token parsing and asymmetric verification with an embedded production public key supplied separately from the private issuer key. **Implemented, including activation/check/revoke background messaging.**
4. Issuance: a local-only CLI signs perpetual customer tokens with the encrypted private key and writes them mode `600`. **Implemented.**
5. Enforcement: reserve Free operations at the background boundary, keep Pro unlimited, and enforce Pro-only `compressAfter`.
6. UI: localized activation and Pro state. **Implemented.** Remaining usage and cooldown feedback are pending enforcement.
7. Quality/device policy: persisted quality selection and device-memory-aware size limits.

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

- The production ES256 public key is embedded with SHA-256 fingerprint `58c1a0d63b5f0ff8dcc0d14977d699446a45974f278492a4f3469f163fca9a42`; the encrypted private key remains outside the repository with the product owner.
- The token profile is ES256 with `iss=pdf-compressor`, `aud=pdf-compressor-extension`, `plan=pro`, `purchase=one-time`, `version=1`, a non-empty license ID in `sub`, and `iat`.
- Perpetual tokens must not contain `exp`; fingerprint/device-binding claims are rejected.
- Local-only counters cannot prevent a user from clearing extension storage; the MVP accepts this limitation because no server is used.

## License Messaging

- `license:activate` verifies a token before persistence and returns active/invalid state.
- `license:check` re-verifies the stored token on every call.
- `license:revoke` removes the stored token and returns inactive state.
- `monetization:state` reports `tier=pro` only after successful signature and claim verification.

## License Issuance

- `npm run license:issue -- --license-id <id>` runs locally and defaults to the encrypted private key under `~/.pdf-compressor-license`.
- The private-key passphrase is entered through a hidden TTY prompt and is never accepted as a command-line argument.
- Generated tokens are written under `~/.pdf-compressor-license/tokens` with mode `600` by default.
- `--passphrase-stdin` exists only for non-interactive automation and tests.

## License Activation UI

- The popup exposes a localized activation form and never persists an unverified token.
- A successful activation clears the token textarea and displays the verified license ID.
- Reopening the popup re-checks the stored signature and restores `Pro active` state.
- Deactivation removes the locally stored token and returns the popup to Free state.
