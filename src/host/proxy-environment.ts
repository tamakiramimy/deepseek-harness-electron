import type { ProxySettings } from '../shared/contracts.js'

const MANAGED_PROXY_KEYS = new Set([
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'npm_config_proxy',
  'npm_config_https_proxy',
  'npm_config_noproxy',
  'node_use_env_proxy',
])

export function createProxyEnvironment(
  base: NodeJS.ProcessEnv,
  proxy: ProxySettings,
): NodeJS.ProcessEnv {
  const env = { ...base }
  for (const key of Object.keys(env)) {
    if (MANAGED_PROXY_KEYS.has(key.toLowerCase())) delete env[key]
  }

  const httpProxy = proxy.httpProxy.trim()
  const httpsProxy = proxy.httpsProxy.trim() || httpProxy
  const noProxy = proxy.noProxy.trim()
  if (httpProxy !== '') {
    env.HTTP_PROXY = httpProxy
    env.http_proxy = httpProxy
    env.npm_config_proxy = httpProxy
  }
  if (httpsProxy !== '') {
    env.HTTPS_PROXY = httpsProxy
    env.https_proxy = httpsProxy
    env.npm_config_https_proxy = httpsProxy
  }
  if (noProxy !== '') {
    env.NO_PROXY = noProxy
    env.no_proxy = noProxy
    env.npm_config_noproxy = noProxy
  }
  if (httpProxy !== '' || httpsProxy !== '') env.NODE_USE_ENV_PROXY = '1'
  return env
}