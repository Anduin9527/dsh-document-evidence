/** Exact, replayable reuse of source text already present in the model surface. */
import { createHash } from 'node:crypto'
import { freezeMessage } from '@deepseek-ai/dsh-llm'
const entries = value => Array.isArray(value) ? value.entries() : [][Symbol.iterator]()
const keyFor = (id, page) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) && Number.isSafeInteger(page) && page > 0 ? `${id}:p${page}` : null
const bytes = value => Buffer.byteLength(JSON.stringify(value))

function fields(name, value) {
  const found = []
  const add = (record, path, key, field) => {
    if (!record || !key) return
    if (typeof record[field] === 'string') found.push({ record, path: [...path, field], key, field, text: record[field] })
    for (const [i, part] of entries(record[`${field}Parts`])) {
      if (typeof part.text === 'string') found.push({ record: part, path: [...path, `${field}Parts`, i, 'text'], key, field: 'text', text: part.text, segment: true })
    }
  }
  if (name === 'library_read_page') add(value, [], keyFor(value.documentId, value.page), 'text')
  if (['library_retrieve', 'library_expand'].includes(name)) for (const [i, item] of entries(value.evidence)) add(item, ['evidence', i], keyFor(item.id, item.page), 'text')
  if (name === 'library_search') for (const [i, doc] of entries(value.results)) for (const [j, hit] of entries(doc.hits)) add(hit, ['results', i, 'hits', j], keyFor(doc.documentId, hit.page), 'excerpt')
  return found
}

const digest = text => createHash('sha256').update(text).digest('hex')
const reference = (source, offset, length) => ({from:source.from, offset, length, sha256:digest(source.text.slice(offset, offset+length))})

function textParts(text, sources) {
  const intervals = []
  for (const source of sources) {
    // Avoid fragmenting short phrases; references have their own token cost.
    if (source.text.length < 160) continue
    const offset = source.text.indexOf(text)
    if (offset >= 0) return [reference(source, offset, text.length)]
    let at = text.indexOf(source.text)
    while (at >= 0 && intervals.length < 128) {
      intervals.push({ start: at, end: at + source.text.length, source })
      at = text.indexOf(source.text, at + source.text.length)
    }
  }
  if (!intervals.length) return null
  intervals.sort((a, b) => a.start - b.start || b.end - a.end)
  const parts = []
  let cursor = 0
  while (cursor < text.length) {
    const covers = intervals.filter(item => item.start <= cursor && item.end > cursor).sort((a,b) => b.end-a.end)[0]
    if (covers) {
      parts.push(reference(covers.source, cursor - covers.start, covers.end - cursor))
      cursor = covers.end
    } else {
      const end = intervals.find(item => item.start > cursor)?.start ?? text.length
      parts.push({ text: text.slice(cursor, end) }); cursor = end
    }
  }
  return parts
}

/** Build from the *current* surface on each step: never reference compacted-away content. */
export class EvidenceContext {
  constructor() { this.texts = new Map(); this.images = new Map() }
  bind(callId, seq) {
    for (const sources of this.texts.values()) for (const source of sources) if (source.from.callId === callId) source.from.seq = seq
    for (const source of this.images.values()) if (source.callId === callId) source.seq = seq
  }
  project(name, callId, content, compact, accept = () => true, seq) {
    const unchanged = { content, savedBytes: 0, imagesRemoved: 0 }
    if (!['library_read_page','library_retrieve','library_expand','library_search'].includes(name)) return unchanged
    const textIndex = content.findIndex(block => block.type === 'text')
    if (textIndex < 0 || content.filter(block => block.type === 'text').length !== 1) return unchanged
    let value
    try { value = JSON.parse(content[textIndex].text) } catch { return unchanged }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unchanged
    const candidate = structuredClone(value)
    let changed = false, imagesRemoved = 0
    if (compact) for (const field of fields(name, candidate)) {
      if (field.segment || field.text.length < 160) continue
      const parts = textParts(field.text, this.texts.get(field.key) ?? [])
      if (parts && bytes(parts) + 128 < bytes(field.text)) {
        delete field.record[field.field]
        field.record[`${field.field}Parts`] = parts
        changed = true
      }
    }
    const pageKey = name === 'library_read_page' ? keyFor(candidate.documentId, candidate.page) : null
    const retained = content.map((block, index) => ({block,index})).filter(({block}) => {
      if (!pageKey || block.type !== 'image') return true
      const key = `${pageKey}:${block.attachment?.attachmentId}`
      const previous = this.images.get(key)
      if (compact && previous && block.attachment?.attachmentId) {
        candidate.imageRef = previous
        imagesRemoved++; changed = true; return false
      }
      return true
    })
    let projected = changed ? retained.map(({block,index}) => index === textIndex ? {...block,text:JSON.stringify(candidate)} : block) : content
    // Small JSON overhead must not inflate text-only requests.
    if ((!imagesRemoved && bytes(projected) >= bytes(content)) || !accept(projected)) { projected = content; changed = false; imagesRemoved = 0 }
    const visible = changed ? candidate : value
    for (const field of fields(name, visible)) {
      if (field.text.length < 160) continue
      const sources = this.texts.get(field.key) ?? []
      if (!sources.some(source => source.text === field.text)) sources.push({ text: field.text, from: {callId,seq,path:field.path} })
      this.texts.set(field.key, sources.slice(-64))
    }
    if (pageKey) for (const block of projected) if (block.type === 'image' && block.attachment?.attachmentId) this.images.set(`${pageKey}:${block.attachment.attachmentId}`, {callId,seq,attachmentId:block.attachment.attachmentId})
    return { content: projected, savedBytes: bytes(content)-bytes(projected), imagesRemoved }
  }
}

