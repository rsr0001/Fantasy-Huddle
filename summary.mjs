import {buildReport} from './scoring.mjs'
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
const fmt=n=>Number(n).toFixed(2)
export function summarize(reports) {
 const teams=new Map(),bench=[];let high=null,biggest=null,closest=null,heartbreaker=null,escapeArtist=null
 for(const {week,report} of reports){
  for(const team of report.teams){const item=teams.get(team.id)||{id:team.id,name:team.name,points:0,wins:0,losses:0,ties:0,weeks:0,against:0};item.name=team.name;item.points+=team.points;item.weeks++;teams.set(team.id,item);if(!high||team.points>high.score)high={name:team.name,score:team.points,week};for(const player of team.players)if(!report.bestBall&&!player.starter&&typeof player.points==='number')bench.push({...player,week})}
  const matchups=new Map();for(const team of report.teams){if(!team.matchup)continue;if(!matchups.has(team.matchup))matchups.set(team.matchup,[]);matchups.get(team.matchup).push(team)}
  for(const pair of matchups.values()){if(pair.length!==2)continue;const [a,b]=pair,aa=teams.get(a.id),bb=teams.get(b.id);aa.against+=b.points;bb.against+=a.points;if(a.points===b.points){aa.ties++;bb.ties++;continue}const winner=a.points>b.points?a:b,loser=winner===a?b:a;teams.get(winner.id).wins++;teams.get(loser.id).losses++;const result={winner:winner.name,loser:loser.name,win:winner.points,loss:loser.points,margin:winner.points-loser.points,week};if(!biggest||result.margin>biggest.margin)biggest=result;if(!closest||result.margin<closest.margin)closest=result;if(!heartbreaker||result.loss>heartbreaker.loss)heartbreaker=result;if(!escapeArtist||result.win<escapeArtist.win)escapeArtist=result}
 }
 return {teams:[...teams.values()].sort((a,b)=>b.wins-a.wins||b.points-a.points||a.name.localeCompare(b.name)),high,biggest,closest,heartbreaker,escapeArtist,bench:bench.sort((a,b)=>b.points-a.points)[0]}
}
export function initSummary({awards,standings}) {
 let context=null,version=0,promise=null
 async function calculate(){
  if(!promise)promise=Promise.all(Array.from({length:context.maximum},async(_,index)=>{const week=index+1;const r=await fetch(`https://api.sleeper.app/v1/league/${context.league.league_id}/matchups/${week}`,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`Week ${week} is unavailable.`);const matchups=await r.json();if(!Array.isArray(matchups))throw Error(`Week ${week} data is unavailable.`);return {week,report:buildReport({...context,matchups})}})).then(summarize).catch(e=>{promise=null;throw e})
  return promise
 }
 function setup(target,type){
  const weekly=target.querySelector('section')
  const controls=document.createElement('div');controls.className='stats-mode';controls.innerHTML='<button type="button" data-period="week" aria-pressed="true">This week</button><button type="button" data-period="season" aria-pressed="false">Season</button>'
  const season=document.createElement('div');season.hidden=true;target.prepend(controls);target.append(season)
  controls.addEventListener('click',async event=>{const button=event.target.closest('button[data-period]');if(!button)return;const isSeason=button.dataset.period==='season';controls.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(weekly)weekly.hidden=isSeason;season.hidden=!isSeason;if(!isSeason)return;const current=version;season.textContent='Loading completed weeks...';try{const data=await calculate();if(current!==version)return;if(type==='standings'){
    season.innerHTML='<p class="data-note">Records are calculated from completed matchups, sorted by wins then points. This may differ from official league standings; names use current ownership.</p>'+data.teams.map((t,i)=>`<article class="performance-row defense-row"><span class="rank">${i+1}</span><div class="performance-body"><div><h3>${escape(t.name)}</h3><strong>${fmt(t.points)} pts</strong></div><p>${t.wins}-${t.losses}-${t.ties} · ${t.weeks} weeks · ${fmt(t.against)} points against</p></div></article>`).join('')
   }else{
    const cards=[];const card=(title,name,value,description)=>cards.push(`<article class="award"><p>${escape(title)}</p><div><strong>${escape(name)}</strong><b>${escape(value)}</b></div><small>${escape(description)}</small></article>`)
    if(data.high)card('Highest weekly score',data.high.name,fmt(data.high.score),`Week ${data.high.week}`)
    if(data.biggest)card('Biggest blowout',data.biggest.winner,`+${fmt(data.biggest.margin)}`,`Week ${data.biggest.week} vs ${data.biggest.loser}`)
    if(data.closest)card('Narrowest escape',data.closest.winner,`+${fmt(data.closest.margin)}`,`Week ${data.closest.week} vs ${data.closest.loser}`)
    if(data.heartbreaker)card('Heartbreaker',data.heartbreaker.loser,fmt(data.heartbreaker.loss),`Highest losing score · Week ${data.heartbreaker.week}`)
    if(data.escapeArtist)card('Escape artist',data.escapeArtist.winner,fmt(data.escapeArtist.win),`Lowest winning score · Week ${data.escapeArtist.week}`)
    if(data.bench)card('Bench boss',data.bench.name,fmt(data.bench.points),`${data.bench.team} · Week ${data.bench.week}`)
    const schedule=[...data.teams].sort((a,b)=>b.against-a.against)[0];if(schedule)card('Schedule from hell',schedule.name,fmt(schedule.against),'Most points scored against')
    season.innerHTML='<p class="data-note">Based on completed weekly matchups. Ties share no victory award.</p><div class="award-grid">'+cards.join('')+'</div>'
   }}catch(error){if(current===version)season.textContent=error.message}})
 }
 return {setContext(c){context=c;version++;promise=null;setup(awards,'awards');setup(standings,'standings')},clear(){context=null;version++;promise=null}}
}
