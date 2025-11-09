import { browser } from '$app/environment';

export const MWA_PROTOCOL_VERSION = '2.0';

export const MWA_ERRORS = {
  AUTHORIZATION_FAILED: -1,
  INVALID_PAYLOADS: -2,
  NOT_SIGNED: -3,
  NOT_SUBMITTED: -4,
  NOT_CLONED: -5,
  TOO_MANY_PAYLOADS: -6,
  CHAIN_NOT_SUPPORTED: -7
} as const;

export const MWA_SUBPROTOCOLS = [
  'com.solana.mobilewalletadapter.v1',
  'com.solana.mobilewalletadapter.v1.base64'
] as const;

export interface MWAIdentity {
  uri?: string;
  icon?: string;
  name?: string;
}

export interface MWAAuthorizeParams {
  identity: MWAIdentity;
  chain?: string;
  features?: string[];
  addresses?: string[];
  auth_token?: string;
  cluster?: string;
}

export interface MWAAccount {
  address: string;
  display_address?: string;
  display_address_format?: string;
  label?: string;
  icon?: string;
  chains: string[];
  features?: string[];
}

export interface MWAAuthorizeResult {
  auth_token: string;
  accounts: MWAAccount[];
  wallet_uri_base?: string;
  wallet_icon?: string;
}

export interface MWASessionKeypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  token: string;
}

export interface MWASession {
  sessionId: string;
  publicKey: Uint8Array;
  sharedSecret: Uint8Array;
  sequenceNumber: number;
  authorized: boolean;
  authToken?: string;
}

export async function generateAssociationKeypair(): Promise<MWASessionKeypair> {
  if (!browser || !crypto?.subtle) {
    throw new Error('Web Crypto API not available');
  }

  const keypair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveKey', 'deriveBits']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keypair.publicKey);
  const x = base64UrlDecode(publicKeyJwk.x!);
  const y = base64UrlDecode(publicKeyJwk.y!);

  const publicKey = new Uint8Array(65);
  publicKey[0] = 0x04;
  publicKey.set(x, 1);
  publicKey.set(y, 33);

  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keypair.privateKey);
  const d = base64UrlDecode(privateKeyJwk.d!);

  const token = base64UrlEncode(publicKey);

  return {
    publicKey,
    privateKey: d,
    token
  };
}

export function generateLocalAssociationURI(associationToken: string, port: number): string {
  const params = new URLSearchParams({
    association: associationToken,
    port: port.toString(),
    v: MWA_PROTOCOL_VERSION
  });

  return `solana-wallet:/v1/associate/local?${params}`;
}

export function generateRemoteAssociationURI(
  associationToken: string,
  reflectorHost: string,
  reflectorId: string
): string {
  const params = new URLSearchParams({
    association: associationToken,
    reflector: reflectorHost,
    id: reflectorId,
    v: MWA_PROTOCOL_VERSION
  });

  return `solana-wallet:/v1/associate/remote?${params}`;
}

export async function deriveSharedSecret(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  associationPublicKey: Uint8Array
): Promise<Uint8Array> {
  if (!browser || !crypto?.subtle) {
    throw new Error('Web Crypto API not available');
  }

  const privateKeyObj = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: base64UrlEncode(privateKey),
      x: base64UrlEncode(peerPublicKey.slice(1, 33)),
      y: base64UrlEncode(peerPublicKey.slice(33, 65)),
      ext: true
    },
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    false,
    ['deriveBits']
  );

  const peerPublicKeyObj = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(peerPublicKey.slice(1, 33)),
      y: base64UrlEncode(peerPublicKey.slice(33, 65))
    },
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKeyObj
    },
    privateKeyObj,
    256
  );

  const ikm = new Uint8Array(sharedBits);
  const key = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const prk = await crypto.subtle.sign('HMAC', key, toBufferSource(associationPublicKey));

  return new Uint8Array(prk.slice(0, 16));
}

export async function encryptMessage(
  message: Uint8Array,
  sharedSecret: Uint8Array,
  sequenceNumber: number
): Promise<Uint8Array> {
  if (!browser || !crypto?.subtle) {
    throw new Error('Web Crypto API not available');
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const seqBytes = new Uint8Array(4);
  new DataView(seqBytes.buffer).setUint32(0, sequenceNumber, false);

  const key = await crypto.subtle.importKey(
    'raw',
    toBufferSource(sharedSecret),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: seqBytes,
      tagLength: 128
    },
    key,
    toBufferSource(message)
  );

  const result = new Uint8Array(4 + 12 + encrypted.byteLength);
  result.set(seqBytes, 0);
  result.set(iv, 4);
  result.set(new Uint8Array(encrypted), 16);

  return result;
}

export async function decryptMessage(
  encryptedMessage: Uint8Array,
  sharedSecret: Uint8Array,
  expectedSequenceNumber: number
): Promise<{ message: Uint8Array; sequenceNumber: number }> {
  if (!browser || !crypto?.subtle) {
    throw new Error('Web Crypto API not available');
  }

  const seqNumber = new DataView(encryptedMessage.buffer).getUint32(0, false);
  const iv = encryptedMessage.slice(4, 16);
  const ciphertext = encryptedMessage.slice(16);

  if (seqNumber !== expectedSequenceNumber) {
    throw new Error(
      `Invalid sequence number: expected ${expectedSequenceNumber}, got ${seqNumber}`
    );
  }

  const seqBytes = encryptedMessage.slice(0, 4);

  const key = await crypto.subtle.importKey(
    'raw',
    toBufferSource(sharedSecret),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: seqBytes,
      tagLength: 128
    },
    key,
    toBufferSource(ciphertext)
  );

  return {
    message: new Uint8Array(decrypted),
    sequenceNumber: seqNumber
  };
}

export function createJsonRpcRequest(method: string, params: unknown, id = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params
  });
}

export function parseJsonRpcResponse(message: string): {
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
} {
  return JSON.parse(message);
}

export function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

export function base64Decode(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64'));
  }

  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  return base64Decode(base64 + padding);
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
