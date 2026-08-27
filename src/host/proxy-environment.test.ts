import { describe, expect, it } from 'vitest'
import { createProxyEnvironment } from './proxy-environment.js'

describe('createProxyEnvironment', () => {
  it('sets process, npm and lowercase proxy variables with HTTPS fallback', () => {
    const env = createProxyEnvironment({ SAFE: 'kept' }, {
      httpProxy: 'http://proxy.example:8080',
      httpsProxy: '',
      noProxy: 'localhost,127.0.0.1',
    })

    expect(env).toMatchObject({
      SAFE: 'kept',
      HTTP_PROXY: 'http://proxy.example:8080',
      http_proxy: 'http://proxy.example:8080',
      HTTPS_PROXY: 'http://proxy.example:8080',
      https_proxy: 'http://proxy.example:8080',
      NO_PROXY: 'localhost,127.0.0.1',
      no_proxy: 'localhost,127.0.0.1',
      npm_config_proxy: 'http://proxy.example:8080',
      npm_config_https_proxy: 'http://proxy.example:8080',
      npm_config_noproxy: 'localhost,127.0.0.1',
      NODE_USE_ENV_PROXY: '1',
    })
  })

  it('removes inherited proxy settings when the desktop setting is cleared', () => {
    const env = createProxyEnvironment({
      HTTP_PROXY: 'http://old',
      https_proxy: 'http://old',
      NPM_CONFIG_PROXY: 'http://old',
      NODE_USE_ENV_PROXY: '1',
      SAFE: 'kept',
    }, { httpProxy: '', httpsProxy: '', noProxy: '' })

    expect(env).toEqual({ SAFE: 'kept' })
  })
})