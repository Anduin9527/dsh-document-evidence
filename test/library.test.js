import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { DocumentLibrary } from '../library.js'
import { resolveConfig } from '../index.js'
const python = process.env.PDF_EVIDENCE_TEST_PYTHON ?? 'python3'

async function setup(t) {
  const folder = await mkdtemp(join(tmpdir(), 'library-test-'))
  const root = join(folder, 'project'), other = join(folder, 'other')
  await mkdir(root); await mkdir(other)
  execFileSync(python, [new URL('fixtures.py', import.meta.url).pathname, root])
  const config = resolveConfig({ python, cacheDir: join(folder, 'cache'), allowedRoots: [root] })
  const library = new DocumentLibrary(config)
  t.after(async () => { await library.close(); await rm(folder, { recursive: true, force: true }) })
  return { library, config, root, other, folder }
}

test('project snapshots are shared across sessions, scoped per session, and isolated across projects', async t => {
  const { library, root, other } = await setup(t)
  const id = await library.addFile(root, 's1', 'manual.pdf')
  assert.equal((await library.list(root, 's2')).documents[0].id, id)
  await library.select(root, 's1', [])
  assert.deepEqual((await library.list(root, 's1')).selected, [])
  assert.deepEqual((await library.list(root, 's2')).selected, [id])
  assert.equal((await library.list(other, 's3')).documents.length, 0)
  await assert.rejects(library.document(other, id), /not in this project/)
  await assert.rejects(library.addFile(root, 's1', '../other/manual.pdf'))
  await writeFile(join(root, 'manual.pdf'), 'changed')
  assert.equal((await library.search(root, 's2', 'API')).results[0].hits[0].page, 1)
})

test('background text indexing exposes partial progress and honest visual gap, then resumes with vision notes', async t => {
  const { library, root } = await setup(t)
  const id = await library.addFile(root, 's1', 'manual.pdf')
  assert.equal((await library.list(root, 's1')).documents[0].coverage.indexedPages, 1)
  await library.start(root, id)
  await Promise.all([...library.jobs.values()].map(job => job.done))
  let doc = (await library.list(root, 's1')).documents[0]
  assert.equal(doc.status, 'needs_vision')
  assert.deepEqual(doc.indexTrace.map(e => e.stage), ['start', 'text', 'needs_vision'])
  assert.equal(doc.indexTrace.at(-1).indexedPages, 4)
  assert.equal(doc.coverage.indexedPages, 4)
  const pages = []
  await library.start(root, id, async page => { pages.push(page.page); return { summary: 'Torque is 42 Nm', keywords: ['torque'] } })
  await Promise.all([...library.jobs.values()].map(job => job.done))
  doc = (await library.list(root, 's1')).documents[0]
  assert.equal(doc.status, 'ready')
  assert.equal(doc.indexTrace.at(-1).stage, 'ready')
  assert.ok(doc.indexTrace.some(e => e.stage === 'vision' && e.page === 3))
  const restored = new DocumentLibrary(library.config)
  assert.deepEqual((await restored.list(root, 's1')).documents[0].indexTrace, doc.indexTrace)
  await restored.close()
  assert.ok(pages.includes(3))
  assert.ok((await library.search(root, 's1', 'torque')).results[0].hits.length > 0)
})

test('catalog restart recovers scopes and marks an unfinished job interrupted', async t => {
  const { library, root, config } = await setup(t)
  const id = await library.addFile(root, 's1', 'manual.pdf')
  const project = await library.project(root)
  await library.mutate(project, state => { state.documents[id].status = 'indexing'; state.scopes.s2 = [] })
  const restarted = new DocumentLibrary(config)
  t.after(() => restarted.close())
  assert.equal((await restarted.list(root, 's1')).documents[0].status, 'interrupted')
  assert.deepEqual((await restarted.list(root, 's2')).selected, [])
})

test('cancel waits for active visual work to stop and preserves resumable coverage', async t => {
  const { library, root } = await setup(t)
  const id = await library.addFile(root, 's1', 'manual.pdf')
  let started, stopped = false
  const began = new Promise(resolve => { started = resolve })
  await library.start(root, id, async (_page, signal) => {
    started()
    await new Promise((resolve, reject) => {
      if (signal.aborted) reject(signal.reason)
      else signal.addEventListener('abort', () => { stopped = true; reject(signal.reason) }, { once: true })
    })
  })
  await began
  await library.cancel(root, id)
  assert.equal(stopped, true)
  assert.equal(library.jobs.size, 0)
  const doc = (await library.list(root, 's1')).documents[0]
  assert.equal(doc.status, 'interrupted')
  assert.equal(doc.indexTrace.at(-1).stage, 'interrupted')
  assert.equal(doc.coverage.indexedPages, 4)
})

