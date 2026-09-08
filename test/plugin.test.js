import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as Plugin from '../index.js'
import { runWorker } from '../bridge.js'

const python = process.env.PDF_EVIDENCE_TEST_PYTHON ?? 'python3'
const fixture = fileURLToPath(new URL('./fixtures.py', import.meta.url))
let callId = 0

async function setup(t, extra = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'dsh-evidence-test-'))
  execFileSync(python, [fixture, folder])
  const config = Plugin.resolveConfig({ python, allowedRoots: [folder], cacheDir: join(folder, 'cache'), enableStandaloneTools: true, ...extra })
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  // Fake the provider network and attachment storage only. Real Cordis lifecycle,
  // ToolRuntime schema/policy/rendering, subprocess and PyMuPDF all execute.
  const stored = []
  ctx.provide('attachments', { async saveImage(input) {
    assert.equal(input.mediaType, 'image/png')
    assert.equal(input.data.subarray(1, 4).toString(), 'PNG')
    stored.push(input)
    return { attachmentId: `test-image-${stored.length}`, mediaType: 'image/png',
      bytes: input.data.length, width: 100, height: 100, name: input.name }
  } })
  ctx.provide('llm', { async resolveModelInfo(_provider, model) {
    return { inputModalities: model === 'vision' ? ['text', 'image'] : ['text'] }
  } })
  const fiber = await ctx.plugin(Plugin, config)
  const agent = { options: { provider: 'test', model: 'vision' },
    session: { requestHeader: () => undefined, append: () => undefined } }
  const pdf = join(folder, 'manual.pdf')
  const call = (name, args, owner = agent, signal = new AbortController().signal) => ctx.tools.execute({
    callId: `evidence-${++callId}`, signal, name, arguments: { pdf, ...args }, agent: owner,
  })
  t.after(async () => { await ctx.fiber.dispose(); await rm(folder, { recursive: true, force: true }) })
  return { ctx, fiber, agent, call, pdf, config, stored }
}

test('native registration contributes tools/instructions and cleans up on unload', async t => {
  const { ctx, fiber } = await setup(t)
  assert.equal(ctx.tools.schemas().length, 7)
  const prompt = await ctx.systemPrompt.assemble()
  assert.ok(prompt.sections.some(s => s.name === 'document-evidence'))
  await fiber.dispose()
  assert.equal(ctx.tools.schemas().length, 0)
  assert.ok(!(await ctx.systemPrompt.assemble()).sections.some(s => s.name === 'document-evidence'))
})

test('actual registry dispatch: index → search → read → verify → HTML export', async t => {
  const { call } = await setup(t)
  const inspected = await call('pdf_inspect', { limit: 1 })
  assert.equal(inspected.isError, false)
  assert.equal(inspected.value.coverage.partial, true)
  const search = await call('pdf_search', { query: 'api' })
  assert.equal(search.value.hits[0].page, 1)
  const read = await call('pdf_read_page', { page: 1, image: false })
  assert.equal(read.value.page, 1)
  assert.ok(read.value.text.includes('API'))
  const quote = await call('pdf_verify_quote', { page: 1, quote: 'Change is +112' })
  assert.equal(quote.value.status, 'not_found_in_text_layer')
  const located = await call('pdf_locate_quote', { page: 1, quote: 'Change is -112' })
  assert.equal(located.isError, false)
  assert.equal(located.value.status, 'located_text')
  assert.ok(located.value.matches[0].regions.length > 0)
  const exported = await call('pdf_export_evidence', { question: 'Default?', claims: [{ text: 'Default is OFF.', pages: [1] }] })
  assert.equal(exported.value.semanticVerified, false)
  assert.ok((await readFile(exported.value.path, 'utf8')).includes('data:image/png;base64,'))
})

