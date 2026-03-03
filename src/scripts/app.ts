import { requestDeviceCode, pollForAccessToken } from '../lib/auth/github-device-flow';
import { getToken, setToken, clearToken, validateOwnerToken } from '../lib/auth/session';
import { saveRepoCustomFields } from '../lib/data/update-data-json';
import type { StarRepo, StarRepoData } from '../types/star-repo';

const OWNER_LOGIN = import.meta.env.PUBLIC_GITHUB_OWNER_LOGIN;
const CLIENT_ID = import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID;
const THEME_STORAGE_KEY = 'starpage-theme';
const DARK_THEME = 'starpage';
const LIGHT_THEME = 'starpage-light';
const DATA_LOCATION = {
  owner: import.meta.env.PUBLIC_GITHUB_DATA_REPO_OWNER || OWNER_LOGIN,
  repo: import.meta.env.PUBLIC_GITHUB_DATA_REPO_NAME,
  path: import.meta.env.PUBLIC_GITHUB_DATA_FILE_PATH || 'src/assets/data.json',
  branch: import.meta.env.PUBLIC_GITHUB_DATA_BRANCH || 'main'
};

const initialDataEl = document.getElementById('initial-data');
const initialData = JSON.parse(initialDataEl?.textContent || '{"generated_at":"","repos":[]}') as StarRepoData;

const state = {
  data: initialData,
  search: '',
  sort: 'updated_desc',
  topic: 'all',
  tag: 'all',
  ownerAuthorized: false,
  token: null as string | null,
  editCache: new Map<number, { tags: string; remarks: string }>()
};

const searchEl = document.getElementById('search') as HTMLInputElement | null;
const sortEl = document.getElementById('sort') as HTMLSelectElement | null;
const topicFilterEl = document.getElementById('topic-filter') as HTMLSelectElement | null;
const tagsEl = document.getElementById('tags') as HTMLDivElement | null;
const topicsEl = document.getElementById('topics') as HTMLDivElement | null;
const cardsEl = document.getElementById('cards-grid') as HTMLDivElement | null;
const authBtn = document.getElementById('auth-btn') as HTMLButtonElement | null;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement | null;
const authStatusEl = document.getElementById('auth-status') as HTMLDivElement | null;
const deviceFlowEl = document.getElementById('device-flow') as HTMLDivElement | null;
const themeToggleEl = document.getElementById('theme-toggle') as HTMLButtonElement | null;

function text(v: unknown): string {
  return String(v || '').toLowerCase();
}

function normalizeTheme(value: string | null): string | null {
  if (value === DARK_THEME || value === LIGHT_THEME) return value;
  return null;
}

function resolveInitialTheme(): string {
  const stored = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  if (stored) return stored;
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return DARK_THEME;
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return LIGHT_THEME;
  return DARK_THEME;
}

function updateThemeToggle(theme: string): void {
  if (!themeToggleEl) return;

  const isDark = theme === DARK_THEME;
  const icon = themeToggleEl.querySelector('span[aria-hidden="true"]');
  const label = themeToggleEl.querySelector('span:not([aria-hidden])');

  if (icon) icon.textContent = isDark ? '夜' : '昼';
  if (label) label.textContent = isDark ? '深色' : '浅色';

  themeToggleEl.setAttribute('aria-pressed', String(!isDark));
  themeToggleEl.setAttribute('title', isDark ? '切换到浅色模式' : '切换到深色模式');
}

function applyTheme(theme: string): void {
  const targetTheme = normalizeTheme(theme) || DARK_THEME;
  document.documentElement.dataset.theme = targetTheme;
  updateThemeToggle(targetTheme);
}

function toggleTheme(): void {
  const current = normalizeTheme(document.documentElement.dataset.theme || null) || DARK_THEME;
  const next = current === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  applyTheme(next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
}

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${Math.round(value / 1000)}K`;
}

function formatTimeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (diffMs <= 0) return 'just now';

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diffMs < hour) {
    const m = Math.max(1, Math.floor(diffMs / minute));
    return `${m} minute${m > 1 ? 's' : ''} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / hour);
    return `${h} hour${h > 1 ? 's' : ''} ago`;
  }
  if (diffMs < week) {
    const d = Math.floor(diffMs / day);
    return `${d} day${d > 1 ? 's' : ''} ago`;
  }
  if (diffMs < month) {
    const w = Math.floor(diffMs / week);
    return `${w} week${w > 1 ? 's' : ''} ago`;
  }
  if (diffMs < year) {
    const mo = Math.floor(diffMs / month);
    return `${mo} month${mo > 1 ? 's' : ''} ago`;
  }

  const y = Math.floor(diffMs / year);
  return `${y} year${y > 1 ? 's' : ''} ago`;
}

