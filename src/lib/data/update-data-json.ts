import type { StarRepoData } from '../../types/star-repo';
import { getContentFile, updateContentFile, type DataFileLocation } from '../github/contents-api';

function applyCustomFields(
  source: StarRepoData,
  repoId: number,
  tags: string[],
  remarks: string
): StarRepoData {
  const normalizedTags = Array.from(new Set(tags.map((item) => item.trim()).filter(Boolean))).slice(0, 20);

  return {
    ...source,
    repos: source.repos.map((repo) =>
      repo.id === repoId
        ? {
            ...repo,
            tags: normalizedTags,
            remarks: remarks.trim()
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
