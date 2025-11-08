import type { PageLoad } from './$types';
import type { Group } from '$lib/types';

interface GroupsResponse {
  groups: Group[];
  loadError: boolean;
}

export const load: PageLoad<GroupsResponse> = async ({ fetch }) => {
  try {
    const response = await fetch('/api/groups');

    if (!response.ok) {
      console.error('Failed to fetch groups', response.status, response.statusText);
      return { groups: [], loadError: true };
    }

    const groups = (await response.json()) as Group[];
    return { groups, loadError: false };
  } catch (error) {
    console.error('Error loading groups', error);
    return { groups: [], loadError: true };
  }
};
