import { requestDeviceCode, pollForAccessToken } from '../lib/auth/github-device-flow';
import { getToken, setToken, clearToken, validateOwnerToken } from '../lib/auth/session';
import { saveRepoCustomFields } from '../lib/data/update-data-json';
import type { StarRepo, StarRepoData } from '../types/star-repo';

const OWNER_LOGIN = import.meta.env.PUBLIC_GITHUB_OWNER_LOGIN;
const CLIENT_ID = import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID;
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
const cardsEl = document.getElementById('cards') as HTMLDivElement | null;
const authBtn = document.getElementById('auth-btn') as HTMLButtonElement | null;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement | null;
const authStatusEl = document.getElementById('auth-status') as HTMLDivElement | null;
const deviceFlowEl = document.getElementById('device-flow') as HTMLDivElement | null;

function text(v: unknown): string {
  return String(v || '').toLowerCase();
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

  topicFilterEl.value = state.topic;
}

function renderTags(): void {
  if (!tagsEl) return;

  const tags = collectTags();
  tagsEl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = `tag-chip ${state.tag === 'all' ? 'active' : ''}`;
  allBtn.textContent = '全部';
  allBtn.onclick = () => {
    state.tag = 'all';
    render();
  };
  tagsEl.appendChild(allBtn);

  tags.forEach((tag) => {
    const btn = document.createElement('button');
    btn.className = `tag-chip ${state.tag === tag ? 'active' : ''}`;
    btn.textContent = tag;
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
  wrap.className = 'editor';

  const tagInput = document.createElement('input');
  tagInput.placeholder = 'tags, 用英文逗号分隔';
  tagInput.value = cached.tags;

  const remarksInput = document.createElement('textarea');
  remarksInput.rows = 2;
  remarksInput.placeholder = '备注';
  remarksInput.value = cached.remarks;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'primary';
  saveBtn.textContent = '保存标签与备注';

  const hint = document.createElement('div');
  hint.className = 'hint';

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
    empty.className = 'empty';
    empty.textContent = '没有匹配结果。';
    cardsEl.appendChild(empty);
    return;
  }

  repos.forEach((repo) => {
    const card = document.createElement('article');
    card.className = 'card';

    const link = document.createElement('a');
    link.className = 'repo-title';
    link.href = repo.html_url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = repo.full_name;

    const owner = document.createElement('div');
    owner.className = 'owner';
    const avatar = document.createElement('img');
    avatar.src = repo.owner.avatar_url;
    avatar.alt = 'owner avatar';
    const updated = document.createElement('span');
    updated.className = 'meta';
    updated.textContent = `更新于 ${new Date(repo.updated_at).toLocaleDateString()}`;
    owner.append(avatar, updated);

    const desc = document.createElement('div');
    desc.className = 'meta';
    desc.textContent = repo.description || '无描述';

    const stats = document.createElement('div');
    stats.className = 'meta';
    stats.textContent = `Stars ${repo.stargazers_count} · Forks ${repo.forks} · Watchers ${repo.watchers} · Issues ${repo.open_issues}`;

    const topics = document.createElement('div');
    topics.className = 'card-tags';
    (repo.topics || []).forEach((topic) => {
      const item = document.createElement('span');
      item.className = 'tiny';
      item.textContent = `#${topic}`;
      topics.appendChild(item);
    });

    const tags = document.createElement('div');
    tags.className = 'card-tags';
    (repo.tags || []).forEach((tag) => {
      const item = document.createElement('span');
      item.className = 'tiny';
      item.textContent = `@${tag}`;
      tags.appendChild(item);
    });

    const remarks = document.createElement('div');
    remarks.className = 'meta';
    remarks.textContent = `备注: ${repo.remarks || '-'}`;

    card.append(link, owner, desc, stats, topics, tags, remarks);

    if (state.ownerAuthorized) {
      card.appendChild(buildEditor(repo));
    }

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
  renderCards();
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

render();
void initSession();
