import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { runWorker } from './bridge.js'
import { outputs, pdf, page, claims } from './schemas.js'
import { instructions } from './instructions.js'
import { applyLibrary } from './host-library.js'

export const name = 'document-evidence'
export const inject = ['tools', 'systemPrompt']
export const Config = Schema.object({
  python: Schema.string().default('auto'),
  allowedRoots: Schema.array(Schema.string()).default(['.']),
  cacheDir: Schema.string().default('auto'),
  enableStandaloneTools: Schema.boolean().default(false),
  reuseVisibleEvidence: Schema.boolean().default(true),
  maxPdfBytes: Schema.number().default(100 * 1024 * 1024),
  maxDocumentPages: Schema.number().default(2000),
  maxCandidates: Schema.number().default(30),
  maxTextChars: Schema.number().default(12000),
  maxRetrievalPages: Schema.number().default(8),
  maxRetrievalBytes: Schema.number().default(16000),
  maxRetrievalDocuments: Schema.number().default(12),
  maxRetrievalCalls: Schema.number().default(3),
  maxExportPages: Schema.number().default(12),
  dpi: Schema.number().default(150),
  maxImageSide: Schema.number().default(2400),
  timeoutMs: Schema.number().default(120000),
  maxOutputBytes: Schema.number().default(32 * 1024 * 1024),
})

export function resolveConfig(options) {
  const config = Config(options)
  for (const key of ['maxPdfBytes', 'maxDocumentPages', 'maxCandidates', 'maxTextChars',
    'maxRetrievalPages', 'maxRetrievalBytes', 'maxRetrievalDocuments', 'maxRetrievalCalls', 'maxExportPages', 'dpi', 'maxImageSide', 'timeoutMs', 'maxOutputBytes']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error(`${key} must be a positive integer`)
  }
  if (config.maxRetrievalBytes < 4000 || config.maxRetrievalBytes > 64000 || config.maxRetrievalPages > 24 || config.maxRetrievalDocuments > 24 || config.maxRetrievalCalls > 10) throw new Error('Retrieval limits exceed supported bounds')
  if (!config.allowedRoots.length || config.allowedRoots.some(root => !root.trim())) {
    throw new Error('allowedRoots must contain at least one directory')
  }
  if (!config.python.trim() || !config.cacheDir.trim()) throw new Error('python and cacheDir must be non-empty')
  const storage = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'data', 'document-evidence')
  if (config.cacheDir === 'auto') config.cacheDir = storage
  if (config.python === 'auto') {
    const managed = join(storage, 'python', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    config.python = existsSync(managed) ? managed : 'python3'
  }
  return { ...config, allowedRoots: config.allowedRoots.map(root => resolve(root)), cacheDir: resolve(config.cacheDir) }
}

