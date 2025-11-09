import { browser } from '$app/environment';
import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import { StandardConnect, StandardDisconnect, StandardEvents } from '@wallet-standard/features';
import {
	SolanaSignAndSendTransaction,
	SolanaSignTransaction
} from '@solana/wallet-standard-features';

import type { StandardWallet, WalletWithStandardCapabilities } from './types';

const FALLBACK_ICON =
	'data:image/svg+xml;base64,' +
	btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="#111827"/><path d="M16 18h16v-2H16v2Zm0 7h16v-2H16v2Zm0 7h16v-2H16v2Z" fill="white"/></svg>`
	);

function isSolanaWallet(wallet: Wallet): wallet is WalletWithStandardCapabilities {
	const features = wallet.features;
	if (!features) {
		return false;
	}

	const supportsSign =
		SolanaSignAndSendTransaction in features || SolanaSignTransaction in features;
	const supportsConnect = StandardConnect in features;
	const supportsDisconnect = StandardDisconnect in features;
	const supportsEvents = StandardEvents in features;
	const supportsSolanaChain = wallet.chains?.some((chain) => chain.startsWith('solana:'));

	return Boolean(
		supportsSign && supportsConnect && supportsDisconnect && supportsEvents && supportsSolanaChain
	);
}

function adaptWallet(wallet: Wallet): StandardWallet | null {
	if (!isSolanaWallet(wallet)) {
		return null;
	}

	return {
		name: wallet.name,
		icon: wallet.icon ?? FALLBACK_ICON,
		wallet
	};
}

export async function getStandardWallets(): Promise<StandardWallet[]> {
	if (!browser) {
		return [];
	}

	const detected: StandardWallet[] = [];
	const registered = getWallets().get();

	for (const wallet of registered) {
		const adapted = adaptWallet(wallet);
		if (adapted) {
			detected.push(adapted);
		}
	}

	return detected;
}

export function onWalletRegistered(callback: (wallet: StandardWallet) => void): () => void {
	if (!browser) {
		return () => {};
	}

	const wallets = getWallets();
	return wallets.on('register', (...newWallets) => {
		for (const wallet of newWallets) {
			const adapted = adaptWallet(wallet);
			if (adapted) {
				callback(adapted);
			}
		}
	});
}