/** Native surface replacement keeps original tool output/UI and exact replay intact. */
export function projectEvidenceStep(session, turn, step, tokenMeter) {
  if (!session.surface || !tokenMeter?.estimateMessage) return []
  const repairs = repairEvidenceReferences(session, tokenMeter)
  if (step < 2) return repairs
  const names = new Map(session.snapshotEvents().filter(event => event.type === 'tool/call').map(event => [event.data.callId,event.data.name]))
  const context = new EvidenceContext(), changes = [...repairs]
  for (const seq of [...session.surface.nodes]) {
    const event = session.eventAt(seq)
    if (event?.type !== 'tool/result') continue
    const result = event.data.message.content[0]
    if (result?.isError) continue
    const callId = event.data.message.source.callId, name = names.get(callId)
    const eligible = event.data.turn === turn && event.data.step === step-1 && event.surfaceOp === 'append'
    const before = tokenMeter.estimateMessage(event.data.message)
    const projected = context.project(name, callId, result.content, eligible, content => !eligible || tokenMeter.estimateMessage({...event.data.message,content:[{...result,content}]}) < before, seq)
    if (!eligible || (!projected.savedBytes && !projected.imagesRemoved)) continue
    const message = freezeMessage({...event.data.message,content:[{...result,content:projected.content}]})
    session.append('compaction/prune', {shadowedRange:{start:seq,end:seq},shadowedSeqs:[seq],shadowedTokenCount:before})
    const replacement = session.append('tool/result', {...event.data, message},
      {surfaceOp:{op:'replace',start:seq,end:seq},sourceEventSeqs:[seq]})
    context.bind(callId, replacement.seq)
    changes.push({originalSeq:seq,replacementSeq:replacement.seq,savedBytes:projected.savedBytes,imagesRemoved:projected.imagesRemoved})
  }
  return changes
}

const parsedResult = event => {
  if (event?.type !== 'tool/result') return null
  const result = event.data.message.content[0]
  if (result?.isError || !Array.isArray(result?.content)) return null
  const index = result.content.findIndex(b => b.type === 'text')
  if (index < 0) return null
  try { return {result, index, value:JSON.parse(result.content[index].text), callId:event.data.message.source.callId} } catch { return null }
}
const literalAt = (value, path) => Array.isArray(path) ? path.reduce((v,k) => v?.[k],value) : undefined
const sliceFor = (parsed, part) => {
  const text = literalAt(parsed?.value,part.from.path)
  if (typeof text !== 'string' || !Number.isSafeInteger(part.offset) || !Number.isSafeInteger(part.length) || part.offset < 0 || part.length < 0 || part.offset+part.length > text.length) return null
  const slice = text.slice(part.offset,part.offset+part.length)
  return digest(slice) === part.sha256 ? slice : null
}

/** Restore only missing exact slices after native compaction, including overflow retries. */
export function repairEvidenceReferences(session, tokenMeter) {
  if (!session.surface || !tokenMeter?.estimateMessage) return []
  const visible = new Map(), changes = []
  const calls = new Set(session.snapshotEvents().filter(e => e.type === 'tool/call' && ['library_read_page','library_retrieve','library_expand','library_search'].includes(e.data.name)).map(e => e.data.callId))
  for (const seq of [...session.surface.nodes]) {
    const event = session.eventAt(seq), parsed = parsedResult(event)
    if (!parsed || !calls.has(parsed.callId)) continue
    const value = structuredClone(parsed.value), restoredImages = [], sources = new Set([seq])
    let repaired = false
    const walk = object => {
      if (!object || typeof object !== 'object') return
      for (const [key, parts] of Object.entries(object)) {
        if (['textParts','excerptParts'].includes(key) && Array.isArray(parts)) {
          for (let i=0;i<parts.length;i++) {
            const part = parts[i]
            if (!part?.from || part.text !== undefined) continue
            if (sliceFor(visible.get(part.from.callId),part) !== null) continue
            const archived = parsedResult(session.eventAt(part.from.seq))
            const slice = archived?.callId === part.from.callId ? sliceFor(archived,part) : null
            if (slice === null) throw new Error('Cannot restore an exact document evidence reference from session history')
            parts[i] = {text:slice}; sources.add(part.from.seq); repaired = true
          }
        } else if (key === 'imageRef' && parts?.callId && parts?.attachmentId) {
          const find = source => source?.result.content.find(b => b.type === 'image' && b.attachment?.attachmentId === parts.attachmentId)
          if (find(visible.get(parts.callId))) continue
          const archived = parsedResult(session.eventAt(parts.seq))
          const image = archived?.callId === parts.callId ? find(archived) : null
          if (!image) throw new Error('Cannot restore an exact document image reference from session history')
          restoredImages.push(image); sources.add(parts.seq); delete object[key]; repaired = true
        } else walk(parts)
      }
    }
    walk(value)
    if (repaired) {
      const content = [...parsed.result.content.map((b,i) => i === parsed.index ? {...b,text:JSON.stringify(value)} : b), ...restoredImages]
      const message = freezeMessage({...event.data.message,content:[{...parsed.result,content}]})
      session.append('compaction/prune',{shadowedRange:{start:seq,end:seq},shadowedSeqs:[seq],shadowedTokenCount:tokenMeter.estimateMessage(event.data.message)})
      const replacement = session.append('tool/result',{...event.data,message},{surfaceOp:{op:'replace',start:seq,end:seq},sourceEventSeqs:[...sources]})
      visible.set(parsed.callId,parsedResult(replacement))
      changes.push({originalSeq:seq,replacementSeq:replacement.seq,restoredReferences:true})
    } else visible.set(parsed.callId,parsed)
  }
  return changes
}
