import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import Tools from '@deepseek-ai/dsh-tools'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import * as Plugin from '../index.js'

test('native library mount preserves shared RPC, accepts only trusted confirmed uploads, and grounds citations', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'host-library-test-'))
  const root = join(folder, 'project'), other = join(folder, 'other')
  await mkdir(root); await mkdir(other)
  const python = process.env.PDF_EVIDENCE_TEST_PYTHON ?? 'python3'
  execFileSync(python, [new URL('fixtures.py', import.meta.url).pathname, root])
  const bytes = await readFile(join(root, 'manual.pdf'))
  const ref = { attachmentId: 'file:trusted-test-upload', name: 'manual.pdf', bytes: bytes.length }
  const session = { id: 's1', root, requestHeader: () => ({ config: { provider: 'fixture', model: 'text' } }),
    snapshotEvents: () => [{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'file', attachment: ref }] } }] }
  const otherSession = { ...session, id: 's2', root: other, snapshotEvents: () => [] }
  const agent = { session, options: { provider: 'fixture', model: 'text' } }
  const ctx = new Context()
  await ctx.plugin(Tools); await ctx.plugin(Prompt)
  let route
  ctx.provide('connection', { rpc: { intercept() { throw new Error('Do not take the shared gateway interceptor') } }, fetch: { register(value) { route = value; return () => { route = undefined } } } })
  ctx.provide('sessions', { get: id => id === 's1' ? session : id === 's2' ? otherSession : undefined })
  ctx.provide('agents', { get: () => agent })
  ctx.provide('sandboxPolicy', { resolve: ({ session }) => ({ workspaceRoot: session.root }) })
  ctx.provide('attachments', { async *readFileStream(value) { assert.deepEqual(value, ref); yield bytes } })
  ctx.provide('llm', { resolveModelInfo: async () => ({ inputModalities: ['text'] }), prepareCall: async () => { throw new Error('No model used in this test') } })
  const fiber = await ctx.plugin(Plugin, { python, cacheDir: join(folder, 'cache') })
  t.after(async () => { await ctx.fiber.dispose(); await rm(folder, { recursive: true, force: true }) })
  assert.ok(route)
  // The default native plugin supplies the output contract before any user/tool call;
  // it must not depend on the optional standalone tools or a user asking for links.
  const sections = (await ctx.systemPrompt.assemble()).sections
  const citations = sections.find(section => section.name === 'document-library-citations')
  assert.ok(citations)
  assert.match(citations.text, /including the first answer and follow-up answers/)
  assert.match(citations.text, /The user does not need to request citations/)
  assert.match(citations.text, /\[文档名 · 第 N 页\]\(citation URL returned by the tool\)/)
  assert.ok(!sections.some(section => section.name === 'document-evidence'))
  for (const tool of ctx.tools.schemas().filter(tool => ['library_retrieve', 'library_expand', 'library_read_page', 'library_cite'].includes(tool.name))) {
    assert.match(tool.description, /clickable Markdown link beside the supported claim/)
  }
  assert.deepEqual(ctx.tools.schemas().map(tool => tool.name).sort(), ['library_cite', 'library_expand', 'library_list', 'library_read_page', 'library_retrieve', 'library_search'])
  const rpc = async (operation, args = {}, sessionId = 's1') => {
    const response = await route.fetch(new Request('http://localhost/api/documentEvidence/action', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'test', method: 'documentEvidence/action', payload: { sessionId, operation, args } }),
    }))
    return (await response.json()).result
  }
  assert.equal((await rpc('list')).value.documents.length, 0)
  assert.equal((await rpc('add', { attachmentId: ref.attachmentId })).ok, false)
  assert.equal((await rpc('add', { attachmentId: 'invented', confirmed: true })).ok, false)
  assert.equal((await rpc('list')).value.documents.length, 0)
  const added = await rpc('add', { attachmentId: ref.attachmentId, confirmed: true })
  assert.equal(added.ok, true)
  const id = added.value.id
  assert.deepEqual((await rpc('list')).value.documents[0].sourceAttachmentIds, [ref.attachmentId])
  assert.equal((await rpc('page', { id, page: 1, image: false }, 's2')).ok, false)
  const call = (name, args) => ctx.tools.execute({ callId: crypto.randomUUID(), name, arguments: args, agent, signal: new AbortController().signal })
  assert.equal((await call('library_cite', { id, page: 1, quote: 'Change is -112' })).isError, true)
  const firstPage = await call('library_read_page', { id, page: 1, image: false })
  assert.equal(firstPage.isError, false)
  const modelPage = JSON.parse(firstPage.content[0].text)
  assert.equal(modelPage.name, 'manual.pdf')
  assert.equal(modelPage.citation, firstPage.value.citation)
  assert.match(modelPage.citation, /^https:\/\/dsh-document-evidence\.invalid\/[a-f0-9]{64}\/1\?quote=$/)
  assert.equal((await call('library_read_page', { id, page: '1', image: false })).isError, false)
  for (const page of ['1.5', '1e0', '-1', '9007199254740993', {}, null]) assert.equal((await call('library_read_page', { id, page, image: false })).isError, true)
  const listed = await call('library_list', {})
  assert.equal(listed.isError, false)
  assert.ok(listed.meta.documentEvidence.documents[0].indexTrace.length)
  assert.equal(listed.content.some(part => part.type === 'text' && part.text.includes('indexTrace')), false)
  let turn = 1
  const reader = { ...agent, session: { ...session, snapshotEvents: () => [{ type: 'turn/start', seq: turn, data: { turn } }] } }
  const readCall = (name, args) => ctx.tools.execute({ callId: crypto.randomUUID(), name, arguments: args, agent: reader, signal: new AbortController().signal })
  const retrieved = await readCall('library_retrieve', { query: 'API', ids: [id], top: 1 })
  assert.equal(retrieved.isError, false)
  const payload = JSON.parse(retrieved.content[0].text)
  assert.equal(payload.evidence.length, 1)
  assert.match(payload.evidence[0].text, /Change is -112/)
  assert.ok(Buffer.byteLength(retrieved.content[0].text) <= 16000)
  assert.ok(retrieved.meta.documentEvidence.trace.reads.length)
  assert.equal(retrieved.content[0].text.includes('deliveryKeys'), false)
  assert.equal(retrieved.content[0].text.includes('sourceTextChars'), false)
  assert.equal((await readCall('library_cite', { id, page: 1, quote: 'invented support' })).isError, true)
  assert.equal((await readCall('library_cite', { id, page: 1, quote: 'Change is -112' })).isError, false)
  const repeat = await readCall('library_retrieve', { query: 'API', ids: [id], top: 1 })
  assert.equal(repeat.value.evidence[0].previouslyReturned, true)
  for (let i=0;i<3;i++) assert.equal((await readCall('library_search', { query: 'API' })).isError, false)
  assert.equal((await readCall('library_retrieve', { query: 'API' })).isError, true)
  const expanded = await readCall('library_expand', { id, query:'API', pages:[1] })
  assert.equal(expanded.isError,false)
  assert.ok(expanded.meta.documentEvidence.trace.reads.some(r => r.page === 2))
  assert.ok(Buffer.byteLength(expanded.content[0].text)<=16000)
  assert.equal((await readCall('library_expand', { id, query:'API', pages:[1] })).isError,true)
  execFileSync(python,['-c',`import fitz,sys
p=fitz.open(sys.argv[1]); p.set_metadata({'title':'Second independent document'}); p.save(sys.argv[2])`,join(root,'manual.pdf'),join(root,'second.pdf')])
  const second = await rpc('add',{path:'second.pdf',confirmed:true})
  assert.equal(second.ok,true)
  await rpc('select',{ids:[id,second.value.id]})
  assert.equal((await readCall('library_retrieve',{query:'API',ids:[second.value.id]})).isError,false)

  turn++
  assert.ok((await readCall('library_retrieve', { query: 'API', ids: [id] })).value.evidence[0].text)
  await call('library_read_page', { id, page: 1, image: false })
  const cited = await call('library_cite', { id, page: 1, quote: 'Change is -112' })
  assert.equal(cited.isError, false)
  assert.equal(cited.value.status, 'located_text')
  assert.match(cited.value.citation, /^https:\/\/dsh-document-evidence\.invalid\/[a-f0-9]{64}\/1\?quote=/)
  // Scope changes revoke old page grants and passage/dedup state, including A→B→A.
  await rpc('select', { ids: [second.value.id] })
  for (const [name, args] of [
    ['library_read_page', { id, page: 1, image: false }],
    ['library_cite', { id, page: 1, quote: 'Change is -112' }],
    ['library_retrieve', { ids: [id], query: 'API' }],
    ['library_expand', { id, pages: [1], query: 'API' }],
  ]) assert.equal((await call(name, args)).isError, true, name)
  assert.equal((await rpc('page', { id, page: 1, image: false })).ok, true, 'sidebar browsing still works')
  await rpc('select', { ids: [id, second.value.id] })
  assert.equal((await call('library_cite', { id, page: 1, quote: 'Change is -112' })).isError, true)
  assert.ok((await readCall('library_retrieve', { query: 'API', ids: [id] })).value.evidence[0].text)
  await rpc('select', { ids: [] })
  assert.equal((await call('library_read_page', { id, page: 1, image: false })).isError, true)
  assert.deepEqual((await readCall('library_retrieve', { query: 'API' })).value.evidence, [])
  // Change away and back while a page-image call is waiting on model capabilities.
  await rpc('select', { ids: [id] })
  const originalResolve = ctx.llm.resolveModelInfo
  ctx.llm.resolveModelInfo = async () => {
    await rpc('select', { ids: [] })
    await rpc('select', { ids: [id] })
    return { inputModalities: ['image'] }
  }
  ctx.attachments.saveImage = async () => ({ attachmentId: 'test:image' })
  const raced = await call('library_read_page', { id, page: 1, image: true })
  assert.equal(raced.isError, true)
  assert.match(raced.content[0].text, /selection changed/)
  ctx.llm.resolveModelInfo = originalResolve
  assert.equal((await call('library_cite', { id, page: 1, quote: 'Change is -112' })).isError, true)
  await fiber.dispose()
  assert.equal(route, undefined)
  assert.ok(!(await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'document-library-citations'))
  assert.equal(ctx.tools.schemas().length, 0)
})
