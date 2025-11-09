import { browser } from '$app/environment';
import type { Transaction, VersionedTransaction } from '@solana/web3.js';
import * as MWA from './mwa-protocol';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export class MWASession {
  private ws: WebSocket | null = null;
  private associationKeypair: MWA.MWASessionKeypair | null = null;
  private sessionKeypair: CryptoKeyPair | null = null;
  private sharedSecret: Uint8Array | null = null;
  private sequenceNumberSent = 1;
  private sequenceNumberReceived = 1;
  private requestId = 1;
  private pendingRequests = new Map<number, PendingRequest>();

  authorized = false;
  authToken: string | null = null;
  accounts: MWA.MWAAccount[] = [];

  connecting = $state(false);
  connected = $state(false);
  error = $state<string | null>(null);

  async connect(
    uri: string,
    isLocal = false,
    associationKeypair?: MWA.MWASessionKeypair
  ): Promise<void> {
    if (this.connecting || this.connected) return;

    this.connecting = true;
    this.error = null;

    try {
      if (associationKeypair) {
        this.associationKeypair = associationKeypair;
      } else if (!this.associationKeypair) {
        this.associationKeypair = await MWA.generateAssociationKeypair();
      }

      this.sessionKeypair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      );

      const wsUrl = isLocal ? this.toLocalWsUrl(uri) : uri;
      this.ws = new WebSocket(wsUrl, Array.from(MWA.MWA_SUBPROTOCOLS));

      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (event) => this.handleError(event);
      this.ws.onclose = () => this.handleClose();

      if (isLocal && browser) {
        window.location.href = uri;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Connection failed';
      this.connecting = false;
      throw err;
    }
  }

  private toLocalWsUrl(uri: string): string {
    const portMatch = uri.match(/port=(\d+)/);
    const port = portMatch ? Number.parseInt(portMatch[1], 10) : 8080;
    return `ws://localhost:${port}/solana-wallet`;
  }

  private async handleOpen(): Promise<void> {
    if (!this.sessionKeypair) return;

    const publicKeyJwk = await crypto.subtle.exportKey('jwk', this.sessionKeypair.publicKey);
    const x = this.base64UrlDecode(publicKeyJwk.x!);
    const y = this.base64UrlDecode(publicKeyJwk.y!);

    const Qd = new Uint8Array(65);
    Qd[0] = 0x04;
    Qd.set(x, 1);
    Qd.set(y, 33);

    const signature = new Uint8Array(64);
    const helloReq = new Uint8Array(Qd.length + signature.length);
    helloReq.set(Qd, 0);
    helloReq.set(signature, Qd.length);

    this.ws?.send(helloReq);
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    const data = new Uint8Array(await event.data.arrayBuffer());

    if (!this.sharedSecret) {
      await this.handleHelloResponse(data);
      return;
    }

    await this.handleEncryptedMessage(data);
  }

  private async handleHelloResponse(data: Uint8Array): Promise<void> {
    if (!this.sessionKeypair || !this.associationKeypair) return;

    const Qw = data.slice(0, 65);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', this.sessionKeypair.privateKey);
    const d = this.base64UrlDecode(privateKeyJwk.d!);

    this.sharedSecret = await MWA.deriveSharedSecret(
      d,
      Qw,
      this.associationKeypair.publicKey
    );

    this.connected = true;
    this.connecting = false;
  }

  private async handleEncryptedMessage(data: Uint8Array): Promise<void> {
    if (!this.sharedSecret) return;

    const { message } = await MWA.decryptMessage(
      data,
      this.sharedSecret,
      this.sequenceNumberReceived
    );

    this.sequenceNumberReceived += 1;

    const text = new TextDecoder().decode(message);
    const response = MWA.parseJsonRpcResponse(text);

    if (response.result && typeof response.result === 'object' && response.result !== null) {
      const result = response.result as Partial<MWA.MWAAuthorizeResult> & {
        auth_token?: string;
        accounts?: MWA.MWAAccount[];
        signatures?: string[];
      };

      if (result.auth_token) {
        this.authToken = result.auth_token;
        this.accounts = result.accounts ?? [];
        this.authorized = true;
      }
    }

    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      if (response.error) {
        pending.reject(response.error);
      } else {
        pending.resolve(response.result);
      }
    }
  }

  async authorize(
    identity: MWA.MWAIdentity,
    chain = 'solana:mainnet'
  ): Promise<MWA.MWAAuthorizeResult> {
    const result = await this.sendRequest('authorize', {
      identity,
      chain
    });

    const payload = (result ?? {}) as MWA.MWAAuthorizeResult;
    this.authToken = payload.auth_token;
    this.accounts = payload.accounts ?? [];
    this.authorized = Boolean(payload.auth_token);
    return payload;
  }

  async signAndSendTransactions(
    transactions: (Transaction | VersionedTransaction)[]
  ): Promise<string[]> {
    if (!this.authorized) {
      throw new Error('MWA session is not authorized');
    }

    const payloads = transactions.map((tx) => MWA.base64Encode(tx.serialize()));
    const result = await this.sendRequest('sign_and_send_transactions', {
      payloads
    });

    const signatures = Array.isArray(result?.signatures)
      ? (result.signatures as string[])
      : Array.isArray(result)
        ? (result as string[])
        : [];

    return signatures;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.sharedSecret = null;
    this.authorized = false;
    this.authToken = null;
    this.accounts = [];
    this.sequenceNumberReceived = 1;
    this.sequenceNumberSent = 1;
    this.pendingRequests.clear();
    this.connected = false;
    this.connecting = false;
  }

  private async sendRequest(method: string, params: unknown): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.sharedSecret) {
      throw new Error('MWA session is not connected');
    }

    const id = this.requestId++;
    const request = MWA.createJsonRpcRequest(method, params, id);
    const message = new TextEncoder().encode(request);
    const encrypted = await MWA.encryptMessage(message, this.sharedSecret, this.sequenceNumberSent);
    this.sequenceNumberSent += 1;

    const responsePromise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('MWA request timed out'));
        }
      }, 20000);
    });

    this.ws.send(encrypted);
    return responsePromise;
  }

  private handleError(_event: Event): void {
    this.error = 'WebSocket error';
    this.connecting = false;
  }

  private handleClose(): void {
    this.connected = false;
    this.connecting = false;
    this.ws = null;
  }

  private base64UrlDecode(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const binaryString = atob(base64 + padding);
    return Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  }
}
