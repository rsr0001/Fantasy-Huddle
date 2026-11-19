import {JSDOM} from 'jsdom'
import assert from 'node:assert/strict'
import {initDefense} from '../defense.mjs'
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.com/'})
globalThis.document=dom.window.document;globalThis.Option=dom.window.Option
const raw={'1':{gp:1,pass_yd:200,pass_td:2},'2':{gp:1,rec:5,rec_yd:90}}
const detail=[{player_id:'1',opponent:'DAL',game_id:'g1',stats:raw['1']},{player_id:'2',opponent:'DAL',game_id:'g1',stats:raw['2']}]
globalThis.fetch=async url=>({ok:true,json:async()=>String(url).includes('/matchups/')?[{players_points:{'1':18,'2':14}}]:{raw,details:detail,updated_at:new Date().toISOString(),stale:false}})
const root=document.querySelector('#root'), view=initDefense({root})
view.setContext({league:{league_id:'12345678',season:'2026',scoring_settings:{pass_yd:.05,pass_td:4,rec_yd:.1,rec:1}},directory:{'1':{position:'QB'},'2':{position:'WR'}},maximum:1,currentWeek:1})
view.show();await new Promise(resolve=>setTimeout(resolve,100))
assert.match(root.textContent,/DAL/);assert.match(root.textContent,/18.00 \/ game/)
root.querySelector('#def-metric').value='points_wr';root.querySelector('#def-metric').dispatchEvent(new dom.window.Event('change'));await new Promise(resolve=>setTimeout(resolve,50));assert.match(root.textContent,/14.00 \/ game/)
console.log('Defensive opponent aggregation passed')
