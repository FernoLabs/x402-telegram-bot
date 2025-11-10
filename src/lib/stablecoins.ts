export interface StablecoinMetadata {
        code: string;
        name: string;
        symbol: string;
        decimals: number;
        defaultMint: string | null;
        aliases?: string[];
}

const STABLECOIN_DEFINITIONS: StablecoinMetadata[] = [
        {
                code: 'USDC',
                name: 'USD Coin',
                symbol: 'USDC',
                decimals: 6,
                defaultMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        },
        {
                code: 'USDT',
                name: 'Tether USDt',
                symbol: 'USDT',
                decimals: 6,
                defaultMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
        },
        {
                code: 'CASH',
                name: 'Phantom Cash',
                symbol: 'CASH',
                decimals: 6,
                defaultMint: 'CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH',
                aliases: ['PHANTOMCASH']
        },
        {
                code: 'PYUSD',
                name: 'PayPal USD',
                symbol: 'PYUSD',
                decimals: 6,
                defaultMint: '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
                aliases: ['PYSUDC']
        },
        {
                code: 'USDG',
                name: 'USDG',
                symbol: 'USDG',
                decimals: 6,
                defaultMint: '93Xc2WJDAHC4yyyZnkZSRmH1BidkFmRZ2Vqsx4zcuvYC'
        },
        {
                code: 'USDS',
                name: 'USDS',
                symbol: 'USDS',
                decimals: 9,
                defaultMint: '5UYTrS2FgQDACidvVPqPhxiT8vzUbScL194UvNmvTaPq'
        },
        {
                code: 'HYUSD',
                name: 'hyUSD',
                symbol: 'hyUSD',
                decimals: 6,
                defaultMint: null
        }
];

const METADATA_BY_CODE = new Map<string, StablecoinMetadata>();

for (const entry of STABLECOIN_DEFINITIONS) {
        METADATA_BY_CODE.set(entry.code, entry);
        if (entry.aliases) {
                for (const alias of entry.aliases) {
                        METADATA_BY_CODE.set(alias.toUpperCase(), entry);
                }
        }
}

export const SUPPORTED_STABLECOINS: StablecoinMetadata[] = STABLECOIN_DEFINITIONS;

export function getStablecoinMetadata(code: string | null | undefined): StablecoinMetadata | null {
        if (!code) {
                return null;
        }

        const normalized = code.trim().toUpperCase();
        if (!normalized) {
                return null;
        }

        return METADATA_BY_CODE.get(normalized) ?? null;
}

export function getSolanaMintAddressForCurrency(
        currencyCode: string | null | undefined,
        env?: Record<string, unknown>
): string | null {
        const metadata = getStablecoinMetadata(currencyCode);
        if (!metadata) {
                return null;
        }

        const possibleCodes = new Set<string>([metadata.code]);
        for (const alias of metadata.aliases ?? []) {
                possibleCodes.add(alias.toUpperCase());
        }

        for (const code of possibleCodes) {
                const envKey = `SOLANA_${code}_MINT_ADDRESS`;
                const override = env?.[envKey];
                if (typeof override === 'string') {
                        const trimmed = override.trim();
                        if (trimmed) {
                                return trimmed;
                        }
                }
        }

        return metadata.defaultMint;
}
