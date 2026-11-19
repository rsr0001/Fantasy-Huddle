import test from 'node:test'
import assert from 'node:assert/strict'
import {summarize} from '../summary.mjs'
test('season summary uses completed matchups, ties, and bench scores',()=>{
 const team=(id,name,points,matchup,players=[])=>({id,name,points,matchup,players})
 const reports=[{week:1,report:{bestBall:false,teams:[team(1,'A',100,1,[{name:'Bench',team:'A',starter:false,points:20}]),team(2,'B',90,1)]}},{week:2,report:{bestBall:false,teams:[team(1,'A',80,1),team(2,'B',80,1)]}}]
 const s=summarize(reports);assert.deepEqual([s.teams[0].wins,s.teams[0].ties,s.teams[0].points],[1,1,180]);assert.equal(s.heartbreaker.loser,'B');assert.equal(s.bench.name,'Bench');assert.equal(s.high.week,1)
})
