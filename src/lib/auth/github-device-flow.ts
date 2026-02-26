export interface GitHubDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface GitHubAccessTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' | string;
  error_description?: string;
}

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export async function requestDeviceCode(clientId: string, scope = 'read:user repo'): Promise<GitHubDeviceCodeResponse> {
  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ client_id: clientId, scope })
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: ${response.status}`);
  }

  return response.json() as Promise<GitHubDeviceCodeResponse>;
}

export async function pollForAccessToken(params: {
  clientId: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}): Promise<string> {
  const startedAt = Date.now();
  let intervalMs = params.intervalSeconds * 1000;

  while (Date.now() - startedAt < params.expiresInSeconds * 1000) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const response = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: params.clientId,
        device_code: params.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to poll access token: ${response.status}`);
    }

    const result = (await response.json()) as GitHubAccessTokenResponse;

    if (result.access_token) {
      return result.access_token;
    }

    if (result.error === 'authorization_pending') {
      continue;
    }

    if (result.error === 'slow_down') {
      intervalMs += 5000;
      continue;
    }

    if (result.error === 'expired_token') {
      throw new Error('Device flow expired. Please try again.');
    }

    if (result.error === 'access_denied') {
      throw new Error('Authorization denied by user.');
    }

    throw new Error(result.error_description ?? result.error ?? 'Unknown OAuth polling error');
  }

  throw new Error('Device flow timed out.');
}
