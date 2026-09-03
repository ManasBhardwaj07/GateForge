export interface TestResponse<T = any> {
  status: number
  headers: Headers
  data: T
  rawText: string
}

export async function request(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: any
  } = {}
): Promise<TestResponse> {
  const method = options.method || 'GET'
  const headers: Record<string, string> = { ...(options.headers || {}) }

  let body: any = options.body
  if (body && typeof body === 'object' && !(body instanceof Uint8Array) && !(body instanceof Blob)) {
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json'
    }
    body = JSON.stringify(body)
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
  })

  const rawText = await res.text()
  let data: any = rawText
  try {
    data = JSON.parse(rawText)
  } catch {}

  return {
    status: res.status,
    headers: res.headers,
    data,
    rawText,
  }
}
