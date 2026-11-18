import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, hash } from './app.js';
test('saved leagues are isolated between signed-in users', async t => {
 const records=new Map([['alice',new Map()],['bob',new Map()]]);
 const users=new Map([[hash('a'.repeat(43)),'alice'],[hash('b'.repeat(43)),'bob']]);
 const pool={query:async(sql,args=[])=>{
  if(sql.includes('FROM sessions s JOIN users')){const id=users.get(args[0]);return {rows:id?[{id,name:id}]:[]}}
  if(sql.startsWith('SELECT league_id,name'))return {rows:[...records.get(args[0])].map(([league_id,name])=>({league_id,name}))};
  if(sql.startsWith('DELETE FROM leagues')){records.get(args[0]).delete(args[1]);return {rowCount:1}}
  throw Error(sql)
 },connect:async()=>({query:async(sql,args=[])=>{
  if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)||sql.startsWith('SELECT id FROM users'))return {rows:[]};
  if(sql.startsWith('SELECT count'))return {rows:[{n:records.get(args[0]).size}]};
  if(sql.startsWith('SELECT 1 FROM leagues'))return {rowCount:records.get(args[0]).has(args[1])?1:0};
  if(sql.startsWith('INSERT INTO leagues')){records.get(args[0]).set(args[1],args[2]);return {rows:[]}}
  throw Error(sql)
 },release(){}})};
 const server=createApp({pool,clientId:'test',origin:'https://rsr0001.github.io',verifyGoogle:async()=>({})}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;
 async function req(path,token,method='GET',body){return fetch(base+path,{method,headers:{origin:'https://rsr0001.github.io','content-type':'application/json',...(token?{authorization:`Bearer ${token.repeat(43)}`}:{})},...(body?{body:JSON.stringify(body)}:{})})}
 assert.equal((await req('/leagues')).status,401);
 assert.equal((await req('/leagues/12345678','a','PUT',{name:'League A'})).status,200);
 assert.deepEqual((await (await req('/leagues','b')).json()).leagues,[]);
 assert.equal((await req('/leagues/invalid','a','PUT',{name:'bad'})).status,400);
 assert.equal((await req('/leagues/12345678','b','DELETE')).status,204);
 assert.equal((await (await req('/leagues','a')).json()).leagues.length,1);
});