export async function apply(ctx, options) {
  const config = resolveConfig(options)
  await ctx.inject(['connection', 'sessions', 'agents', 'sandboxPolicy', 'attachments', 'llm'], scope => { applyLibrary(scope, config) })
  if (!config.enableStandaloneTools) return
  const lifecycle = new AbortController()
  // Provenance belongs to the calling agent, not to another conversation using the same plugin.
  const readByAgent = new WeakMap()
  function evidence(exec) {
    if (!exec.agent) throw new Error('An owning harness agent is required for evidence provenance')
    if (!readByAgent.has(exec.agent)) readByAgent.set(exec.agent, { read: new Set(), visual: new Set() })
    return readByAgent.get(exec.agent)
  }
  ctx.effect(() => () => lifecycle.abort(new Error('Document evidence plugin unloaded')))
  ctx.systemPrompt.section({ name: 'document-evidence', order: 1250, text: instructions })
  // Observe the final policy-normalized result. A post-execute denial must not
  // grant provenance for material that never reached the caller.
  ctx.on('tools/result', (exec, result) => {
    if (exec.name !== 'pdf_read_page' || result.isError || !exec.agent) return
    const value = result.value
    if (!value || value.source !== 'physical_pdf_page' || typeof value.evidenceId !== 'string') return
    const ledger = evidence(exec)
    ledger.read.add(value.evidenceId)
    if (value.image && result.content.some(block => block.type === 'image')) ledger.visual.add(value.evidenceId)
  })

  function register(operation, toolName, description, parameters, execute) {
    ctx.tools.register(defineTool({
      name: toolName, description, parameters,
      output: {
        schema: outputs[operation],
        render: (_args, value) => {
          const { image, ...text } = value
          return [{ type: 'text', text: JSON.stringify(text) },
            ...(image ? [{ type: 'image', attachment: image }] : [])]
        },
      },
      async execute(args, exec) {
        const signal = AbortSignal.any([exec.signal, lifecycle.signal])
        const run = (op, input) => runWorker(config, op, input, signal)
        return execute ? execute(args, exec, run, signal) : run(operation, args)
      },
    }))
  }

  register('inspect', 'pdf_inspect', 'Build/reuse a local text index and report PDF coverage, outline and page statistics. Does not call a model or build a visual index.',
    { pdf, limit: { type: 'integer', description: 'Index first N pages; 0 or omitted indexes all. Existing wider coverage is preserved.' } })
  register('search', 'pdf_search', 'Search Chinese/English terms across PDF text and agent-authored visual notes. Empty hits are valid. Read actual pages before citing.',
    { pdf, query: { type: 'string', required: true }, top: { type: 'integer' } })
  register('read', 'pdf_read_page', 'Read one physical PDF page. Defaults to a real image attachment plus text; requires an image-capable model. image=false reads only text.',
    { pdf, page, image: { type: 'boolean' } }, async (args, exec, run, signal) => {
      evidence(exec)
      const wantImage = args.image !== false
      let attachments
      if (wantImage) {
        attachments = ctx.get('attachments')
        const llm = ctx.get('llm')
        const header = exec.agent.session.requestHeader()?.config
        const provider = header?.provider ?? exec.agent.options.provider
        const model = header?.model ?? exec.agent.options.model
        if (!attachments || !llm || !provider || !model) throw new Error('Image reads require attachments and a resolved image-capable model; use image=false for text')
        const info = await llm.resolveModelInfo(provider, model, signal)
        if (!info.inputModalities?.includes('image')) throw new Error('Current model does not declare image input; use image=false or switch model')
      }
      const value = await run('read', args)
      const { pngBase64, ...result } = value
      if (wantImage) {
        signal.throwIfAborted()
        result.image = await attachments.saveImage({ data: Buffer.from(pngBase64, 'base64'), mediaType: 'image/png', name: `page-${value.page}.png` })
        signal.throwIfAborted()
      }
      return result
    })
  register('note', 'pdf_note_page', 'Save a concise visual page card for future retrieval after reading that page image. The card is model-authored, not verified OCR.',
    { pdf, page, evidenceId: { type: 'string', required: true }, summary: { type: 'string', required: true },
      keywords: { type: 'array', items: { type: 'string' } } }, async (args, exec, run) => {
      if (!evidence(exec).visual.has(args.evidenceId)) throw new Error('Read this page image in this agent before saving a visual note')
      // Ensure the corresponding text index includes this page, including after a partial ingest.
      await run('inspect', { pdf: args.pdf, limit: args.page })
      return run('note', args)
    })
  register('verify', 'pdf_verify_quote', 'Check a literal quote against the specified original text layer. Preserves signs and punctuation; never verifies semantics or scans.',
    { pdf, page, quote: { type: 'string', required: true } })
  register('locate', 'pdf_locate_quote', 'Locate an exact quote using PDF character geometry. Returns normalized regions on the rotated page. Multiple occurrences remain separate; scans without a text layer return page-only precision.',
    { pdf, page, quote: { type: 'string', required: true } })
  register('export', 'pdf_export_evidence', 'Export a self-contained local HTML with grounded claims and page images. All cited pages must have been read by this agent. Returns an absolute file path.',
    { pdf, question: { type: 'string', required: true }, claims }, async (args, exec, run) => {
      const ledger = evidence(exec)
      if (!args.claims.length || args.claims.length > 30) throw new Error('Supply 1..30 grounded claims')
      const pages = [...new Set(args.claims.flatMap(claim => claim.pages))]
      if (!pages.length || pages.length > config.maxExportPages) throw new Error('Invalid export page count')
      for (const p of pages) {
        const value = await run('read', { pdf: args.pdf, page: p, image: false })
        if (!ledger.read.has(value.evidenceId)) throw new Error(`Read physical page ${p} in this agent before citing it`)
      }
      return run('export', args)
    })
}
