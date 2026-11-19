import test from 'node:test'
import assert from 'node:assert/strict'
import { createStatsHandler } from './stats-data.js'
test('stores snapshots and serves stale data on upstream failure',async()=>{
 let row=null,calls=0,fail=false
 const pool={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:row?[row]:[]};row={payload:JSON.parse(args[2]),updated_at:new Date().toISOString()};return {rows:[{updated_at:row.updated_at}]}}}
 const raw=Object.fromEntries(Array.from({length:101},(_,i)=>[String(i+1),{gp:1}]))
 const details=Object.keys(raw).map(player_id=>({player_id,stats:{gp:1},player:{position:'QB'},opponent:'ABC',game_id:'game'}))
 const fetcher=async url=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>url.includes('/v1/')?raw:details}}
 const handler=createStatsHandler({pool,fetcher})
 async function request(season='2026',week='10'){let result;const res={status(n){this.code=n;return this},json(body){result={status:this.code||200,body};return this}};await handler({params:{season,week}},res,e=>{throw e});return result}
 assert.equal((await request()).body.stale,false);assert.equal(calls,2)
 assert.equal((await request()).body.stale,false);assert.equal(calls,2)
 row.updated_at='2000-01-01T00:00:00Z';fail=true
 assert.equal((await request()).body.stale,true)
 assert.equal((await request('2026','99')).status,400)
})
