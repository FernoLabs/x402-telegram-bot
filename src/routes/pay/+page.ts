import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

const sanitize = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseAmount = (value: string | null): number => {
  if (value === null) {
    throw error(400, 'Missing payment amount.');
  }

  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw error(400, 'Invalid payment amount.');
  }

  return parsed;
};

export const load: PageLoad = ({ url }) => {
  const amount = parseAmount(url.searchParams.get('amount'));
  const recipient = sanitize(url.searchParams.get('recipient'));

  if (!recipient) {
    throw error(400, 'Missing payment recipient.');
  }

  const currency = sanitize(url.searchParams.get('currency')) ?? 'USDC';
  const network = sanitize(url.searchParams.get('network')) ?? 'Solana';
  const group = sanitize(url.searchParams.get('group'));
  const memo = sanitize(url.searchParams.get('memo'));

  return {
    payment: {
      amount,
      recipient,
      currency,
      network,
      group,
      memo
    }
  };
};
