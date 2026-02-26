const TOKEN_STORAGE_KEY = 'star-page:github-token';

export interface GitHubUser {
  login: string;
  id: number;
}

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function fetchCurrentUser(token: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
}

export async function validateOwnerToken(token: string, ownerLogin: string): Promise<boolean> {
  const user = await fetchCurrentUser(token);
  return user.login.toLowerCase() === ownerLogin.toLowerCase();
}
