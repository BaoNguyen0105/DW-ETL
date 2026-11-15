export const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value)
export const money = (value: number | null | undefined) =>
  value == null ? '—' : `R$ ${number(value, 2)}`
export const compact = (value: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
export const percent = (value: number | null | undefined, digits = 1) =>
  value == null ? '—' : `${number(value, digits)}%`
export const categoryName = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
export const shortDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`
export function csvContent(columns: string[], rows: Record<string, unknown>[]) {
  const escape = (value: unknown) => {
    const raw =
      value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    const safe = typeof value === 'string' && /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replace(/"/g, '""')}"`
  }
  return (
    '\uFEFF' +
    [
      columns.map(escape).join(','),
      ...rows.map((row) => columns.map((key) => escape(row[key])).join(',')),
    ].join('\r\n')
  )
}
export function downloadCsv(name: string, columns: string[], rows: object[]) {
  const url = URL.createObjectURL(
    new Blob([csvContent(columns, rows as Record<string, unknown>[])], {
      type: 'text/csv;charset=utf-8;',
    }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const stateNames: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}
