export interface StandardConnectFeature {
  connect: () => Promise<{
    accounts: Array<{
      publicKey: string;
      label?: string;
      chains?: string[];
    }>;
  }>;
}

export interface StandardDisconnectFeature {
  disconnect: () => Promise<void>;
}

export interface SignAndSendTransactionFeature {
  signAndSendTransaction: (transaction: unknown) => Promise<{ signature: string }>;
}

export interface SignTransactionsFeature {
  signTransactions: (transactions: unknown[]) => Promise<unknown[]>;
}

export interface SignTransactionFeature {
  signTransaction: (transaction: unknown) => Promise<unknown>;
}

export interface StandardWallet {
  name: string;
  icon: string;
  features: Record<string, unknown> & {
    'standard:connect': StandardConnectFeature;
    'standard:disconnect': StandardDisconnectFeature;
    'standard:events'?: {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      off: (event: string, listener: (...args: unknown[]) => void) => void;
    };
    'solana:signAndSendTransaction'?: SignAndSendTransactionFeature;
    'solana:signTransaction'?: SignTransactionFeature;
    'solana:signTransactions'?: SignTransactionsFeature;
  };
}

export interface WalletStateSnapshot {
  rpcEndpoint: string;
  availableWallets: StandardWallet[];
  standardWallet: StandardWallet | null;
  mwaSession: import('./mwa-session.svelte').MWASession | null;
  publicKey: import('@solana/web3.js').PublicKey | null;
  connected: boolean;
  connecting: boolean;
  useMWA: boolean;
  shortAddress: string;
}
