import type { StarRepoData } from '../../types/star-repo';
import { getContentFile, updateContentFile, type DataFileLocation } from '../github/contents-api';

function applyCustomFields(
  source: StarRepoData,
  repoId: number,
  tags: string[],
  remarks: string
): StarRepoData {
  const normalizedTags = Array.from(new Set(tags.map((item) => item.trim()).filter(Boolean))).slice(0, 20);
  const normalizedRemarks = remarks.trim();
  const index = source.repos.findIndex((repo) => repo.id === repoId);

  if (index < 0) {
    return {
      ...source,
      repos: [
        ...source.repos,
        {
          id: repoId,
          full_name: '',
          owner: { avatar_url: '' },
          html_url: '',
          stargazers_count: 0,
          forks: 0,
          open_issues: 0,
          watchers: 0,
          description: '',
          homepage: '',
          updated_at: source.generated_at || new Date().toISOString(),
          license: null,
          topics: [],
          tags: normalizedTags,
          remarks: normalizedRemarks
        }
      ]
    };
  }

  return {
    ...source,
    repos: source.repos.map((repo) =>
      repo.id === repoId
        ? {
            ...repo,
            tags: normalizedTags,
            remarks: normalizedRemarks
          }
        : repo
    )
  };
}

export async function saveRepoCustomFields(params: {
  location: DataFileLocation;
  token: string;
  repoId: number;
  tags: string[];
  remarks: string;
}): Promise<StarRepoData> {
  let attempt = 0;

  while (attempt < 2) {
    attempt += 1;

    const current = await getContentFile(params.location, params.token);
    const parsed = JSON.parse(current.text) as StarRepoData;
    const updated = applyCustomFields(parsed, params.repoId, params.tags, params.remarks);

    try {
      await updateContentFile({
        location: params.location,
        token: params.token,
        sha: current.sha,
        content: `${JSON.stringify(updated, null, 2)}\n`,
        message: `chore(data): update tags/remarks for repo ${params.repoId}`
      });

      return updated;
    } catch (error) {
      if (attempt >= 2) {
        throw error;
      }
    }
  }

  throw new Error('Failed to update data.json after retry.');
}
