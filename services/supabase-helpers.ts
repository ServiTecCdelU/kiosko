/**
 * Convierte cualquier valor de fecha (string ISO, Date) a Date.
 */
export const toDate = (value: any): Date => {
  if (!value) return new Date()
  if (value instanceof Date) return value
  if (typeof value === 'string') return new Date(value)
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value.seconds != null) return new Date(value.seconds * 1000)
  return new Date(value)
}

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}