test('scan visual read renders attachment, permits note and improves retrieval', async t => {
  const { call, stored } = await setup(t)
  assert.deepEqual((await call('pdf_search', { query: 'torque' })).value.hits, [])
  const read = await call('pdf_read_page', { page: 3 })
  assert.equal(read.content[1].type, 'image')
  assert.equal(stored.length, 1)
  assert.equal(read.value.pngBase64, undefined)
  const note = await call('pdf_note_page', { page: 3, evidenceId: read.value.evidenceId,
    summary: 'Torque is 42 Nm', keywords: ['torque'] })
  assert.equal(note.value.source, 'agent_visual_note')
  const search = await call('pdf_search', { query: 'torque' })
  assert.equal(search.value.hits[0].page, 3)
})

test('unknown/unread pages, another agent, text-only notes and changed PDFs cannot forge provenance', async t => {
  const { call, pdf } = await setup(t)
  const payload = { question: 'Default?', claims: [{ text: 'OFF', pages: [1] }] }
  assert.equal((await call('pdf_export_evidence', payload)).isError, true)
  const read = await call('pdf_read_page', { page: 1, image: false })
  assert.equal((await call('pdf_note_page', { page: 1, evidenceId: read.value.evidenceId, summary: 'OFF' })).isError, true)
  assert.equal((await call('pdf_export_evidence', payload, { options: {}, session: {} })).isError, true)
  await appendFile(pdf, '\n% changed\n')
  assert.equal((await call('pdf_export_evidence', payload)).isError, true)
})

test('route with no image capability fails before rendering or saving attachments', async t => {
  const { call, stored } = await setup(t)
  const owner = { options: { provider: 'test', model: 'text-only' }, session: { requestHeader: () => undefined } }
  assert.equal((await call('pdf_read_page', { page: 1 }, owner)).isError, true)
  assert.equal(stored.length, 0)
  assert.ok((await call('pdf_read_page', { page: 1, image: false }, owner)).value.text)
})

test('post-execute policy denial does not grant read provenance', async t => {
  const { ctx, call } = await setup(t)
  ctx.on('tools/post-execute', async (exec, _result, next) => exec.name === 'pdf_read_page'
    ? { kind: 'block', feedback: [{ type: 'text', text: 'Blocked by test policy' }] } : next())
  assert.equal((await call('pdf_read_page', { page: 1, image: false })).isError, true)
  const exported = await call('pdf_export_evidence', { question: 'Default?', claims: [{ text: 'OFF', pages: [1] }] })
  assert.equal(exported.isError, true)
  assert.match(exported.content[0].text, /Read physical page/)
})

test('invalid model arguments and out-of-range pages become real tool errors', async t => {
  const { call } = await setup(t)
  assert.equal((await call('pdf_read_page', { page: 0, image: false })).isError, true)
  assert.equal((await call('pdf_read_page', { page: '1', image: false })).isError, true)
  assert.equal((await call('pdf_search', { query: '', top: -1 })).isError, true)
})

test('pre-abort, in-flight cancellation, timeout, output cap and missing Python are bounded failures', async t => {
  const { config, pdf } = await setup(t)
  const signal = AbortSignal.abort(new Error('cancelled before execution'))
  assert.throws(() => runWorker(config, 'inspect', { pdf }, signal), /cancelled/)
  const abort = new AbortController()
  const pending = runWorker(config, 'inspect', { pdf }, abort.signal)
  abort.abort(new Error('cancelled in flight'))
  await assert.rejects(pending, /cancelled in flight/)
  await assert.rejects(runWorker({ ...config, timeoutMs: 1 }, 'inspect', { pdf }), /timed out/)
  await assert.rejects(runWorker({ ...config, maxOutputBytes: 10 }, 'inspect', { pdf }), /maxOutputBytes/)
  await assert.rejects(runWorker({ ...config, python: '/nonexistent/python' }, 'inspect', { pdf }), /ENOENT/)
})

test('configuration rejects empty roots and invalid bounds before mounting', () => {
  assert.throws(() => Plugin.resolveConfig({ allowedRoots: [] }), /allowedRoots/)
  assert.throws(() => Plugin.resolveConfig({ maxDocumentPages: -1 }), /positive integer/)
  assert.throws(() => Plugin.resolveConfig({ maxImageSide: 1.5 }), /positive integer/)
})
