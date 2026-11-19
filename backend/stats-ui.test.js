import {JSDOM} from 'jsdom'
import assert from 'node:assert/strict'
import {initStats} from '../stats.mjs'
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.com/'})
globalThis.document=dom.window.document;globalThis.Option=dom.window.Option
const raw={'1':{gp:1,pass_yd:200,pass_td:2},'2':{gp:1,pass_yd:300,pass_td:1}}
globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/matchups/')?[{players_points:{'1':18}}]:{raw,updated_at:new Date().toISOString(),stale:false}})
const root=document.querySelector('#root'), stats=initStats({root})
stats.setContext({league:{league_id:'12345678',season:'2026',roster_positions:['FLEX'],scoring_settings:{pass_yd:.05,pass_td:4}},rosters:[{players:['1']}],directory:{'1':{position:'QB',full_name:'Rostered One'},'2':{position:'QB',full_name:'Free Agent'}},maximum:1,currentWeek:1})
stats.show();await new Promise(resolve=>setTimeout(resolve,100))
assert.match(root.textContent,/Free Agent/);assert.match(root.textContent,/Available/);assert.match(root.textContent,/19.00/)
assert.match(root.textContent,/Rostered One/);assert.match(root.textContent,/18.00/)
root.querySelector('#stats-pool').value='available';root.querySelector('#stats-pool').dispatchEvent(new dom.window.Event('change'));await new Promise(resolve=>setTimeout(resolve,50));assert.match(root.textContent,/Free Agent/);assert.doesNotMatch(root.textContent,/Rostered One/)
console.log('All-player scoring and available filter passed')
