/** Bounded, extractive retrieval. No LLM, tokenizer service, or new index. */
import { createHash } from 'node:crypto'

export const byteLength = value => Buffer.byteLength(JSON.stringify(value), 'utf8')
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function positiveLimit(value, fallback, max, label) {
  value ??= fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${label} must be an integer from 1 to ${max}`)
  return value
}
export function compactCoverage(coverage) {
  return { indexedPages: coverage.indexedPages, totalPages: coverage.totalPages, partial: coverage.partial,
    visualNotedPages: coverage.visualNotedPages, visualGapPages: coverage.unreadLowTextPages.length }
}
export function compactCatalog(value) {
  return { availableDocuments: value.documents.length, selected: value.selected,
    documents: value.documents.filter(doc => value.selected.includes(doc.id)).map(doc => ({
      id: doc.id, name: doc.name, summary: doc.summary?.slice(0, 200) ?? null,
      status: doc.status, coverage: compactCoverage(doc.coverage),
    })), pendingUploads: value.uploads?.filter(ref => !value.documents.some(doc => doc.sourceAttachmentIds?.includes(ref.attachmentId))).length ?? 0,
    hint: 'Only selected documents are listed. The sidebar holds the full catalog and index history.' }
}
export function queryTerms(query) {
  const stop = new Set('the a an of in is what how which and to for number total group year'.split(' '))
  const words = (query.toLowerCase().match(/[a-z0-9_.]+/g) ?? []).filter(word => !stop.has(word))
  for (const run of query.match(/[\u4e00-\u9fff]+/g) ?? []) for (let i = 0; i < Math.max(1, run.length - 1); i++) words.push(run.slice(i, i + 2))
  return [...new Set(words)]
}
export function textQuality(text) {
  const visible = text.replace(/\s/g, '')
  const controls = (visible.match(/[\u0000-\u001f\u007f-\u009f\ufffd]/g) ?? []).length
  if (visible.length < 40) return 'low_text'
  if (controls / visible.length > 0.05) return 'garbled_text'
  return 'readable'
}
/** An exact original-text window; never an LLM summary or a fabricated ellipsis. */
export function passage(text, query, maxChars = 1400) {
  const words = queryTerms(query), folded = text.toLowerCase()
  const positions = words.flatMap(word => {
    const found = []; let pos = -1
    while (found.length < 30 && (pos = folded.indexOf(word, pos + 1)) !== -1) found.push(pos)
    return found
  })
  let bestStart = 0, bestScore = -1
  for (const pos of [0, ...positions]) {
    const start = Math.max(0, pos - Math.floor(maxChars / 3)), chunk = folded.slice(start, start + maxChars)
    const score = words.reduce((n, word) => n + (chunk.includes(word) ? 1 : 0), 0)
    if (score > bestScore) { bestScore = score; bestStart = start }
  }
  // Keep a complete nearby line boundary when it fits; don't mix noncontiguous facts.
  const lineStart = text.lastIndexOf('\n', bestStart)
  if (lineStart >= Math.max(0, bestStart - 160)) bestStart = lineStart + 1
  let end = Math.min(text.length, bestStart + maxChars)
  const lineEnd = text.lastIndexOf('\n', end)
  if (end < text.length && lineEnd > bestStart + maxChars / 2) end = lineEnd
  return { text: text.slice(bestStart, end).trim(), start: bestStart, end, truncated: bestStart > 0 || end < text.length }
}
/** Rank positions are comparable across docs; their local lexical scores are not. */
export function fairCandidates(results, top) {
  const picked = [], seen = new Set()
  for (let rank = 0; picked.length < top; rank++) {
    let found = false
    for (const doc of results) {
      const hit = doc.hits[rank]
      if (!hit) continue
      found = true
      const key = `${doc.documentId}:p${hit.page}`
      if (!seen.has(key)) { seen.add(key); picked.push({ ...hit, documentId: doc.documentId, name: doc.name }) }
      if (picked.length === top) break
    }
    if (!found) break
  }
  return picked
}

/** Strip only exact repeat payloads in this turn. New excerpts on an old page remain visible. */
export function compactSearch(value, delivered = new Set()) {
  const { trace, ...rest } = value
  const records = []
  rest.results = value.results.map(doc => ({ ...doc, coverage: compactCoverage(doc.coverage), hits: doc.hits.map(hit => {
    const key = fingerprint([doc.documentId, hit.page, hit.excerpt, hit.source])
    records.push(key)
    return delivered.has(key) ? { page: hit.page, previouslyReturned: true } : hit
  }) }))
  return { value: rest, records }
}

export function fitSearch(value, maxBytes) {
  const output = structuredClone(value)
  while (byteLength(output) > maxBytes) {
    const doc = [...output.results].reverse().find(doc => doc.hits.length)
    if (!doc) throw new Error('Scope metadata exceeds retrieval budget; narrow ids')
    doc.hits.pop(); doc.truncated = true
  }
  return output
}

/** Presentation history is intentionally richer than the model-visible payload. */
export function modelPayload(name, value, maxBytes) {
  const { image, trace, deliveryKeys, ...rest } = value
  if (name === 'library_list') {
    const catalog = compactCatalog(value)
    if (byteLength(catalog) > maxBytes) return { availableDocuments: value.documents.length, selectedCount: value.selected.length,
      hint: 'Selected catalog exceeds the compact budget. Narrow the selection in the sidebar.' }
    return catalog
  }
  if (name === 'library_search') return fitSearch(rest, maxBytes)
  return rest
}
