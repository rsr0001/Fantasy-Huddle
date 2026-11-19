import {JSDOM} from 'jsdom'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8')
const dom=new JSDOM(html,{url:'https://example.com/',pretendToBeVisual:true})
for(const name of ['window','document','navigator','location','history','sessionStorage','localStorage','Option'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true})
await import('../app.mjs')
assert.match(document.querySelector('#report').textContent,/No league selected/)
document.querySelector('[data-view=stats]').click()
assert.equal(document.querySelector('#report').hidden,true)
assert.equal(document.querySelector('#stats-view').hidden,false)
document.querySelector('[data-view=awards]').click()
assert.equal(document.querySelector('#stats-view').hidden,true)
assert.equal(document.querySelector('#awards-view').hidden,false)
document.querySelector('[data-view=standings]').click()
assert.equal(document.querySelector('#standings-view').hidden,false)
console.log('Independent tab views passed')
