interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

const SUPABASE_FUNCTION_ORIGIN =
  'https://szpwtjikhyfzoyjxgdtp.supabase.co/functions/v1/make-server-545d7fd7'

const proxyApiRequest = async (request: Request): Promise<Response> => {
  const incomingUrl = new URL(request.url)
  const upstreamPath = incomingUrl.pathname.replace(/^\/api/, '')
  const upstreamUrl = `${SUPABASE_FUNCTION_ORIGIN}${upstreamPath}${incomingUrl.search}`
  const headers = new Headers()

  for (const name of ['accept', 'authorization', 'content-type']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  try {
    const body = request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer()
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
    })
    const responseHeaders = new Headers()
    for (const name of ['cache-control', 'content-type', 'etag', 'last-modified']) {
      const value = response.headers.get(name)
      if (value) responseHeaders.set(name, value)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return Response.json({
      error: '行情服务暂时不可用',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 502 })
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/market/') || url.pathname.startsWith('/api/trade/')) {
      return proxyApiRequest(request)
    }

    const response = await env.ASSETS.fetch(request)
    const contentType = response.headers.get('content-type') ?? ''

    if (!contentType.includes('text/html')) {
      return response
    }

    const origin = new URL(request.url).origin
    const html = (await response.text()).replaceAll('__SITE_ORIGIN__', origin)
    const headers = new Headers(response.headers)
    headers.delete('content-length')

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}

export default worker
