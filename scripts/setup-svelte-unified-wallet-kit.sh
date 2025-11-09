#!/bin/bash

# Svelte Unified Wallet Kit - Updated Setup Guidance
# --------------------------------------------------
# The project now relies on the @solana/kit toolchain instead of @solana/web3.js.
# This helper prints the minimal set of manual commands needed to scaffold a new
# SvelteKit app that mirrors the Kit-based architecture used in this repository.

set -e

YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_NAME="${1:-svelte-unified-wallet-kit}"

cat <<"INSTRUCTIONS"
${BLUE}╔════════════════════════════════════════════════════════════╗${NC}
${BLUE}║   Svelte Unified Wallet Kit - Manual Setup Instructions    ║${NC}
${BLUE}║   Target stack: SvelteKit + @solana/kit + Wallet Standard  ║${NC}
${BLUE}╚════════════════════════════════════════════════════════════╝${NC}

1. Create the SvelteKit project skeleton:

   npx sv create ${PROJECT_NAME} --template minimal --types ts --no-add-ons --no-install
   cd ${PROJECT_NAME}
   npm install

2. Install the Solana toolchain used by this repo:

   npm install @solana/kit @solana-program/system @solana-program/token @solana-program/memo \
     @wallet-standard/app @wallet-standard/base @wallet-standard/features @solana/wallet-standard-features bs58

3. Copy the wallet helpers from this repository (or adapt them as needed):

   - src/lib/wallet/mwa-protocol.ts
   - src/lib/wallet/mwa-session.svelte.ts
   - src/lib/wallet/standard-wallets.ts
   - src/lib/wallet/types.ts
   - src/lib/wallet/wallet.svelte.ts

4. Update your Vite configuration to provide Buffer/crypto polyfills when targeting
   the browser (see vite.config.ts in this repo for reference).

5. Run npm run check to verify the build:

   npm run check

This script no longer performs the automation directly to avoid installing the
legacy @solana/web3.js stack. Follow the steps above to align a fresh project
with the current Kit-first architecture.
INSTRUCTIONS
