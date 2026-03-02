# macOS Build + Signing Guide

This guide is for building distributable macOS bundles for this repository (`Bablusheed`) with Tauri v2.

It is aligned with:
- Tauri v2 prerequisites and signing/notarization docs (last updated January 30, 2026)
- current repo scripts/workflow (`bun run tauri`, `.github/workflows/release.yml`)

## 1) Prerequisites

Install Xcode Command Line Tools:

```bash
xcode-select --install
xcode-select -p
```

Install Rust targets for universal builds:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
rustup target list --installed | grep apple-darwin
```

## 2) Apple Developer Setup

1. Join the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create a `Developer ID Application` certificate in your Apple Developer account.
3. Install the certificate in your login keychain.
4. Confirm your signing identity:

```bash
security find-identity -v -p codesigning
```

You should see an identity similar to:
`Developer ID Application: Your Name (TEAMID)`.

## 3) Notarization Credentials (Choose One)

Tauri supports two notarization credential methods.

### Option A: App Store Connect API key

Set:
- `APPLE_API_ISSUER`
- `APPLE_API_KEY` (Key ID)
- `APPLE_API_KEY_PATH` (path to `.p8` key file)

### Option B: Apple ID + app-specific password

Set:
- `APPLE_ID`
- `APPLE_PASSWORD` (app-specific password)
- `APPLE_TEAM_ID`

Generate app-specific passwords at [account.apple.com](https://account.apple.com/).

## 4) Local Build Env File

Create a local file (never commit):

```bash
cat > .env.build <<'EOF'
# Signing
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"

# Notarization (choose one approach)
# Option A: API key
# export APPLE_API_ISSUER="00000000-0000-0000-0000-000000000000"
# export APPLE_API_KEY="ABC123XYZ9"
# export APPLE_API_KEY_PATH="$HOME/.private_keys/AuthKey_ABC123XYZ9.p8"

# Option B: Apple ID + app-specific password
# export APPLE_ID="you@example.com"
# export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
# export APPLE_TEAM_ID="TEAMID1234"
EOF
```

Add to `.gitignore` if needed:

```bash
echo ".env.build" >> .gitignore
```

## 5) Build Commands (This Repo)

Load env vars:

```bash
source .env.build
```

Universal build (recommended for distribution):

```bash
bun run tauri build --target universal-apple-darwin
```

Single-arch builds:

```bash
bun run tauri build --target x86_64-apple-darwin
bun run tauri build --target aarch64-apple-darwin
```

Outputs are under:
- `src-tauri/target/universal-apple-darwin/release/bundle/macos/`
- `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`

## 6) Verify Signature + Gatekeeper + Stapling

```bash
codesign --verify --deep --strict --verbose=2 "src-tauri/target/universal-apple-darwin/release/bundle/macos/Bablusheed.app"
spctl --assess --type execute --verbose=4 "src-tauri/target/universal-apple-darwin/release/bundle/macos/Bablusheed.app"
xcrun stapler validate "src-tauri/target/universal-apple-darwin/release/bundle/macos/Bablusheed.app"
```

## 7) CI Notes (GitHub Actions)

This repo already uses `tauri-apps/tauri-action` in `.github/workflows/release.yml`.

For CI signing/notarization, set secrets and expose env vars in the `Build and upload Tauri bundles` step (same names as above). If using a `.p12` certificate in CI, Tauri also supports:
- `APPLE_CERTIFICATE` (Base64-encoded `.p12`)
- `APPLE_CERTIFICATE_PASSWORD`

## 8) Troubleshooting

No signing identity:

```bash
security find-identity -v -p codesigning
```

Notarization log lookup (Apple ID mode):

```bash
xcrun notarytool log <submission-id> --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_PASSWORD"
```

Notarization log lookup (API key mode):

```bash
xcrun notarytool log <submission-id> --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER"
```

## References

- [Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri v2 macOS Signing + Notarization](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri CLI build targets (including universal-apple-darwin)](https://docs.rs/crate/tauri-cli/latest/source/README.md)
- [Apple support: app-specific passwords](https://support.apple.com/en-ca/102654)