function collectTags(): string[] {
  const all = state.data.repos.flatMap((repo) => repo.tags || []);
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}

function collectTopics(): string[] {
  const all = state.data.repos.flatMap((repo) => repo.topics || []);
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}

function filteredRepos(): StarRepo[] {
  const q = text(state.search.trim());
  const results = state.data.repos.filter((repo) => {
    const combined = [repo.full_name, repo.description, ...(repo.topics || []), ...(repo.tags || []), repo.remarks]
      .join(' ')
      .toLowerCase();

    const bySearch = !q || combined.includes(q);
    const byTopic = state.topic === 'all' || (repo.topics || []).includes(state.topic);
    const byTag = state.tag === 'all' || (repo.tags || []).includes(state.tag);

    return bySearch && byTopic && byTag;
  });

  return results.sort((a, b) => {
    if (state.sort === 'stars_desc') return b.stargazers_count - a.stargazers_count;
    if (state.sort === 'forks_desc') return b.forks - a.forks;
    if (state.sort === 'name_asc') return a.full_name.localeCompare(b.full_name);
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

function renderTopicFilter(): void {
  if (!topicFilterEl) return;

  const topics = collectTopics();
  const previous = state.topic;
  topicFilterEl.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = '全部 Topic';
  topicFilterEl.appendChild(allOption);

  topics.forEach((topic) => {
    const option = document.createElement('option');
    option.value = topic;
    option.textContent = topic;
    topicFilterEl.appendChild(option);
  });

  topicFilterEl.value = previous;
  if (topicFilterEl.value !== previous) {
    state.topic = 'all';
    topicFilterEl.value = 'all';
  }
}

function renderTopics(): void {
  if (!topicsEl) return;

  const topics = collectTopics();
  topicsEl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `btn btn-xs h-6 min-h-0 rounded-full px-2 normal-case border transition-colors ${
    state.topic === 'all'
      ? 'border-primary bg-primary text-base-100 font-semibold shadow-sm shadow-primary/25'
      : 'border-base-content/40 bg-base-200/90 text-base-content/90 hover:border-base-content/60 hover:bg-base-100'
  }`;
  allBtn.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.75c1.3 0 2.52.3 3.5.82M8 14.25c-1.3 0-2.52-.3-3.5-.82M2.95 4.03A6.2 6.2 0 0 0 1.75 8c0 1.45.5 2.78 1.35 3.83M13.05 4.03A6.2 6.2 0 0 1 14.25 8a6.2 6.2 0 0 1-1.35 3.83M8 5.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z"></path></svg><span>全部</span>';
  allBtn.onclick = () => {
    state.topic = 'all';
    render();
  };
  topicsEl.appendChild(allBtn);

  topics.forEach((topic) => {
    const btn = document.createElement('button');
    btn.className = `btn btn-xs h-6 min-h-0 rounded-full px-2 normal-case border transition-colors ${
      state.topic === topic
        ? 'border-primary bg-primary text-base-100 font-semibold shadow-sm shadow-primary/25'
        : 'border-base-content/40 bg-base-200/90 text-base-content/90 hover:border-base-content/60 hover:bg-base-100'
    }`;
    btn.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.75c1.3 0 2.52.3 3.5.82M8 14.25c-1.3 0-2.52-.3-3.5-.82M2.95 4.03A6.2 6.2 0 0 0 1.75 8c0 1.45.5 2.78 1.35 3.83M13.05 4.03A6.2 6.2 0 0 1 14.25 8a6.2 6.2 0 0 1-1.35 3.83M8 5.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z"></path></svg>';
    const label = document.createElement('span');
    label.textContent = topic;
    btn.appendChild(label);
    btn.onclick = () => {
      state.topic = topic;
      render();
    };
    topicsEl.appendChild(btn);
  });
}

function renderTags(): void {
  if (!tagsEl) return;

  const tags = collectTags();
  tagsEl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `btn btn-xs h-6 min-h-0 rounded-full px-2 normal-case border transition-colors ${
    state.tag === 'all'
      ? 'border-primary bg-primary text-base-100 font-semibold shadow-sm shadow-primary/25'
      : 'border-base-content/40 bg-base-200/90 text-base-content/90 hover:border-base-content/60 hover:bg-base-100'
  }`;
  allBtn.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.75 3.25h6.5l4 4-4 4h-6.5a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5Z"></path><circle cx="5.25" cy="6" r="1"></circle></svg><span>全部</span>';
  allBtn.onclick = () => {
    state.tag = 'all';
    render();
  };
  tagsEl.appendChild(allBtn);

  tags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.className = `btn btn-xs h-6 min-h-0 rounded-full px-2 normal-case border transition-colors ${
      state.tag === tag
        ? 'border-primary bg-primary text-base-100 font-semibold shadow-sm shadow-primary/25'
        : 'border-base-content/40 bg-base-200/90 text-base-content/90 hover:border-base-content/60 hover:bg-base-100'
    }`;
    btn.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.75 3.25h6.5l4 4-4 4h-6.5a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5Z"></path><circle cx="5.25" cy="6" r="1"></circle></svg>';
    const label = document.createElement('span');
    label.textContent = tag;
    btn.appendChild(label);
    btn.onclick = () => {
      state.tag = tag;
      render();
    };
    tagsEl.appendChild(btn);
  });
}

function buildEditor(repo: StarRepo): HTMLDivElement {
  const cached = state.editCache.get(repo.id) || {
    tags: (repo.tags || []).join(', '),
    remarks: repo.remarks || ''
  };

  const wrap = document.createElement('div');
  wrap.className = 'mt-2 grid gap-2 border-t border-dashed border-base-content/30 pt-2';

  const tagInput = document.createElement('input');
  tagInput.className = 'input input-bordered input-sm w-full border-base-content/35 bg-base-200 text-base-content placeholder:text-base-content/65 focus:border-primary/60';
  tagInput.placeholder = 'tags, 用英文逗号分隔';
  tagInput.value = cached.tags;

  const remarksInput = document.createElement('textarea');
  remarksInput.className = 'textarea textarea-bordered textarea-sm w-full border-base-content/35 bg-base-200 text-base-content placeholder:text-base-content/65 focus:border-primary/60';
  remarksInput.rows = 2;
  remarksInput.placeholder = '备注';
  remarksInput.value = cached.remarks;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm w-fit';
  saveBtn.textContent = '保存标签与备注';

  const hint = document.createElement('div');
  hint.className = 'text-xs text-base-content/80';

  tagInput.oninput = () => {
    state.editCache.set(repo.id, {
      tags: tagInput.value,
      remarks: remarksInput.value
    });
  };

  remarksInput.oninput = () => {
    state.editCache.set(repo.id, {
      tags: tagInput.value,
      remarks: remarksInput.value
    });
  };

  saveBtn.onclick = async () => {
    if (!state.ownerAuthorized || !state.token) {
      hint.textContent = '仅 owner 可以编辑。';
      return;
    }

    try {
      saveBtn.disabled = true;
      hint.textContent = '保存中...';

      const tags = tagInput.value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      const updated = await saveRepoCustomFields({
        location: DATA_LOCATION,
        token: state.token,
        repoId: repo.id,
        tags,
        remarks: remarksInput.value
      });

      state.data = updated;
      hint.textContent = '已保存并提交到 data.json。';
      render();
    } catch (error) {
      hint.textContent = `保存失败: ${error instanceof Error ? error.message : 'unknown error'}`;
    } finally {
      saveBtn.disabled = false;
    }
  };

  wrap.append(tagInput, remarksInput, saveBtn, hint);
  return wrap;
}

function renderCards(): void {
  if (!cardsEl) return;

  const repos = filteredRepos();
  cardsEl.innerHTML = '';

  if (!repos.length) {
    const empty = document.createElement('div');
    empty.className = 'mb-2 break-inside-avoid alert rounded-box border border-base-content/15 bg-base-100/95 text-base-content/85 shadow-sm';
    empty.textContent = '没有匹配结果。';
    cardsEl.appendChild(empty);
    return;
  }

  repos.forEach((repo) => {
    const card = document.createElement('article');
    card.className = 'mb-2 break-inside-avoid card border border-base-content/15 bg-base-100/95 shadow-sm shadow-base-300/25';

    const body = document.createElement('div');
    body.className = 'card-body gap-2.5 p-3';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'flex items-start justify-between gap-2';

    const link = document.createElement('a');
    link.className = 'link link-primary break-all text-base font-semibold text-primary/95 hover:text-primary';
    link.href = repo.html_url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = repo.full_name;

    const owner = document.createElement('div');
    owner.className = 'flex items-center gap-2';

    const avatar = document.createElement('img');
    avatar.src = repo.owner.avatar_url;
    avatar.alt = 'owner avatar';
    avatar.className = 'h-6 w-6 rounded-full ring-1 ring-base-content/25';

    const updated = document.createElement('span');
    updated.className = 'text-xs text-base-content/70';
    updated.textContent = formatTimeAgo(repo.updated_at);

    owner.append(avatar, updated);
    titleWrap.append(link);

    const desc = document.createElement('p');
    desc.className = 'text-sm leading-5 text-base-content/88';
    desc.textContent = repo.description || '无描述';

    const stats = document.createElement('div');
    stats.className = 'flex flex-wrap gap-1.5';

    const starBadge = document.createElement('span');
    starBadge.className = 'badge badge-sm gap-1.5 border border-base-content/35 bg-base-200/90 px-2 text-base-content';
    starBadge.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-base-content/72" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.88 3.81 4.204.611a.75.75 0 0 1 .416 1.279l-3.042 2.966.718 4.187a.75.75 0 0 1-1.088.79L8 12.347l-3.761 1.978a.75.75 0 0 1-1.088-.79l.718-4.187L.827 6.368a.75.75 0 0 1 .416-1.279l4.204-.611 1.88-3.81A.75.75 0 0 1 8 .25Z"></path></svg><span class="font-semibold text-base-content">' + formatCount(repo.stargazers_count) + '</span>';

    const forkBadge = document.createElement('span');
    forkBadge.className = 'badge badge-sm gap-1.5 border border-base-content/35 bg-base-200/90 px-2 text-base-content';
    forkBadge.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-base-content/72" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3.5" r="1.75"></circle><circle cx="12" cy="3.5" r="1.75"></circle><circle cx="8" cy="12.25" r="1.75"></circle><path d="M8 10.5V8c0-1.4-1.1-2.5-2.5-2.5H5.75"></path><path d="M8 10.5V8c0-1.4 1.1-2.5 2.5-2.5h-.25"></path></svg><span class="font-semibold text-base-content">' + formatCount(repo.forks) + '</span>';

    const watcherBadge = document.createElement('span');
    watcherBadge.className = 'badge badge-sm gap-1.5 border border-base-content/35 bg-base-200/90 px-2 text-base-content';
    watcherBadge.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-base-content/72" fill="currentColor" aria-hidden="true"><path d="M1.679 7.932a.75.75 0 0 1 0-.864C2.944 5.161 5.188 3 8 3s5.056 2.161 6.321 4.068a.75.75 0 0 1 0 .864C13.056 9.839 10.812 12 8 12S2.944 9.839 1.679 7.932ZM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path></svg><span class="font-semibold text-base-content">' + formatCount(repo.watchers) + '</span>';

    const issueBadge = document.createElement('span');
    issueBadge.className = 'badge badge-sm gap-1.5 border border-base-content/35 bg-base-200/90 px-2 text-base-content';
    issueBadge.innerHTML = '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-base-content/72" fill="currentColor" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM8.75 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 1.5 0v-3.5ZM8 10.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"></path></svg><span class="font-semibold text-base-content">' + formatCount(repo.open_issues) + '</span>';

    stats.append(starBadge, forkBadge, watcherBadge, issueBadge);

    const topics = document.createElement('div');
    topics.className = 'flex flex-wrap gap-1.5';
    (repo.topics || []).forEach((topic) => {
      const item = document.createElement('span');
      item.className = 'badge badge-sm border border-info/55 bg-info/20 text-info-content';
      item.textContent = `#${topic}`;
      topics.appendChild(item);
    });

    const tags = document.createElement('div');
    tags.className = 'flex flex-wrap gap-1.5';
    (repo.tags || []).forEach((tag) => {
      const item = document.createElement('span');
      item.className = 'badge badge-sm border border-primary/60 bg-primary/25 font-medium text-base-content';
      item.textContent = `@${tag}`;
      tags.appendChild(item);
    });

    const remarksWrap = document.createElement('div');
    remarksWrap.className = 'mt-0.5 border-t border-dashed border-base-content/28 pt-2';

    const remarks = document.createElement('p');
    remarks.className = 'text-xs italic leading-5 text-base-content/62';
    remarks.textContent = `备注: ${repo.remarks || '-'}`;

    remarksWrap.appendChild(remarks);

    body.append(titleWrap, owner, desc, stats, topics, tags, remarksWrap);

    if (state.ownerAuthorized) {
      body.appendChild(buildEditor(repo));
    }

    card.appendChild(body);
    cardsEl.appendChild(card);
  });
}

function renderAuthStatus(): void {
  if (!authStatusEl || !authBtn || !logoutBtn) return;

  if (state.ownerAuthorized) {
    authStatusEl.textContent = `已授权为 owner (${OWNER_LOGIN})：可编辑 tags/remarks`;
    authBtn.textContent = '重新授权';
    logoutBtn.style.display = 'inline-block';
    return;
  }

  authStatusEl.textContent = '未授权：只读模式';
  authBtn.textContent = 'Owner 授权';
  logoutBtn.style.display = 'none';
}

function render(): void {
  renderTopicFilter();
  renderTopics();
  renderTags();
  renderCards();
  renderAuthStatus();
}

async function initSession(): Promise<void> {
  const token = getToken();
  if (!token || !OWNER_LOGIN) {
    render();
    return;
  }

  try {
    const ok = await validateOwnerToken(token, OWNER_LOGIN);
    if (!ok) {
      clearToken();
      state.token = null;
      state.ownerAuthorized = false;
    } else {
      state.token = token;
      state.ownerAuthorized = true;
    }
  } catch {
    clearToken();
    state.token = null;
    state.ownerAuthorized = false;
  }

  render();
}

searchEl?.addEventListener('input', (event) => {
  state.search = (event.target as HTMLInputElement).value;
  renderCards();
});

sortEl?.addEventListener('change', (event) => {
  state.sort = (event.target as HTMLSelectElement).value;
  renderCards();
});

topicFilterEl?.addEventListener('change', (event) => {
  state.topic = (event.target as HTMLSelectElement).value;
  render();
});

themeToggleEl?.addEventListener('click', () => {
  toggleTheme();
});

authBtn?.addEventListener('click', async () => {
  if (!CLIENT_ID || !OWNER_LOGIN || !DATA_LOCATION.repo || !authStatusEl || !deviceFlowEl || !authBtn) {
    if (authStatusEl) {
      authStatusEl.textContent = '缺少 PUBLIC_GITHUB_* 配置，无法授权。';
    }
    return;
  }

  try {
    authBtn.disabled = true;
    deviceFlowEl.style.display = 'block';
    deviceFlowEl.textContent = '正在请求设备码...';

    const code = await requestDeviceCode(CLIENT_ID);
    deviceFlowEl.textContent = '';
    const prefix = document.createTextNode('请在 ');
    const link = document.createElement('a');
    link.href = code.verification_uri;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = code.verification_uri;
    const middle = document.createTextNode(' 输入用户码 ');
    const strong = document.createElement('strong');
    strong.textContent = code.user_code;
    const suffix = document.createTextNode(' 完成授权。');
    deviceFlowEl.append(prefix, link, middle, strong, suffix);

    const token = await pollForAccessToken({
      clientId: CLIENT_ID,
      deviceCode: code.device_code,
      intervalSeconds: code.interval,
      expiresInSeconds: code.expires_in
    });

    const ownerOk = await validateOwnerToken(token, OWNER_LOGIN);
    if (!ownerOk) {
      clearToken();
      state.token = null;
      state.ownerAuthorized = false;
      authStatusEl.textContent = '当前授权账号不是 owner，已切回只读。';
      return;
    }

    setToken(token);
    state.token = token;
    state.ownerAuthorized = true;
    authStatusEl.textContent = `授权成功：${OWNER_LOGIN}`;
    deviceFlowEl.style.display = 'none';
    render();
  } catch (error) {
    authStatusEl.textContent = `授权失败: ${error instanceof Error ? error.message : 'unknown error'}`;
  } finally {
    authBtn.disabled = false;
  }
});

logoutBtn?.addEventListener('click', () => {
  if (!deviceFlowEl) return;
  clearToken();
  state.token = null;
  state.ownerAuthorized = false;
  deviceFlowEl.style.display = 'none';
  render();
});

applyTheme(resolveInitialTheme());
render();
void initSession();
