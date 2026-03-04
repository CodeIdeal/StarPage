import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CssBaseline,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ThemeProvider,
  Typography
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import CallSplitRoundedIcon from '@mui/icons-material/CallSplitRounded';
import RemoveRedEyeRoundedIcon from '@mui/icons-material/RemoveRedEyeRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import LabelRoundedIcon from '@mui/icons-material/LabelRounded';
import SellRoundedIcon from '@mui/icons-material/SellRounded';
import type { StarRepo, StarRepoData } from '../../types/star-repo';
import { requestDeviceCode, pollForAccessToken } from '../../lib/auth/github-device-flow';
import { clearToken, getToken, setToken, validateOwnerToken } from '../../lib/auth/session';
import { saveRepoCustomFields } from '../../lib/data/update-data-json';
import {
  createStarPageTheme,
  DARK_THEME,
  LIGHT_THEME,
  resolveStoredTheme,
  THEME_STORAGE_KEY
} from '../../theme/starpageTheme';

type SortKey = 'updated_desc' | 'stars_desc' | 'forks_desc' | 'name_asc';

type EditDraft = {
  tags: string;
  remarks: string;
};

type DeviceFlowState = {
  verificationUri: string;
  userCode: string;
};

type SaveMessageMap = Record<number, string>;

type SavingMap = Record<number, boolean>;

const OWNER_LOGIN = import.meta.env.PUBLIC_GITHUB_OWNER_LOGIN;
const CLIENT_ID = import.meta.env.PUBLIC_GITHUB_OAUTH_CLIENT_ID;
const DATA_LOCATION = {
  owner: import.meta.env.PUBLIC_GITHUB_DATA_REPO_OWNER || OWNER_LOGIN,
  repo: import.meta.env.PUBLIC_GITHUB_DATA_REPO_NAME,
  path: import.meta.env.PUBLIC_GITHUB_DATA_FILE_PATH || 'src/assets/data.json',
  branch: import.meta.env.PUBLIC_GITHUB_DATA_BRANCH || 'main'
};

const BATCH_SIZE = 24;
const LOAD_THRESHOLD = 360;

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'stars_desc', label: 'Star 数量' },
  { value: 'forks_desc', label: 'Fork 数量' },
  { value: 'name_asc', label: '名称 A-Z' }
];

