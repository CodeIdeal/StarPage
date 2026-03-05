import type { CustomRepoData } from '../../types/star-repo';
import { getContentFile, updateContentFile, type DataFileLocation } from '../github/contents-api';

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((item) => item.trim()).filter(Boolean))).slice(0, 20);
}

function parseCustomRepoData(raw: string): CustomRepoData {
  const parsed = JSON.parse(raw) as Partial<CustomRepoData>;
  return {
    generated_at: typeof parsed.generated_at === 'string' ? parsed.generated_at : '',
    repos: Array.isArray(parsed.repos)
      ? parsed.repos
          .map((item) => ({
            id: Number((item as { id?: unknown }).id),
            tags: normalizeTags(Array.isArray((item as { tags?: unknown }).tags) ? ((item as { tags?: unknown }).tags as string[]) : []),
            remarks: typeof (item as { remarks?: unknown }).remarks === 'string' ? (item as { remarks?: string }).remarks!.trim() : ''
          }))
          .filter((item) => Number.isFinite(item.id))
      : []
  };
}

function applyCustomFields(source: CustomRepoData, repoId: number, tags: string[], remarks: string): CustomRepoData {
  const normalizedTags = normalizeTags(tags);
  const normalizedRemarks = remarks.trim();
  const index = source.repos.findIndex((repo) => repo.id === repoId);

  if (index < 0) {
    return {
      generated_at: new Date().toISOString(),
      repos: [...source.repos, { id: repoId, tags: normalizedTags, remarks: normalizedRemarks }]
    };
  }

  return {
    generated_at: new Date().toISOString(),
    repos: source.repos.map((repo) =>
      repo.id === repoId
        ? {
            id: repo.id,
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
}): Promise<CustomRepoData> {
  let attempt = 0;

  while (attempt < 2) {
    attempt += 1;

    const current = await getContentFile(params.location, params.token);
    const parsed = parseCustomRepoData(current.text);
    const updated = applyCustomFields(parsed, params.repoId, params.tags, params.remarks);

    try {
      await updateContentFile({
        location: params.location,
        token: params.token,
        sha: current.sha,
        content: `${JSON.stringify(updated, null, 2)}\n`,
        message: `chore(data): update custom fields for repo ${params.repoId}`
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