test('same bytes reuse a document; changed snapshots fail instead of recycling old citations', async t => {
  const { library, root } = await setup(t)
  const id = await library.addFile(root, 's1', 'manual.pdf')
  await copyFile(join(root, 'manual.pdf'), join(root, 'renamed.pdf'))
  assert.equal(await library.addFile(root, 's1', 'renamed.pdf'), id)
  assert.equal((await library.list(root, 's1')).documents.length, 1)
  const { document } = await library.document(root, id)
  const bytes = await readFile(document.path)
  await writeFile(document.path, Buffer.concat([bytes, Buffer.from('\n%changed')]))
  await assert.rejects(library.search(root, 's1', 'API'), /integrity changed/)
})


test('retrieval filters selected documents, caps total pages, and never substitutes visual notes for original text', async t => {
  const { library, root, config } = await setup(t)
  const id = await library.addFile(root, 's1', 'manual.pdf')
  await library.start(root, id, async () => ({ summary: 'Torque is 42 Nm', keywords: ['torque'] }))
  await Promise.all([...library.jobs.values()].map(job => job.done))
  await assert.rejects(library.search(root, 's1', 'API', undefined, { ids: ['unknown'] }), /selection/)
  await assert.rejects(library.search(root, 's1', 'API', undefined, { top: 999 }), /top/)
  const result = await library.retrieve(root, 's1', 'torque', undefined, { top: 1 })
  assert.equal(result.evidence.length, 0)
  assert.equal(result.documents[0].status, 'needs_vision')
  assert.ok(result.documents[0].visualPages.length)
  assert.equal(result.trace.reads.length, 1)
  await library.select(root, 's1', [])
  await assert.rejects(library.retrieve(root, 's1', 'API', undefined, { ids: [id] }), /selection/)
  const empty = await library.retrieve(root, 's1', 'API')
  assert.equal(empty.evidence.length, 0)
})

test('deep expansion reads original neighboring context with explicit visual and byte gaps', async t => {
  const { library, root } = await setup(t)
  const id = await library.addFile(root, 's1', 'manual.pdf')
  const packet = await library.expand(root,'s1','Change',undefined,{id,pages:[1]})
  assert.deepEqual(packet.trace.reads.map(r=>r.page),[1,2])
  assert.match(packet.evidence[0].text,/Change is -112/)
  assert.equal(packet.trace.kind,'expand')
  const single = await library.expand(root,'s1','Change',undefined,{id,pages:[1],neighbors:false})
  assert.deepEqual(single.trace.reads.map(r=>r.page),[1])
  await assert.rejects(library.expand(root,'s1','Change',undefined,{id,pages:[0]}))
  await assert.rejects(library.expand(root,'s1','Change',undefined,{id,pages:[999]}))
  await library.select(root,'s1',[])
  await assert.rejects(library.expand(root,'s1','Change',undefined,{id,pages:[1]}),/selection/)
})

test('deep reading fits a large seed page instead of repeatedly omitting it under a small budget', async t => {
  const { library, root } = await setup(t)
  execFileSync(python,['-c',`import fitz,sys
p=fitz.open(); page=p.new_page(width=1000,height=3000)
page.insert_textbox(fitz.Rect(30,30,970,2970), 'Employees in 2023 were 123. '+('Long supporting context with units and details. '*130), fontsize=11)
p.save(sys.argv[1])`,join(root,'long.pdf')])
  const id = await library.addFile(root,'s1','long.pdf')
  library.config.maxRetrievalBytes=4000
  const packet = await library.expand(root,'s1','Employees',undefined,{id,pages:[1],neighbors:false})
  assert.equal(packet.evidence.length,1)
  assert.ok(packet.evidence[0].truncated)
  assert.match(packet.evidence[0].text,/Employees in 2023/)
  const {trace,...payload}=packet
  assert.ok(Buffer.byteLength(JSON.stringify(payload))<=4000)
  assert.ok(payload.next.some(n=>n.action==='expand_context_if_needed'))
})
