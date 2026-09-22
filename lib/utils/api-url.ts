export function apiUrl(path: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
  return `${basePath}${path}`
}
