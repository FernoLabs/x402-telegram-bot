import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import { PublicKey, Transaction, VersionedTransaction, Connection } from '@solana/web3.js';
import { getStandardWallets } from './standard-wallets';
import { MWASession } from './mwa-session.svelte';
import * as MWA from './mwa-protocol';
import type { StandardWallet, WalletStateSnapshot } from './types';

interface WalletState {
  rpcEndpoint: string;
  availableWallets: StandardWallet[];
  standardWallet: StandardWallet | null;
  mwaSession: MWASession | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  useMWA: boolean;
  shortAddress: string;
}

const defaultState: WalletState = {
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  availableWallets: [],
  standardWallet: null,
  mwaSession: null,
  publicKey: null,
  connected: false,
  connecting: false,
  useMWA: false,
  shortAddress: ''
};

function computeShortAddress(key: PublicKey | null): string {
  if (!key) return '';
  const value = key.toBase58();
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function createWalletStore() {
  const store = writable<WalletState>({ ...defaultState });

  function setState(partial: Partial<WalletState>): void {
    store.update((state) => {
      const next = { ...state, ...partial } as WalletState;
      next.shortAddress = computeShortAddress(next.publicKey);
      return next;
    });
  }

  async function initialize(rpcEndpoint: string): Promise<void> {
    setState({ rpcEndpoint });

    if (!browser) {
      return;
    }

    const useMWA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setState({ useMWA });

    const wallets = await getStandardWallets();
    setState({ availableWallets: wallets });

    const lastWallet = localStorage.getItem('lastConnectedWallet');
    if (lastWallet) {
      const existing = wallets.find((wallet) => wallet.name === lastWallet);
      if (existing) {
        try {
          await connectStandard(existing);
        } catch (error) {
          console.warn('Failed to restore wallet connection', error);
          localStorage.removeItem('lastConnectedWallet');
        }
      }
    }
  }

  async function connectStandard(wallet: StandardWallet): Promise<void> {
    setState({ connecting: true });

    try {
      const result = await wallet.features['standard:connect'].connect();
      const account = result.accounts[0];
      const publicKey = new PublicKey(account.publicKey);

      setState({
        standardWallet: wallet,
        mwaSession: null,
        publicKey,
        connected: true,
        connecting: false
      });

      if (browser) {
        localStorage.setItem('lastConnectedWallet', wallet.name);
      }
    } catch (error) {
      setState({ connecting: false });
      throw error;
    }
  }

  async function connectMWA(appName: string, appUrl: string): Promise<void> {
    setState({ connecting: true });

    try {
      const session = new MWASession();
      const port = 49152 + Math.floor(Math.random() * 16384);
      const association = await MWA.generateAssociationKeypair();
      const uri = MWA.generateLocalAssociationURI(association.token, port);

      await session.connect(uri, true, association);

      const result = await session.authorize({
        name: appName,
        uri: appUrl
      });

      const firstAccount = result.accounts?.[0];
      if (!firstAccount) {
        throw new Error('Wallet did not return an account');
      }

      const publicKeyBytes = MWA.base64Decode(firstAccount.address);
      const publicKey = new PublicKey(publicKeyBytes);

      setState({
        standardWallet: null,
        mwaSession: session,
        publicKey,
        connected: true,
        connecting: false
      });

      if (browser) {
        localStorage.removeItem('lastConnectedWallet');
      }
    } catch (error) {
      setState({ connecting: false });
      throw error;
    }
  }

  async function disconnect(): Promise<void> {
    const state = get(store);

    if (state.standardWallet) {
      try {
        await state.standardWallet.features['standard:disconnect'].disconnect();
      } catch (err) {
        console.warn('Failed to disconnect wallet', err);
      }
    }

    if (state.mwaSession) {
      state.mwaSession.disconnect();
    }

    setState({
      standardWallet: null,
      mwaSession: null,
      publicKey: null,
      connected: false
    });

    if (browser) {
      localStorage.removeItem('lastConnectedWallet');
    }
  }

  async function sendTransaction(
    transaction: Transaction | VersionedTransaction,
    connection: Connection
  ): Promise<string> {
    const state = get(store);

    if (state.standardWallet) {
      const feature = state.standardWallet.features['solana:signAndSendTransaction'];
      if (!feature) {
        throw new Error('Connected wallet cannot sign and send transactions');
      }

      const response = await feature.signAndSendTransaction(transaction);
      return response.signature;
    }

    if (state.mwaSession) {
      const signatures = await state.mwaSession.signAndSendTransactions([transaction]);
      if (!signatures[0]) {
        throw new Error('Mobile wallet did not return a signature');
      }
      return signatures[0];
    }

    throw new Error('No wallet connected');
  }

  function snapshot(): WalletStateSnapshot {
    const state = get(store);
    return {
      ...state
    };
  }

  return {
    subscribe: store.subscribe,
    initialize,
    connectStandard,
    connectMWA,
    disconnect,
    sendTransaction,
    snapshot
  };
}

export const wallet = createWalletStore();
