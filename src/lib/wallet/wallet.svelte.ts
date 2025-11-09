import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import {
  address as toAddress,
  getAddressDecoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  type Address,
  type Transaction
} from '@solana/kit';
import type { createSolanaRpc } from '@solana/kit';
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
  type SolanaTransactionCommitment
} from '@solana/wallet-standard-features';
import type { IdentifierString, WalletAccount } from '@wallet-standard/base';
import {
  StandardConnect,
  type StandardConnectFeature,
  StandardDisconnect,
  type StandardDisconnectFeature,
  StandardEvents,
  type StandardEventsFeature,
  type StandardEventsListeners
} from '@wallet-standard/features';
import bs58 from 'bs58';

import { getStandardWallets, onWalletRegistered } from './standard-wallets';
import { MWASession } from './mwa-session.svelte';
import * as MWA from './mwa-protocol';
import type { StandardWallet, WalletStateSnapshot } from './types';
import { waitForTransactionConfirmation } from './transaction-confirmation';

interface WalletState extends WalletStateSnapshot {
  standardAccount: WalletAccount | null;
}

type SolanaRpcClient = ReturnType<typeof createSolanaRpc>;

interface SendTransactionOptions {
  rpc?: SolanaRpcClient;
  commitment?: SolanaTransactionCommitment;
  skipPreflight?: boolean;
  maxRetries?: number;
  minContextSlot?: number;
  latestBlockhash?: {
    blockhash: string;
    lastValidBlockHeight: bigint | number;
  };
}

function resolveChainFromEndpoint(endpoint: string): IdentifierString {
  const normalized = endpoint.toLowerCase();
  if (normalized.includes('devnet')) {
    return 'solana:devnet' as IdentifierString;
  }
  if (normalized.includes('testnet')) {
    return 'solana:testnet' as IdentifierString;
  }
  if (normalized.includes('localhost') || normalized.includes('127.0.0.1')) {
    return 'solana:localnet' as IdentifierString;
  }
  return 'solana:mainnet' as IdentifierString;
}

const defaultState: WalletState = {
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  availableWallets: [],
  standardWallet: null,
  standardAccount: null,
  mwaSession: null,
  publicKey: null,
  connected: false,
  connecting: false,
  useMWA: false,
  shortAddress: ''
};

