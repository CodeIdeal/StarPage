export interface StarRepo {
  id: number;
  full_name: string;
  owner: {
    avatar_url: string;
  };
  html_url: string;
  stargazers_count: number;
  forks: number;
  open_issues: number;
  watchers: number;
  description: string;
  homepage: string;
  updated_at: string;
  license: {
    key: string;
  } | null;
  topics: string[];
  tags: string[];
  remarks: string;
}

export interface StarRepoData {
  generated_at: string;
  repos: StarRepo[];
}

export interface CustomRepoFields {
  id: number;
  tags: string[];
  remarks: string;
}

export interface CustomRepoData {
  generated_at: string;
  repos: CustomRepoFields[];
}
