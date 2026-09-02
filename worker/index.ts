import { handleMarketApi } from './marketApi.ts'

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const apiResponse = await handleMarketApi(request)
      if (apiResponse) return apiResponse
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