function computeShortAddress(key: Address | null): string {
  if (!key) return '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function createWalletStore() {
  const store = writable<WalletState>({ ...defaultState });
  let standardEventsOff: (() => void) | null = null;

  function setState(partial: Partial<WalletState>): void {
    store.update((state) => {
      const next = { ...state, ...partial } as WalletState;
      next.shortAddress = computeShortAddress(next.publicKey);
      return next;
    });
  }

  function clearStandardEventsListener(): void {
    if (standardEventsOff) {
      standardEventsOff();
      standardEventsOff = null;
    }
  }

  function applyStandardAccount(wallet: StandardWallet, account: WalletAccount | null): void {
    if (!account) {
      setState({
        standardWallet: null,
        standardAccount: null,
        publicKey: null,
        connected: false
      });
      if (browser) {
        localStorage.removeItem('lastConnectedWallet');
      }
      return;
    }

    const publicKey = toAddress(account.address);

    setState({
      standardWallet: wallet,
      standardAccount: account,
      mwaSession: null,
      publicKey,
      connected: true,
      connecting: false
    });

    if (browser) {
      localStorage.setItem('lastConnectedWallet', wallet.name);
    }
  }

  function watchStandardWallet(wallet: StandardWallet): void {
    clearStandardEventsListener();

    const features = wallet.wallet.features as Record<string, unknown>;
    const eventsFeature = features[StandardEvents] as
      | StandardEventsFeature[typeof StandardEvents]
      | undefined;
    if (!eventsFeature) {
      return;
    }

    const handler: StandardEventsListeners['change'] = (properties) => {
      if ('accounts' in properties) {
        const account = wallet.wallet.accounts[0] ?? null;
        applyStandardAccount(wallet, account);
      }
    };

    standardEventsOff = eventsFeature.on('change', handler);
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

    onWalletRegistered((wallet) => {
      setState({ availableWallets: [...get(store).availableWallets, wallet] });
    });
  }

  async function connectStandard(wallet: StandardWallet): Promise<void> {
    setState({ connecting: true });

    clearStandardEventsListener();

    const current = get(store);
    if (current.mwaSession) {
      current.mwaSession.disconnect();
    }

    try {
      const features = wallet.wallet.features as Record<string, unknown>;
      if (!wallet.wallet.accounts.length) {
        const connectFeature = features[StandardConnect] as
          | StandardConnectFeature[typeof StandardConnect]
          | undefined;
        if (!connectFeature) {
          throw new Error('Wallet does not support standard:connect');
        }
        await connectFeature.connect();
      }

      const account = wallet.wallet.accounts[0] ?? null;
      if (!account) {
        throw new Error('Wallet did not return an account');
      }

      applyStandardAccount(wallet, account);
      watchStandardWallet(wallet);
    } catch (error) {
      clearStandardEventsListener();
      setState({ connecting: false });
      throw error;
    }
  }

  async function connectMWA(appName: string, appUrl: string): Promise<void> {
    setState({ connecting: true });

    try {
      const current = get(store);
      if (current.standardWallet) {
      const currentFeatures = current.standardWallet.wallet.features as Record<string, unknown>;
      const disconnectFeature = currentFeatures[StandardDisconnect] as
        | StandardDisconnectFeature[typeof StandardDisconnect]
        | undefined;
      if (disconnectFeature) {
        try {
          await disconnectFeature.disconnect();
        } catch (error) {
          console.warn('Failed to disconnect existing wallet', error);
        }
        }
      }

      clearStandardEventsListener();

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
      const publicKey = getAddressDecoder().decode(publicKeyBytes);

      setState({
        standardWallet: null,
        standardAccount: null,
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
      const stateFeatures = state.standardWallet.wallet.features as Record<string, unknown>;
      const disconnectFeature = stateFeatures[StandardDisconnect] as
        | StandardDisconnectFeature[typeof StandardDisconnect]
        | undefined;
      if (disconnectFeature) {
        try {
          await disconnectFeature.disconnect();
        } catch (err) {
          console.warn('Failed to disconnect wallet', err);
        }
      }
    }

    clearStandardEventsListener();

    if (state.mwaSession) {
      state.mwaSession.disconnect();
    }

    setState({
      standardWallet: null,
      standardAccount: null,
      mwaSession: null,
      publicKey: null,
      connected: false
    });

    if (browser) {
      localStorage.removeItem('lastConnectedWallet');
    }
  }

  async function sendTransaction(
    transaction: Transaction,
    options: SendTransactionOptions = {}
  ): Promise<string> {
    const state = get(store);

    if (state.standardWallet && state.standardAccount) {
      const { wallet } = state.standardWallet;
      const account = state.standardAccount;
      const serialized = getTransactionEncoder().encode(transaction);
      const serializedBytes =
        serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
      const chain = resolveChainFromEndpoint(state.rpcEndpoint);

      if (
        SolanaSignAndSendTransaction in wallet.features &&
        account.features.includes(SolanaSignAndSendTransaction)
      ) {
        const feature = wallet.features[
          SolanaSignAndSendTransaction
        ] as
          | SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction]
          | undefined;
        if (!feature) {
          throw new Error('Connected wallet does not expose solana:signAndSendTransaction.');
        }
        const featureMaxRetries = options.maxRetries;
        const featureMinContextSlot = options.minContextSlot;

        const [result] = await feature.signAndSendTransaction({
          account,
          chain,
          transaction: serializedBytes,
          options: {
            commitment: options.commitment,
            skipPreflight: options.skipPreflight,
            maxRetries: featureMaxRetries,
            minContextSlot: featureMinContextSlot
          }
        });

        const signatureBytes = result?.signature;
        if (!signatureBytes) {
          throw new Error('Wallet did not return a transaction signature');
        }

        const signature = bs58.encode(signatureBytes);

        if (options.rpc && options.latestBlockhash) {
          await waitForTransactionConfirmation({
            rpc: options.rpc,
            signature,
            latestBlockhash: {
              blockhash: options.latestBlockhash.blockhash,
              lastValidBlockHeight: BigInt(options.latestBlockhash.lastValidBlockHeight)
            },
            commitment: options.commitment ?? 'confirmed'
          });
        }

        return signature;
      }

      if (SolanaSignTransaction in wallet.features && account.features.includes(SolanaSignTransaction)) {
        const feature = wallet.features[SolanaSignTransaction] as
          | SolanaSignTransactionFeature[typeof SolanaSignTransaction]
          | undefined;
        if (!feature) {
          throw new Error('Connected wallet does not expose solana:signTransaction.');
        }
        const featureMaxRetries = options.maxRetries;
        const featureMinContextSlot = options.minContextSlot;
        const [result] = await feature.signTransaction({
          account,
          chain,
          transaction: serializedBytes,
          options: {
            preflightCommitment: options.commitment,
            minContextSlot: featureMinContextSlot
          }
        });

        const signedBytes = result?.signedTransaction;
        if (!signedBytes) {
          throw new Error('Wallet did not return a signed transaction');
        }

        if (!options.rpc) {
          throw new Error('An RPC client is required to send signed transactions');
        }

        const signedTransaction = getTransactionDecoder().decode(signedBytes);
        const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);
        const rpcMaxRetries =
          options.maxRetries === undefined ? undefined : BigInt(options.maxRetries);
        const rpcMinContextSlot =
          options.minContextSlot === undefined ? undefined : BigInt(options.minContextSlot);
        const signature = await options.rpc
          .sendTransaction(wireTransaction, {
            encoding: 'base64',
            skipPreflight: options.skipPreflight,
            maxRetries: rpcMaxRetries,
            minContextSlot: rpcMinContextSlot,
            preflightCommitment: options.commitment
          })
          .send();
        const signatureString = signature as string;

        if (options.latestBlockhash) {
          await waitForTransactionConfirmation({
            rpc: options.rpc,
            signature: signatureString,
            latestBlockhash: {
              blockhash: options.latestBlockhash.blockhash,
              lastValidBlockHeight: BigInt(options.latestBlockhash.lastValidBlockHeight)
            },
            commitment: options.commitment ?? 'confirmed'
          });
        }

        return signatureString;
      }

      throw new Error('Connected wallet does not support sending transactions');
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
      rpcEndpoint: state.rpcEndpoint,
      availableWallets: state.availableWallets,
      standardWallet: state.standardWallet,
      mwaSession: state.mwaSession,
      publicKey: state.publicKey,
      connected: state.connected,
      connecting: state.connecting,
      useMWA: state.useMWA,
      shortAddress: state.shortAddress,
      standardAccount: state.standardAccount ?? null
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
