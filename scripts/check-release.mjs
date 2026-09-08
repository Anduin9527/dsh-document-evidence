import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, relative } from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const p=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'))
assert.equal(p.license,'AGPL-3.0-only','Release requires the approved plugin license')
assert.match(p.repository?.url??'',/^git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/,'Set the actual source repository')
assert.equal(p.publishConfig?.tag,'beta','Prerelease must not use latest')
assert.ok(p.keywords.includes('dsh-plugin'))
assert.equal(p.peerDependencies['@deepseek-ai/dsh-llm'],'0.1.3-alpha.2')
for(const name of p.files) {
 const path=resolve(root,name)
 assert.ok(!relative(root,path).startsWith('..'),'Packaged files must stay in the plugin')
 await access(path)
 if(name.endsWith('.js')) {
  const source=await readFile(path,'utf8')
  for(const m of source.matchAll(/from\s+['"](@[^/]+\/[^/'"]+)['"]/g)) assert.ok(p.peerDependencies[m[1]]||p.dependencies?.[m[1]],`Undeclared runtime import: ${m[1]}`)
  assert.ok(!/\bsk-[A-Za-z0-9]{20,}/.test(source),'Key-like literal in package source')
 }
}
assert.match(await readFile(resolve(root,'LICENSE'),'utf8'),/GNU AFFERO GENERAL PUBLIC LICENSE/)
await access(resolve(root,p.dsh.bundle.patch))
console.log('Release metadata, direct imports and package source files verified.')
