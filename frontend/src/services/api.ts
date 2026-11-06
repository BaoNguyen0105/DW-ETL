export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
type ValidationIssue = { loc: (string | number)[]; msg: string }

export class ApiError extends Error {
  status: number
  issues: ValidationIssue[]
  constructor(message: string, status = 0, issues: ValidationIssue[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.issues = issues
  }
}

export function queryString(params: object = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(30_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new ApiError(
      timeout.aborted
        ? 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.'
        : 'Không kết nối được API. Kiểm tra backend đang chạy ở cổng 8000 hoặc cấu hình VITE_API_BASE_URL.',
    )
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const issues: ValidationIssue[] = Array.isArray(body?.detail) ? body.detail : []
    const message =
      response.status === 503
        ? 'Chưa có dữ liệu mô hình. Chạy python -m dss tại thư mục gốc rồi thử lại.'
        : issues.length
          ? issues.map((issue) => `${issue.loc.at(-1)}: ${issue.msg}`).join(' · ')
          : typeof body?.detail === 'string'
            ? body.detail
            : response.status >= 500
              ? 'Không đọc được dữ liệu. Kiểm tra backend và kho dữ liệu Parquet, sau đó thử lại.'
              : `Yêu cầu thất bại (HTTP ${response.status}).`
    throw new ApiError(message, response.status, issues)
  }
  if (body === null)
    throw new ApiError('API không trả về JSON hợp lệ. Kiểm tra địa chỉ backend.', response.status)
  return body as T
}

export const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })
