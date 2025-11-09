import type { PageLoad } from './$types';
import type { Group } from '$lib/types';

interface SendPageData {
	groups: Group[];
	loadError: boolean;
	preselectedGroupId: number | null;
}

function parseGroupId(param: string | null): number | null {
	if (!param) {
		return null;
	}

	const parsed = Number.parseInt(param, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export const load: PageLoad<SendPageData> = async ({ fetch, url }) => {
	const requestedGroupId = parseGroupId(url.searchParams.get('groupId'));

	try {
		const response = await fetch('/api/groups');
		if (!response.ok) {
			console.error('Failed to fetch groups', response.status, response.statusText);
			return { groups: [], loadError: true, preselectedGroupId: requestedGroupId };
		}

		const groups = (await response.json()) as Group[];
		return { groups, loadError: false, preselectedGroupId: requestedGroupId };
	} catch (error) {
		console.error('Error loading groups', error);
		return { groups: [], loadError: true, preselectedGroupId: requestedGroupId };
	}
};
