import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, writeFile, copyFile, readdir, stat, unlink } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { runWorker } from './bridge.js'
import { byteLength, positiveLimit, fairCandidates, compactCoverage, passage, textQuality } from './retrieval.js'

const key = value => createHash('sha256').update(value).digest('hex')
const inside = (root, path) => { const rel = relative(root, path); return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel) }
async function save(path, value) {
  const pending = `${path}.${randomUUID()}.tmp`
  await writeFile(pending, JSON.stringify(value), { mode: 0o600 })
  await rename(pending, path)
}

function recordIndex(document, stage, extra = {}) {
  const event = { at: new Date().toISOString(), stage, indexedPages: document.coverage.indexedPages,
    totalPages: document.coverage.totalPages, visualNotedPages: document.coverage.visualNotedPages, ...extra }
  document.indexTrace = [...(document.indexTrace ?? []), event].slice(-80)
}

/** Durable project catalog. Inputs must be resolved from an authenticated dsh session. */
export class DocumentLibrary {
  constructor(config) {
    this.config = config
    this.projects = new Map()
    this.queues = new Map()
    this.jobs = new Map()
    this.closed = false
  }
  async project(root) {
    root = await realpath(root)
    if (!this.projects.has(root)) this.projects.set(root, this.load(root))
    return this.projects.get(root)
  }
  async load(root) {
    const id = key(root)
    const folder = join(this.config.cacheDir, 'projects', id)
    await mkdir(folder, { recursive: true })
    const path = join(folder, 'catalog.json')
    let state
    try { state = JSON.parse(await readFile(path, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { version: 1, documents: {}, scopes: {} } }
    state.scopeRevisions ??= {}
    for (const doc of Object.values(state.documents)) {
      if (doc.status === 'indexing') { doc.status = 'interrupted'; doc.error = 'Host stopped; resume indexing to continue.'; recordIndex(doc, 'interrupted') }
    }
    await save(path, state)
    return { id, root, folder, path, state }
  }
  async mutate(project, action) {
    const before = this.queues.get(project.id) ?? Promise.resolve()
    const next = before.catch(() => {}).then(async () => {
      const result = await action(project.state)
      await save(project.path, project.state)
      return result
    })
    this.queues.set(project.id, next)
    return next
  }
  configFor(project) {
    return { ...this.config, allowedRoots: [project.folder], cacheDir: join(project.folder, 'index') }
  }
  async list(root, sessionId) {
    const project = await this.project(root)
    return { projectId: project.id, documents: Object.values(project.state.documents).map(({ path, ...doc }) => doc),
      scopeRevision: project.state.scopeRevisions[sessionId] ?? 0,
      selected: project.state.scopes[sessionId] ?? Object.keys(project.state.documents).slice(-1) }
  }
  async select(root, sessionId, ids) {
    const project = await this.project(root)
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !Object.hasOwn(project.state.documents, id))) throw new Error('Unknown document selection')
    await this.mutate(project, state => {
      const next = [...new Set(ids)]
      const previous = state.scopes[sessionId] ?? Object.keys(state.documents).slice(-1)
      if (JSON.stringify([...previous].sort()) !== JSON.stringify([...next].sort())) state.scopeRevisions[sessionId] = (state.scopeRevisions[sessionId] ?? 0) + 1
      state.scopes[sessionId] = next
    })
    return this.list(root, sessionId)
  }
  async discover(root) {
    root = await realpath(root)
    const found = [], queue = [{ path: root, depth: 0 }]
    let visited = 0
    while (queue.length && visited < 1000 && found.length < 50) {
      const current = queue.shift()
      for (const entry of await readdir(current.path, { withFileTypes: true })) {
        if (++visited > 1000) break
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
        const path = join(current.path, entry.name)
        if (entry.isDirectory() && current.depth < 2) queue.push({ path, depth: current.depth + 1 })
        if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
          const info = await stat(path)
          if (info.size <= this.config.maxPdfBytes) found.push({ path: relative(root, path), name: entry.name, bytes: info.size, large: info.size >= 1024 * 1024 })
        }
      }
    }
    return { candidates: found, truncated: visited >= 1000 || found.length >= 50 }
  }
  async addFile(root, sessionId, path, signal) {
    const project = await this.project(root)
    const source = await realpath(join(project.root, path))
    if (!inside(project.root, source)) throw new Error('PDF is outside this project')
    const info = await stat(source)
    if (!info.isFile() || !/\.pdf$/i.test(source) || info.size > this.config.maxPdfBytes) throw new Error('Expected a bounded PDF file')
    const incoming = join(project.folder, `${randomUUID()}.pdf`)
    await copyFile(source, incoming)
    return this.adopt(project, sessionId, incoming, path.split('/').at(-1), signal)
  }
  async adopt(project, sessionId, path, name, signal, attachmentId) {
    // The immutable snapshot, not a mutable project path, is the evidence version.
    let inspected
    try { inspected = await runWorker(this.configFor(project), 'inspect', { pdf: path, limit: 1 }, signal) }
    catch (error) { await unlink(path).catch(() => {}); throw error }
    const id = inspected.documentId
    await this.mutate(project, state => {
      if (!Object.hasOwn(state.documents, id)) state.documents[id] = {
        id, name, path, sha256: id, summary: null, keywords: [], outline: inspected.outline,
        version: null, effectiveDate: null, applicability: null, status: 'pending',
        coverage: inspected.coverage, addedAt: new Date().toISOString(),
      }
      state.scopeRevisions[sessionId] = (state.scopeRevisions[sessionId] ?? 0) + 1
      state.scopes[sessionId] = [id]
      if (attachmentId) state.documents[id].sourceAttachmentIds = [...new Set([...(state.documents[id].sourceAttachmentIds ?? []), attachmentId])]
    })
    if (project.state.documents[id].path !== path) await unlink(path)
    return id
  }
  async document(root, id) {
    const project = await this.project(root)
    if (typeof id !== 'string' || !Object.hasOwn(project.state.documents, id)) throw new Error('Document is not in this project')
    return { project, document: project.state.documents[id] }
  }
  async start(root, id, vision, describe) {
    if (this.closed) throw new Error('Document library is closed')
    const { project, document } = await this.document(root, id)
    if (this.closed) throw new Error('Document library is closed')
    const jobKey = `${project.id}/${id}`
    if (this.jobs.has(jobKey)) return { status: 'indexing' }
    if (this.jobs.size >= 2) throw new Error('Two index jobs are already active. Wait for one to finish.')
    const abort = new AbortController()
    const done = (async () => {
      await this.mutate(project, () => { document.status = 'indexing'; delete document.error; recordIndex(document, 'start') })
      try {
        for (let limit = document.coverage.indexedPages; limit < document.coverage.totalPages;) {
          limit = Math.min(limit + 25, document.coverage.totalPages)
          const result = await runWorker(this.configFor(project), 'inspect', { pdf: document.path, limit }, abort.signal)
          if (result.documentId !== document.id) throw new Error('Document snapshot integrity changed')
          await this.mutate(project, () => { document.coverage = result.coverage; document.outline = result.outline; recordIndex(document, 'text') })
        }
        const missing = [...document.coverage.unreadLowTextPages]
        for (const page of missing) {
          if (!vision) break
          const rendered = await runWorker(this.configFor(project), 'read', { pdf: document.path, page }, abort.signal)
          if (rendered.documentId !== document.id) throw new Error('Document snapshot integrity changed')
          await this.mutate(project, () => recordIndex(document, 'vision_start', { page }))
          const note = await vision(rendered, abort.signal)
          await runWorker(this.configFor(project), 'note', { pdf: document.path, page, evidenceId: rendered.evidenceId, ...note }, abort.signal)
          const result = await runWorker(this.configFor(project), 'inspect', { pdf: document.path, limit: 1 }, abort.signal)
          await this.mutate(project, () => { document.coverage = result.coverage; recordIndex(document, 'vision', { page }) })
        }
        if (!document.summary && describe) {
          await this.mutate(project, () => recordIndex(document, 'summary_start'))
          const context = await runWorker(this.configFor(project), 'catalog', { pdf: document.path }, abort.signal)
          try {
            const metadata = await describe(context, abort.signal)
            await this.mutate(project, () => { document.summary = metadata.summary; document.keywords = metadata.keywords; document.metadataStatus = 'model_summary'; recordIndex(document, 'summary') })
          } catch (error) {
            if (abort.signal.aborted) throw error
            await this.mutate(project, () => { document.metadataStatus = 'unavailable'; document.metadataError = error.message; recordIndex(document, 'summary_failed') })
          }
        }
        await this.mutate(project, () => { document.status = document.coverage.unreadLowTextPages.length ? 'needs_vision' : 'ready'; recordIndex(document, document.status) })
      } catch (error) {
        await this.mutate(project, () => { document.status = abort.signal.aborted ? 'interrupted' : 'failed'; document.error = error.message; recordIndex(document, document.status) })
      } finally { this.jobs.delete(jobKey) }
    })()
    this.jobs.set(jobKey, { abort, done })
    return { status: 'indexing' }
  }
  async cancel(root, id) {
    const { project } = await this.document(root, id)
    const job = this.jobs.get(`${project.id}/${id}`)
    job?.abort.abort(new Error('Indexing cancelled'))
    await job?.done
    return { status: 'stopped' }
  }
  async search(root, sessionId, query, signal, options = {}) {
    if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new Error('Supply a query of 1..2000 characters')
    const { selected } = await this.list(root, sessionId)
    const ids = options.ids ?? selected
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !selected.includes(id))) throw new Error('Requested documents must belong to this session selection')
    const scope = [...new Set(ids)]
    if (scope.length > this.config.maxRetrievalDocuments) throw new Error(`Narrow ids to at most ${this.config.maxRetrievalDocuments} selected documents`)
    const top = positiveLimit(options.top, this.config.maxRetrievalPages, this.config.maxRetrievalPages, 'top')
    const started = Date.now(), results = []
    for (const id of scope) {
      signal?.throwIfAborted()
      const { project, document } = await this.document(root, id)
      const result = await runWorker(this.configFor(project), 'search', { pdf: document.path, query }, signal)
      if (result.documentId !== id) throw new Error('Document snapshot integrity changed; add the original PDF again')
      results.push({ name: document.name, ...result })
    }
    const picked = new Set(fairCandidates(results, top).map(hit => `${hit.documentId}:p${hit.page}`))
    return { results: results.map(doc => ({ ...doc, name: doc.name.slice(0, 160), hits: doc.hits.filter(hit => picked.has(`${doc.documentId}:p${hit.page}`)),
        truncated: doc.truncated || doc.hits.some(hit => !picked.has(`${doc.documentId}:p${hit.page}`)) })), selected: scope,
      trace: { kind: 'search', query, results, candidatePages: results.reduce((sum, doc) => sum + doc.hits.length, 0), returnedPages: picked.size, elapsedMs: Date.now() - started },
      warning: 'Bounded candidates only, not exhaustive evidence. Local scores are not comparable across documents; selection interleaves document ranks.' }
  }
  async retrieve(root, sessionId, query, signal, options = {}) {
    const search = await this.search(root, sessionId, query, signal, options)
    return this.evidencePacket(root, query, signal, search, options.top ?? this.config.maxRetrievalPages, 1400, 'retrieve')
  }
  async expand(root, sessionId, query, signal, options = {}) {
    if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new Error('Supply a query of 1..2000 characters')
    const { selected } = await this.list(root, sessionId)
    if (!selected.includes(options.id)) throw new Error('Requested document must belong to this session selection')
    if (!Array.isArray(options.pages) || !options.pages.length || options.pages.length > 4 || options.pages.some(p => !Number.isSafeInteger(p) || p < 1)) throw new Error('Supply one to four physical seed pages')
    const { document } = await this.document(root, options.id)
    const total = document.coverage.totalPages
    if (options.pages.some(p => p > total)) throw new Error('Seed page exceeds document')
    const seeds = [...new Set(options.pages)]
    const pages = [...new Set([...seeds, ...seeds.flatMap(p => options.neighbors === false ? [] : [p - 1, p + 1]).filter(p => p >= 1 && p <= total)])]
    const doc = {documentId: document.id, name: document.name.slice(0,160), coverage: document.coverage, matchedPages: pages.length, hits: pages.map(page => ({page, source: seeds.includes(page) ? 'seed' : 'neighbor'}))}
    return this.evidencePacket(root, query, signal, { selected:[document.id], results:[doc], trace:{query, results:[doc], candidatePages:pages.length, seedPages:seeds} }, pages.length, 8000, 'expand')
  }
  async evidencePacket(root, query, signal, search, top, maxChars, kind) {
    const started = Date.now()
    const trace = { ...search.trace, kind, reads: [] }
    const result = { selected: search.selected, evidence: [], documents: search.results.map(doc => ({ id: doc.documentId, name: doc.name,
      coverage: compactCoverage(doc.coverage), status: doc.matchedPages ? 'not_read_budget' : 'no_match' })),
      next: [],
      budget: { maxBytes: this.config.maxRetrievalBytes, maxPages: top },
      warning: 'Extractive original-page evidence, not a verified answer. Check year, unit and meaning. Text or candidate gaps do not prove absence. For comparisons check every requested document; use cited text only for claims it supports.' }
    if (byteLength(result) > this.config.maxRetrievalBytes - 512) throw new Error('Scope metadata exceeds retrieval budget; narrow ids')
    const candidates = fairCandidates(search.results, top)
    const pageReads = new Map(), locations = new Map()
    // Two bounded worker calls per document instead of importing Python and
    // hashing/opening the same PDF for every page and every quote.
    for (const id of [...new Set(candidates.map(hit => hit.documentId))]) {
      signal?.throwIfAborted()
      const { project, document } = await this.document(root, id)
      const pages = candidates.filter(hit => hit.documentId === id).map(hit => hit.page)
      const read = await runWorker(this.configFor(project), 'read_many', { pdf: document.path, pages }, signal)
      if (read.documentId !== id || read.pages.some(page => page.documentId !== id)) throw new Error('Document snapshot integrity changed')
      const requests = []
      for (const page of read.pages) {
        pageReads.set(`${id}:p${page.page}`, page)
        if (textQuality(page.text) === 'readable') requests.push({ page: page.page, quote: passage(passage(page.text, query, maxChars).text, query, 160).text })
      }
      if (requests.length) {
        const located = await runWorker(this.configFor(project), 'locate_many', { pdf: document.path, requests }, signal)
        if (located.documentId !== id || located.results.some(item => item.documentId !== id)) throw new Error('Document snapshot integrity changed')
        for (const item of located.results) locations.set(`${id}:p${item.page}:${item.quote}`, item)
      }
    }
    for (const hit of candidates) {
      signal?.throwIfAborted()
      const doc = result.documents.find(doc => doc.id === hit.documentId)
      const { project, document } = await this.document(root, hit.documentId)
      const page = pageReads.get(`${document.id}:p${hit.page}`)
      if (page.documentId !== document.id) throw new Error('Document snapshot integrity changed')
      const quality = textQuality(page.text)
      const record = { documentId: document.id, page: hit.page, quality, sourceTextChars: page.text.length, sourceTextTruncated: page.textTruncated }
      trace.reads.push(record)
      if (quality !== 'readable') {
        if (doc.status !== 'text_evidence') doc.status = 'needs_vision'
        doc.visualPages = [...(doc.visualPages ?? []), hit.page]
        continue
      }
      let excerpt, evidence, limit = maxChars
      while (true) {
        excerpt = passage(page.text, query, limit)
        const shortQuote = passage(excerpt.text, query, 160).text
        const located = locations.get(`${document.id}:p${hit.page}:${shortQuote}`) ?? await runWorker(this.configFor(project), 'locate', { pdf: document.path, page: hit.page, quote: shortQuote }, signal)
        if (located.documentId !== document.id) throw new Error('Document snapshot integrity changed')
        evidence = { id: document.id, name: doc.name, page: hit.page, text: excerpt.text,
          truncated: excerpt.truncated || page.textTruncated, precision: located.precision,
          citation: `https://dsh-document-evidence.invalid/${document.id}/${hit.page}?quote=${encodeURIComponent(shortQuote).replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16))}` }
        result.evidence.push(evidence)
        if (byteLength(result) <= this.config.maxRetrievalBytes - 512) break
        result.evidence.pop()
        // A single large page must remain readable under a small byte budget.
        // Preserve an exact query-centered window and disclose its truncation.
        if (kind !== 'expand' || result.evidence.length || limit <= 250) { evidence = null; break }
        limit = Math.max(250, Math.floor(limit / 2))
      }
      record.excerptStart = excerpt.start; record.excerptEnd = excerpt.end
      if (!evidence) { record.omitted = 'byte_budget'; continue }
      record.precision = evidence.precision
      record.sentTextChars = excerpt.text.length
      doc.status = 'text_evidence'
    }
    for (const doc of result.documents) {
      const omitted = trace.reads.filter(r => r.documentId === doc.id && r.omitted).map(r => r.page)
      const truncated = result.evidence.filter(e => e.id === doc.id && e.truncated).map(e => e.page)
      if (doc.visualPages?.length) result.next.push({id:doc.id, action:'read_image', pages:doc.visualPages})
      if (omitted.length) result.next.push({id:doc.id, action:'expand_one_page', pages:omitted})
      if (truncated.length) result.next.push({id:doc.id, action:'expand_context_if_needed', pages:truncated})
      if (doc.status === 'no_match' || doc.status === 'not_read_budget') result.next.push({id:doc.id, action:'targeted_search', reason:doc.status})
    }
    // Reserve above covers normal hints; retain the hard packet boundary even with many gaps.
    while (byteLength(result) > this.config.maxRetrievalBytes && result.next.length) result.next.pop()
    if (byteLength(result) > this.config.maxRetrievalBytes) throw new Error('Evidence metadata exceeds budget; narrow the scope')
    trace.elapsedMs = Date.now() - started
    trace.evidencePages = result.evidence.length
    trace.modelBytes = byteLength(result)
    // The separate trace never enters model content or the byte budget.
    return { ...result, trace }
  }
  async close() {
    this.closed = true
    const jobs = [...this.jobs.values()]
    for (const job of jobs) job.abort.abort(new Error('Plugin unloaded'))
    await Promise.allSettled(jobs.map(job => job.done))
  }
}
