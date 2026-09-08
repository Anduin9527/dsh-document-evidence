import test from 'node:test'
import assert from 'node:assert/strict'
import { passage, fairCandidates, textQuality, compactSearch, modelPayload, byteLength, fingerprint } from '../retrieval.js'

test('global selection is bounded and does not compare incompatible document scores', () => {
  const docs = ['a','b','c'].map((documentId, i) => ({ documentId, hits: [1,2,3].map(page => ({page,score:1000**i})) }))
  assert.deepEqual(fairCandidates(docs, 4).map(h => [h.documentId,h.page]), [['a',1],['b',1],['c',1],['a',2]])
})
test('passages remain contiguous original text and unusable text is disclosed', () => {
  const source = 'irrelevant '.repeat(200) + '\nEmployees were 123 in 2023.\n' + 'context '.repeat(200)
  const result = passage(source, 'employees', 200)
  assert.ok(source.includes(result.text)); assert.ok(result.text.includes('123')); assert.ok(result.truncated)
  assert.equal(textQuality('few words'), 'low_text')
  assert.equal(textQuality('x'.repeat(80)+'\ufffd'.repeat(20)), 'garbled_text')
})
test('only identical excerpts are suppressed; byte fitting preserves original input and excludes trace', () => {
  const coverage = {indexedPages:3,totalPages:3,partial:false,visualNotedPages:0,unreadLowTextPages:[]}
  const raw = { trace:{secretForDisplay:'not model content'}, results:[{documentId:'a',coverage,hits:[{page:1,excerpt:'x'.repeat(3000),source:'text_layer'},{page:2,excerpt:'new',source:'text_layer'}]}] }
  const old = fingerprint(['a',2,'old','text_layer'])
  const compact = compactSearch(raw,new Set([old]))
  assert.equal(compact.value.results[0].hits[1].excerpt,'new')
  const payload = modelPayload('library_search',compact.value,1000)
  assert.ok(byteLength(payload)<=1000); assert.equal(payload.trace,undefined)
  assert.equal(raw.results[0].hits.length,2)
  assert.ok(compactSearch(raw,new Set([fingerprint(['a',2,'new','text_layer'])])).value.results[0].hits[1].previouslyReturned)
})
