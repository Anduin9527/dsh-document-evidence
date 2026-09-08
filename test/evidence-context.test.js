import test from 'node:test'
import assert from 'node:assert/strict'
import { EvidenceContext } from '../evidence-context.js'
const id='a'.repeat(64)
const text=Array.from({length:60},(_,i)=>`Measured row ${i}: ${i*7} units.\n`).join('')
const content=value=>[{type:'text',text:JSON.stringify(value)}]
const parse=blocks=>JSON.parse(blocks.find(b=>b.type==='text').text)
const at=(value,path)=>path.reduce((v,k)=>v[k],value)

test('incremental page content reconstructs exactly from earlier visible evidence without cross-document reuse',()=>{
 const context=new EvidenceContext(), earlier={evidence:[{id,page:1,text}]}
 context.project('library_retrieve','first',content(earlier),false)
 const full='Heading\n'+text+'\nImportant new fact: confidence interval is 8–11.'
 const original=content({documentId:id,page:1,text:full,citation:'https://example.invalid/1'})
 const result=context.project('library_read_page','second',original,true)
 const projected=parse(result.content)
 assert.ok(result.savedBytes>1000)
 assert.equal(projected.text,undefined)
 assert.equal(projected.textParts.map(p=>p.text??at(earlier,p.from.path).slice(p.offset,p.offset+p.length)).join(''),full)
 assert.equal(JSON.parse(original[0].text).text,full,'input remains unchanged')
 assert.equal(context.project('library_read_page','other',content({documentId:'b'.repeat(64),page:1,text:full}),true).savedBytes,0)
 const fresh=new EvidenceContext()
 assert.equal(fresh.project('library_read_page','after-compaction',original,true).savedBytes,0,'no reference to evidence missing from the visible surface')
})

test('only exact prior images for the same document page are elided',()=>{
 const context=new EvidenceContext(), picture={type:'image',attachment:{attachmentId:'image:immutable',mediaType:'image/png'}}
 const blocks=[...content({documentId:id,page:3,text:'a short caption'}),picture]
 context.project('library_read_page','first',blocks,false)
 const projected=context.project('library_read_page','again',blocks,true)
 assert.equal(projected.imagesRemoved,1)
 assert.equal(projected.content.some(b=>b.type==='image'),false)
 assert.equal(parse(projected.content).imageRef.callId,'first')
 assert.equal(context.project('library_read_page','different-page',[...content({documentId:id,page:4,text:'a short caption'}),picture],true).imagesRemoved,0)
})
