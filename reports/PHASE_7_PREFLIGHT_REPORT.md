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
5. Enforcement: reserve Free operations at the background boundary, keep Pro unlimited, and enforce Pro-only `compressAfter`. **Implemented.**
6. UI: localized activation, Pro state, remaining usage, and live cooldown feedback. **Implemented.**
7. Quality/device policy: persisted quality selection and device-memory-aware size limits. **Implemented.**

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

## Runtime Enforcement

- Background authorization runs before creating or forwarding work to the offscreen runtime.
- Verified Pro licenses bypass local counters and the shared cooldown.
- Free compression and Split requests reserve their daily usage atomically before execution.
- Free `compressAfter` requests are rejected as Pro-only without consuming a Split allowance.
- Cooldown, daily-limit, and Pro-required denials use structured codes rendered as localized popup errors.
- Free users see a persistent inline Pro-required notice beside `compressAfter`; runtime denials are repeated beside the Split action.
- The license card shows current Free compression/Split allowances and a live shared-cooldown countdown; Pro displays unlimited operations.

## Browser Acceptance

- Production ES256 token activation and persistence after popup reload passed.
- Pro-only `compressAfter` completed on the Canon fixture with 11 parts and expected not-smaller fallbacks.
- Free Pro gating prevented work from starting and rendered the localized inline warning.
- The shared Free cooldown rejected an immediate operation and allowed it after the countdown.
- Free compression usage reached 0 of 3 remaining; the next attempt was rejected with `Free daily limit reached: 3 compressions per day.`
- Free usage counters remained visible and persisted across popup reloads.
- Compression quality set to 35% remained selected after the extension and popup were reloaded.
- With the existing Pro token reactivated, a real compression using the restored 35% quality completed successfully and produced a downloadable result despite the exhausted Free daily allowance.
- Pro operations bypassed Free limits without requiring a counter reset.

Stage 7 browser acceptance is complete.

## Quality and Device Policy

- Image quality is selectable from 10% through 100%, defaults to 60%, and is stored in `chrome.storage.local`.
- The selected quality is forwarded through background, offscreen, and Worker boundaries for normal compression.
- The same quality is applied when Pro `compressAfter` recompresses Split parts.
- Free PDF input is limited to 100 MiB.
- Pro PDF input is limited to 250 MiB on devices reporting at least 4 GB of memory.
- Devices reporting less than 4 GB are capped at 100 MiB for both tiers.
- Browsers without `navigator.deviceMemory` use the conservative 4 GB fallback.
- The active size policy is rechecked both when a PDF is selected and immediately before Compression or Split starts.

## Validation

- `npm run check`: passed.
- Stage 7 foundation, license-token, issuer, enforcement, and quality/device policy tests: passed.
- `npm run build`: passed.
