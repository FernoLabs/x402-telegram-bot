import type { PageServerLoad } from './$types';

export const load = (async ({ platform }) => {
        const env = platform?.env;

        return {
                botHandle: env?.TELEGRAM_BOT_USERNAME ?? null,
                botId: env?.TELEGRAM_BOT_ID ?? null
        };
}) satisfies PageServerLoad;
