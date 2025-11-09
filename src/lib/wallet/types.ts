import type { Address } from '@solana/kit';
import type { WalletAccount, WalletWithFeatures } from '@wallet-standard/base';
import type { WalletWithSolanaFeatures } from '@solana/wallet-standard-features';
import type {
	StandardConnectFeature,
	StandardDisconnectFeature,
	StandardEventsFeature
} from '@wallet-standard/features';

import type { MWASession } from './mwa-session.svelte';

export type WalletWithStandardCapabilities = WalletWithFeatures<
	| WalletWithSolanaFeatures['features']
	| StandardConnectFeature
	| StandardDisconnectFeature
	| StandardEventsFeature
>;

export interface StandardWallet {
	name: string;
	icon: string;
	wallet: WalletWithStandardCapabilities;
}

export interface WalletStateSnapshot {
	rpcEndpoint: string;
	availableWallets: StandardWallet[];
	standardWallet: StandardWallet | null;
	standardAccount: WalletAccount | null;
	mwaSession: MWASession | null;
	publicKey: Address | null;
	connected: boolean;
	connecting: boolean;
	useMWA: boolean;
	shortAddress: string;
}
