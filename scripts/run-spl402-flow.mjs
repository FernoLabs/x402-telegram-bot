#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

function printHelp() {
        const script = basename(process.argv[1] ?? 'run-spl402-flow.mjs');
        console.log(`Usage: node scripts/${script} --group <id> --message <text> [options]\n\n` +
                'Options:\n' +
                '  --api <url>            Base URL for the worker (default: http://127.0.0.1:8787)\n' +
                '  --group <id>           Group identifier to post the auction bid\n' +
                '  --message <text>       Message to include with the bid\n' +
                '  --from <address>       Sender address to embed in the SPL402 payload\n' +
                '  --signature <sig>      Transaction signature to embed in the SPL402 payload\n' +
                '  --timestamp <ms>       Unix timestamp in milliseconds (defaults to now)\n' +
                '  --amount <value>       Override the amount when resubmitting (defaults to the requirement)\n' +
                '  --wire <path>          Optional path to a base64 wire transaction to include\n' +
                '  --legacy               Also set legacy X-PAYMENT headers for debugging\n' +
                '  --submit               Immediately retry the auction call with the provided payment details\n' +
                '  --help                 Show this message\n');
}

function parseArgs(argv) {
        const args = {
                api: 'http://127.0.0.1:8787',
                group: null,
                message: null,
                from: null,
                signature: null,
                timestamp: null,
                amount: null,
                wireTransaction: null,
                legacy: false,
                submit: false
        };

        for (let i = 2; i < argv.length; i++) {
                const value = argv[i];
                switch (value) {
                        case '--api':
                                args.api = argv[++i];
                                break;
                        case '--group':
                                args.group = argv[++i];
                                break;
                        case '--message':
                                args.message = argv[++i];
                                break;
                        case '--from':
                                args.from = argv[++i];
                                break;
                        case '--signature':
                                args.signature = argv[++i];
                                break;
                        case '--timestamp':
                                args.timestamp = Number.parseInt(argv[++i], 10);
                                break;
                        case '--amount':
                                args.amount = Number.parseFloat(argv[++i]);
                                break;
                        case '--wire':
                                args.wireTransaction = argv[++i];
                                break;
                        case '--legacy':
                                args.legacy = true;
                                break;
                        case '--submit':
                                args.submit = true;
                                break;
                        case '--help':
                                args.help = true;
                                break;
                        default:
                                if (value.startsWith('-')) {
                                        throw new Error(`Unknown option: ${value}`);
                                }
                }
        }

        return args;
}

function ensure(value, message) {
        if (value === null || value === undefined || value === '') {
                throw new Error(message);
        }
        return value;
}

async function readWireTransaction(path) {
        if (!path) {
                return null;
        }

        const resolved = resolve(path);
        const content = await readFile(resolved, 'utf8');
        return content.trim();
}

async function requestAuction(baseUrl, body, headers = {}) {
        const url = new URL('/api/auctions', baseUrl);
        const response = await fetch(url, {
                method: 'POST',
                headers: {
                        'content-type': 'application/json',
                        ...headers
                },
                body: JSON.stringify(body)
        });

        let data = null;
        const text = await response.text();
        try {
                data = text ? JSON.parse(text) : null;
        } catch (error) {
                console.warn('Failed to parse JSON response', error);
        }

        return { status: response.status, headers: response.headers, data, raw: text };
}

function buildSpl402Payload(requirement, options) {
        const timestamp = Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
        const amount = Number.isFinite(options.amount) ? options.amount : requirement.amount;
        const payload = {
                spl402Version: 1,
                scheme: requirement.scheme,
                network: requirement.network,
                payload: {
                        from: ensure(options.from, 'Missing --from <address> for SPL402 payload'),
                        to: requirement.recipient,
                        amount,
                        signature: ensure(
                                options.signature,
                                'Missing --signature <signature> for SPL402 payload'
                        ),
                        timestamp
                }
        };

        if (requirement.mint) {
                payload.payload.mint = requirement.mint;
        }

        return payload;
}

function encodePaymentPayload(payload) {
        return JSON.stringify(payload);
}

function getLegacyHeaders(requirement, payload, options) {
        if (!options.legacy) {
                return {};
        }

        return {
                'x-payment-amount': String(payload.payload.amount),
                'x-payment-sender': payload.payload.from,
                'x-payment-txhash': payload.payload.signature,
                'x-payment-network': requirement.network
        };
}

async function main() {
        try {
                const args = parseArgs(process.argv);

                if (args.help) {
                        printHelp();
                        process.exit(0);
                }

                ensure(args.group, 'Missing required option --group <id>');
                ensure(args.message, 'Missing required option --message <text>');

                const body = {
                        groupId: args.group,
                        message: args.message
                };

                console.log('Requesting auction without payment headers...');
                const first = await requestAuction(args.api, body);

                console.log(`Response status: ${first.status}`);
                if (first.data) {
                        console.log('Response body:', JSON.stringify(first.data, null, 2));
                } else {
                        console.log(first.raw);
                }

                if (first.status !== 402) {
                        console.log('No payment required. Exiting.');
                        return;
                }

                const requirement = first.data?.paymentRequirement;
                if (!requirement) {
                        throw new Error('Unable to find SPL402 payment requirement in response');
                }

                console.log('\nSPL402 Requirement:');
                console.log(JSON.stringify(requirement, null, 2));

                if (!args.submit) {
                        console.log('\nRe-run with --submit, --from, and --signature once you have a confirmed transaction.');
                        return;
                }

                const payload = buildSpl402Payload(requirement, args);

                if (args.wireTransaction) {
                        const wire = await readWireTransaction(args.wireTransaction);
                        if (wire) {
                                payload.wireTransaction = wire;
                        }
                }

                const encodedPayload = encodePaymentPayload(payload);
                const headers = {
                        'x-payment': encodedPayload,
                        ...getLegacyHeaders(requirement, payload, args)
                };

                console.log('\nResubmitting with SPL402 proof...');
                const second = await requestAuction(args.api, body, headers);
                console.log(`Response status: ${second.status}`);
                if (second.data) {
                        console.log('Response body:', JSON.stringify(second.data, null, 2));
                } else {
                        console.log(second.raw);
                }
        } catch (error) {
                console.error(error instanceof Error ? error.message : error);
                process.exit(1);
        }
}

await main();
