/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_GITHUB_OWNER_LOGIN: string;
  readonly PUBLIC_GITHUB_OAUTH_CLIENT_ID: string;
  readonly PUBLIC_GITHUB_STARRED_USERNAME: string;
  readonly PUBLIC_GITHUB_DATA_REPO_OWNER: string;
  readonly PUBLIC_GITHUB_DATA_REPO_NAME: string;
  readonly PUBLIC_GITHUB_DATA_FILE_PATH: string;
  readonly PUBLIC_GITHUB_DATA_BRANCH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
