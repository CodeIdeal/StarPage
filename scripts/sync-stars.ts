import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type NullableLicense = { key: string } | null;

interface StarRepo {
  id: number;
  full_name: string;
  owner: { avatar_url: string };
  html_url: string;
  stargazers_count: number;
  forks: number;
  open_issues: number;
  watchers: number;
  description: string;
  homepage: string;
  updated_at: string;
  license: NullableLicense;
  topics: string[];
  tags: string[];
  remarks: string;
}

interface StarRepoData {
  generated_at: string;
  repos: StarRepo[];
}

interface AppConfig {
  syncIntervalHours: number;
}

const ROOT = process.cwd();
const DATA_FILE = resolve(ROOT, 'src/assets/data.json');
const CONFIG_FILE = resolve(ROOT, 'config/star-page.config.json');

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function toRepo(raw: any): Omit<StarRepo, 'tags' | 'remarks'> {
  return {
    id: raw.id,
    full_name: raw.full_name,
    owner: { avatar_url: raw.owner?.avatar_url ?? '' },
    html_url: raw.html_url,
    stargazers_count: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    open_issues: raw.open_issues_count ?? 0,
    watchers: raw.watchers_count ?? 0,
    description: raw.description ?? '',
    homepage: raw.homepage ?? '',
    updated_at: raw.updated_at,
    license: raw.license?.key ? { key: raw.license.key } : null,
    topics: Array.isArray(raw.topics) ? raw.topics : []
  };
}

function shouldSkipByInterval(lastGeneratedAt: string, intervalHours: number): boolean {
  if (!lastGeneratedAt) {
    return false;
  }
  const last = new Date(lastGeneratedAt).getTime();
  if (Number.isNaN(last)) {
    return false;
  }
  const elapsedHours = (Date.now() - last) / (1000 * 60 * 60);
  return elapsedHours < intervalHours;
}

async function fetchAllStarred(token: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/user/starred?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub starred fetch failed: ${response.status} ${text}`);
    }

    const pageData = (await response.json()) as any[];
    if (pageData.length === 0) {
      break;
    }

    results.push(...pageData);
    page += 1;
  }

  return results;
}

async function main(): Promise<void> {
  const token = requiredEnv('GITHUB_PAT');
  const forceSync = process.env.FORCE_SYNC === 'true';

  const [rawData, rawConfig] = await Promise.all([
    readFile(DATA_FILE, 'utf8'),
    readFile(CONFIG_FILE, 'utf8')
  ]);

  const currentData = JSON.parse(rawData) as StarRepoData;
  const config = JSON.parse(rawConfig) as AppConfig;
  const interval = Number(config.syncIntervalHours) || 6;

  if (!forceSync && shouldSkipByInterval(currentData.generated_at, interval)) {
    console.log(`Skip sync: within ${interval}h interval.`);
    return;
  }

  const starred = await fetchAllStarred(token);
  const customById = new Map(
    currentData.repos.map((repo) => [repo.id, { tags: repo.tags ?? [], remarks: repo.remarks ?? '' }])
  );

  const merged: StarRepo[] = starred
    .map((item) => {
      const normalized = toRepo(item);
      const custom = customById.get(normalized.id) ?? { tags: [], remarks: '' };
      return {
        ...normalized,
        tags: custom.tags,
        remarks: custom.remarks
      };
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const nextData: StarRepoData = {
    generated_at: new Date().toISOString(),
    repos: merged
  };

  const next = `${JSON.stringify(nextData, null, 2)}\n`;
  if (next === rawData) {
    console.log('No data changes.');
    return;
  }

  await writeFile(DATA_FILE, next, 'utf8');
  console.log(`Updated ${DATA_FILE} with ${merged.length} repos.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
