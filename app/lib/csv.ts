export interface CsvRow {
  [key: string]: string
}

export function parseCSV(text: string): CsvRow[] {
  if (!text.trim()) return []
  const rows: string[][] = []
  let current: string[] = []
  let value = ''
  let quote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        value += '"'
        i++
      } else quote = !quote
    } else if (c === ',' && !quote) {
      current.push(value.trim())
      value = ''
    } else if ((c === '\r' || c === '\n') && !quote) {
      if (c === '\r' && text[i + 1] === '\n') i++
      current.push(value.trim())
      if (current.some(Boolean)) rows.push(current)
      current = []
      value = ''
    } else value += c
  }
  current.push(value.trim())
  if (current.some(Boolean)) rows.push(current)
  if (rows.length < 2) return []
  const head = rows.shift()!.map(cell => cell.toLowerCase().trim())
  return rows.filter(row => row.some(Boolean)).slice(0, 500).map(row =>
    Object.fromEntries(head.map((key, index) => [key, row[index] || ''])),
  )
}

export function addressFromRow(row: CsvRow) {
  if (row.recipient) return row.recipient.replace(/\\n/g, '\n')
  return [
    row.name || row.full_name || row.recipient_name,
    row.company,
    row.address1 || row.street,
    row.address2 || row.apt,
    [row.city, row.state, row.zip || row.postal].filter(Boolean).join(' '),
  ].filter(Boolean).join('\n')
}

export const CSV_TEMPLATE = 'name,address1,address2,city,state,zip\r\nJane Smith,123 Main St,,Brooklyn,NY,11201\r\n'
