export interface GitHubContentFile {
  sha: string;
  content: string;
  encoding: 'base64';
}

export interface DataFileLocation {
  owner: string;
  repo: string;
  path: string;
  branch: string;
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64Utf8(value: string): string {
  const cleaned = value.replace(/\n/g, '');
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function getContentFile(location: DataFileLocation, token: string): Promise<{ sha: string; text: string }> {
  const url = `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/contents/${encodePath(location.path)}?ref=${encodeURIComponent(location.branch)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to read content file: ${response.status}`);
  }

  const file = (await response.json()) as GitHubContentFile;
  return {
    sha: file.sha,
    text: fromBase64Utf8(file.content)
  };
}

export async function updateContentFile(params: {
  location: DataFileLocation;
  token: string;
  sha: string;
  content: string;
  message: string;
}): Promise<void> {
  const url = `https://api.github.com/repos/${encodeURIComponent(params.location.owner)}/${encodeURIComponent(params.location.repo)}/contents/${encodePath(params.location.path)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: params.message,
      content: toBase64Utf8(params.content),
      sha: params.sha,
      branch: params.location.branch
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to update content file: ${response.status} ${message}`);
  }
}