function text(value: unknown): string {
  return String(value || '').toLowerCase();
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

function collectTopics(data: StarRepoData): string[] {
  const all = data.repos.flatMap((repo) => repo.topics || []);
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}

function collectTags(data: StarRepoData): string[] {
  const all = data.repos.flatMap((repo) => repo.tags || []);
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}

function createDefaultDraft(repo: StarRepo): EditDraft {
  return {
    tags: (repo.tags || []).join(', '),
    remarks: repo.remarks || ''
  };
}

export default function StarPageApp(props: { initialData: StarRepoData }) {
  const [data, setData] = useState<StarRepoData>(props.initialData);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('updated_desc');
  const [topic, setTopic] = useState('all');
  const [tag, setTag] = useState('all');
  const [token, setTokenState] = useState<string | null>(null);
  const [ownerAuthorized, setOwnerAuthorized] = useState(false);
  const [authMessage, setAuthMessage] = useState('未授权：只读模式');
  const [authLoading, setAuthLoading] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null);
  const [themeName, setThemeName] = useState(DARK_THEME);
  const [editCache, setEditCache] = useState<Record<number, EditDraft>>({});
  const [saveMessages, setSaveMessages] = useState<SaveMessageMap>({});
  const [savingByRepo, setSavingByRepo] = useState<SavingMap>({});
  const [renderedCount, setRenderedCount] = useState(BATCH_SIZE);

  const cardsScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initialTheme = resolveStoredTheme();
    setThemeName(initialTheme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeName);
  }, [themeName]);

  const muiTheme = useMemo(() => createStarPageTheme(themeName), [themeName]);
  const isDark = themeName === DARK_THEME;

  const topics = useMemo(() => collectTopics(data), [data]);
  const tags = useMemo(() => collectTags(data), [data]);

  useEffect(() => {
    if (topic !== 'all' && !topics.includes(topic)) {
      setTopic('all');
    }
  }, [topics, topic]);

  useEffect(() => {
    if (tag !== 'all' && !tags.includes(tag)) {
      setTag('all');
    }
  }, [tags, tag]);

  const filteredRepos = useMemo(() => {
    const query = text(search.trim());

    const results = data.repos.filter((repo) => {
      const combined = [repo.full_name, repo.description, ...(repo.topics || []), ...(repo.tags || []), repo.remarks]
        .join(' ')
        .toLowerCase();

      const bySearch = !query || combined.includes(query);
      const byTopic = topic === 'all' || (repo.topics || []).includes(topic);
      const byTag = tag === 'all' || (repo.tags || []).includes(tag);

      return bySearch && byTopic && byTag;
    });

    return results.sort((a, b) => {
      if (sort === 'stars_desc') return b.stargazers_count - a.stargazers_count;
      if (sort === 'forks_desc') return b.forks - a.forks;
      if (sort === 'name_asc') return a.full_name.localeCompare(b.full_name);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [data, search, topic, tag, sort]);

  const visibleRepos = useMemo(() => filteredRepos.slice(0, renderedCount), [filteredRepos, renderedCount]);

  useEffect(() => {
    setRenderedCount(Math.min(BATCH_SIZE, filteredRepos.length));
    if (cardsScrollRef.current) {
      cardsScrollRef.current.scrollTop = 0;
    }
  }, [filteredRepos]);

  useEffect(() => {
    const scrollEl = cardsScrollRef.current;
    if (!scrollEl) return;

    if (renderedCount < filteredRepos.length && scrollEl.scrollHeight <= scrollEl.clientHeight) {
      setRenderedCount((previous) => Math.min(previous + BATCH_SIZE, filteredRepos.length));
    }
  }, [renderedCount, filteredRepos.length, visibleRepos.length]);

  const loadMoreIfNeeded = useCallback(() => {
    const scrollEl = cardsScrollRef.current;
    if (!scrollEl) return;

    const remaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (remaining <= LOAD_THRESHOLD) {
      setRenderedCount((previous) => Math.min(previous + BATCH_SIZE, filteredRepos.length));
    }
  }, [filteredRepos.length]);

  const getDraft = useCallback(
    (repo: StarRepo): EditDraft => {
      return editCache[repo.id] || createDefaultDraft(repo);
    },
    [editCache]
  );

  const updateDraft = useCallback((repo: StarRepo, patch: Partial<EditDraft>) => {
    setEditCache((previous) => {
      const current = previous[repo.id] || createDefaultDraft(repo);
      return {
        ...previous,
        [repo.id]: {
          ...current,
          ...patch
        }
      };
    });
  }, []);

  const handleThemeToggle = useCallback(() => {
    setThemeName((previous) => (previous === DARK_THEME ? LIGHT_THEME : DARK_THEME));
  }, []);

  const handleAuthorize = useCallback(async () => {
    if (!CLIENT_ID || !OWNER_LOGIN || !DATA_LOCATION.repo) {
      setAuthMessage('缺少 PUBLIC_GITHUB_* 配置，无法授权。');
      return;
    }

    try {
      setAuthLoading(true);
      setDeviceFlow(null);
      setAuthMessage('正在请求设备码...');

      const code = await requestDeviceCode(CLIENT_ID);
      setDeviceFlow({
        verificationUri: code.verification_uri,
        userCode: code.user_code
      });

      const nextToken = await pollForAccessToken({
        clientId: CLIENT_ID,
        deviceCode: code.device_code,
        intervalSeconds: code.interval,
        expiresInSeconds: code.expires_in
      });

      const ownerOk = await validateOwnerToken(nextToken, OWNER_LOGIN);
      if (!ownerOk) {
        clearToken();
        setTokenState(null);
        setOwnerAuthorized(false);
        setAuthMessage('当前授权账号不是 owner，已切回只读。');
        return;
      }

      setToken(nextToken);
      setTokenState(nextToken);
      setOwnerAuthorized(true);
      setAuthMessage(`已授权为 owner (${OWNER_LOGIN})：可编辑 tags/remarks`);
      setDeviceFlow(null);
    } catch (error) {
      setAuthMessage(`授权失败: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setOwnerAuthorized(false);
    setDeviceFlow(null);
    setAuthMessage('未授权：只读模式');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      const existingToken = getToken();
      if (!existingToken || !OWNER_LOGIN) {
        if (!cancelled) {
          setTokenState(null);
          setOwnerAuthorized(false);
          setAuthMessage('未授权：只读模式');
        }
        return;
      }

      try {
        const ok = await validateOwnerToken(existingToken, OWNER_LOGIN);

        if (cancelled) return;

        if (!ok) {
          clearToken();
          setTokenState(null);
          setOwnerAuthorized(false);
          setAuthMessage('当前授权账号不是 owner，已切回只读。');
          return;
        }

        setTokenState(existingToken);
        setOwnerAuthorized(true);
        setAuthMessage(`已授权为 owner (${OWNER_LOGIN})：可编辑 tags/remarks`);
      } catch {
        if (cancelled) return;
        clearToken();
        setTokenState(null);
        setOwnerAuthorized(false);
        setAuthMessage('未授权：只读模式');
      }
    };

    void initSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveRepo = useCallback(
    async (repo: StarRepo) => {
      if (!ownerAuthorized || !token) {
        setSaveMessages((previous) => ({
          ...previous,
          [repo.id]: '仅 owner 可以编辑。'
        }));
        return;
      }

      const draft = getDraft(repo);

      try {
        setSavingByRepo((previous) => ({ ...previous, [repo.id]: true }));
        setSaveMessages((previous) => ({ ...previous, [repo.id]: '保存中...' }));

        const parsedTags = draft.tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

        const updated = await saveRepoCustomFields({
          location: DATA_LOCATION,
          token,
          repoId: repo.id,
          tags: parsedTags,
          remarks: draft.remarks
        });

        setData(updated);
        setSaveMessages((previous) => ({
          ...previous,
          [repo.id]: '已保存并提交到 data.json。'
        }));
      } catch (error) {
        setSaveMessages((previous) => ({
          ...previous,
          [repo.id]: `保存失败: ${error instanceof Error ? error.message : 'unknown error'}`
        }));
      } finally {
        setSavingByRepo((previous) => ({ ...previous, [repo.id]: false }));
      }
    },
    [getDraft, ownerAuthorized, token]
  );

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <Box sx={{ bgcolor: 'background.default', color: 'text.primary', minHeight: '100vh' }}>
        <Box
          sx={{
            mx: 'auto',
            maxWidth: 1440,
            height: '100vh',
            p: { xs: 2, lg: 3 },
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflow: 'hidden'
          }}
        >
          <Paper
            elevation={0}
            sx={{
              p: 2,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper'
            }}
          >
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', lg: 'center' }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 160 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'primary.main',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700
                  }}
                >
                  ★
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  StarPage
                </Typography>
              </Stack>

              <TextField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                size="small"
                fullWidth
                placeholder="搜索仓库名、描述、topic、tag"
              />

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <FormControl size="small" sx={{ minWidth: 132 }}>
                  <InputLabel id="sort-label">排序</InputLabel>
                  <Select
                    labelId="sort-label"
                    value={sort}
                    label="排序"
                    onChange={(event: SelectChangeEvent<SortKey>) => setSort(event.target.value as SortKey)}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 132 }}>
                  <InputLabel id="topic-filter-label">Topic</InputLabel>
                  <Select
                    labelId="topic-filter-label"
                    value={topic}
                    label="Topic"
                    onChange={(event) => setTopic(event.target.value)}
                  >
                    <MenuItem value="all">全部 Topic</MenuItem>
                    {topics.map((item) => (
                      <MenuItem key={item} value={item}>
                        {item}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <IconButton
                  onClick={handleThemeToggle}
                  aria-label="切换主题"
                  title={isDark ? '切换到浅色模式' : '切换到深色模式'}
                  sx={{ border: 1, borderColor: 'divider' }}
                >
                  {isDark ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
                </IconButton>

                <Button variant="contained" onClick={() => void handleAuthorize()} disabled={authLoading}>
                  {ownerAuthorized ? '重新授权' : 'Owner 授权'}
                </Button>

                {ownerAuthorized ? (
                  <Button variant="outlined" color="error" onClick={handleLogout}>
                    退出
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </Paper>

          <Alert severity={ownerAuthorized ? 'success' : 'info'}>{authMessage}</Alert>

          {deviceFlow ? (
            <Alert severity="warning">
              请在{' '}
              <Link href={deviceFlow.verificationUri} target="_blank" rel="noreferrer">
                {deviceFlow.verificationUri}
              </Link>{' '}
              输入用户码 <strong>{deviceFlow.userCode}</strong> 完成授权。
            </Alert>
          ) : null}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1fr 3fr' },
              gap: 2,
              minHeight: 0,
              flex: 1
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateRows: { xs: 'auto auto', lg: '1fr 1fr' }, gap: 2, minHeight: 0 }}>
              <Card variant="outlined" sx={{ minHeight: 0 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Tags
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignContent: 'flex-start', overflowY: 'auto', pr: 0.5 }}>
                    <Chip
                      label="全部"
                      size="small"
                      color={tag === 'all' ? 'primary' : 'default'}
                      variant={tag === 'all' ? 'filled' : 'outlined'}
                      onClick={() => setTag('all')}
                    />
                    {tags.map((item) => (
                      <Chip
                        key={item}
                        icon={<SellRoundedIcon fontSize="small" />}
                        label={item}
                        size="small"
                        color={tag === item ? 'primary' : 'default'}
                        variant={tag === item ? 'filled' : 'outlined'}
                        onClick={() => setTag(item)}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ minHeight: 0 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Topics
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignContent: 'flex-start', overflowY: 'auto', pr: 0.5 }}>
                    <Chip
                      label="全部"
                      size="small"
                      color={topic === 'all' ? 'primary' : 'default'}
                      variant={topic === 'all' ? 'filled' : 'outlined'}
                      onClick={() => setTopic('all')}
                    />
                    {topics.map((item) => (
                      <Chip
                        key={item}
                        icon={<LabelRoundedIcon fontSize="small" />}
                        label={item}
                        size="small"
                        color={topic === item ? 'primary' : 'default'}
                        variant={topic === item ? 'filled' : 'outlined'}
                        onClick={() => setTopic(item)}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Box>

            <Box ref={cardsScrollRef} onScroll={loadMoreIfNeeded} sx={{ minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
              {!visibleRepos.length ? (
                <Alert severity="info">没有匹配结果。</Alert>
              ) : (
                <Box
                  sx={{
                    columnCount: { xs: 1, sm: 2, lg: 3, xl: 4 },
                    columnGap: 12
                  }}
                >
                  {visibleRepos.map((repo) => {
                    const draft = getDraft(repo);
                    const saveMessage = saveMessages[repo.id] || '';
                    const saving = Boolean(savingByRepo[repo.id]);

                    return (
                      <Card
                        key={repo.id}
                        variant="outlined"
                        sx={{
                          breakInside: 'avoid',
                          mb: 1.5,
                          bgcolor: 'background.paper'
                        }}
                      >
                        <CardContent sx={{ display: 'grid', gap: 1.25 }}>
                          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                            <Link
                              href={repo.html_url}
                              target="_blank"
                              rel="noreferrer"
                              underline="hover"
                              sx={{ fontWeight: 700, wordBreak: 'break-all' }}
                            >
                              {repo.full_name}
                            </Link>
                          </Stack>

                          <Stack direction="row" spacing={1} alignItems="center">
                            <Avatar src={repo.owner.avatar_url} alt="owner avatar" sx={{ width: 24, height: 24 }} />
                            <Typography variant="caption" color="text.secondary">
                              {formatTimeAgo(repo.updated_at)}
                            </Typography>
                          </Stack>

                          <Typography variant="body2" color="text.secondary">
                            {repo.description || '无描述'}
                          </Typography>

                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <Chip size="small" icon={<StarRoundedIcon />} label={formatCount(repo.stargazers_count)} />
                            <Chip size="small" icon={<CallSplitRoundedIcon />} label={formatCount(repo.forks)} />
                            <Chip size="small" icon={<RemoveRedEyeRoundedIcon />} label={formatCount(repo.watchers)} />
                            <Chip size="small" icon={<ErrorOutlineRoundedIcon />} label={formatCount(repo.open_issues)} />
                          </Stack>

                          {(repo.topics || []).length ? (
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              {(repo.topics || []).map((item) => (
                                <Chip key={`${repo.id}-topic-${item}`} size="small" color="info" variant="outlined" label={`#${item}`} />
                              ))}
                            </Stack>
                          ) : null}

                          {(repo.tags || []).length ? (
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              {(repo.tags || []).map((item) => (
                                <Chip key={`${repo.id}-tag-${item}`} size="small" color="primary" variant="outlined" label={`@${item}`} />
                              ))}
                            </Stack>
                          ) : null}

                          <Typography variant="caption" color="text.secondary" sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
                            备注: {repo.remarks || '-'}
                          </Typography>

                          {ownerAuthorized ? (
                            <Box sx={{ display: 'grid', gap: 1, borderTop: 1, borderColor: 'divider', pt: 1 }}>
                              <TextField
                                size="small"
                                label="Tags（英文逗号分隔）"
                                value={draft.tags}
                                onChange={(event) => updateDraft(repo, { tags: event.target.value })}
                              />
                              <TextField
                                size="small"
                                multiline
                                minRows={2}
                                label="备注"
                                value={draft.remarks}
                                onChange={(event) => updateDraft(repo, { remarks: event.target.value })}
                              />
                              <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'start' }}>
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={() => void handleSaveRepo(repo)}
                                  disabled={saving}
                                >
                                  保存标签与备注
                                </Button>
                                {saveMessage ? (
                                  <Typography variant="caption" color="text.secondary">
                                    {saveMessage}
                                  </Typography>
                                ) : null}
                              </Box>
                            </Box>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              )}
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
            已加载 {Math.min(visibleRepos.length, filteredRepos.length)} / {filteredRepos.length} 个仓库
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
