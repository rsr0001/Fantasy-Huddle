const URL_BASE='https://api.sleeper.app'
const pending=new Map()
let running=0
const queue=[]
async function limited(fn){if(running>=3)await new Promise(resolve=>queue.push(resolve));running++;try{return await fn()}finally{running--;queue.shift()?.()}}
export function createStatsHandler({pool,fetcher=fetch}) {
 return async (req,res,next)=>{
  try {
   const season=Number(req.params.season),week=Number(req.params.week),now=new Date().getUTCFullYear()
   if(!Number.isInteger(season)||season<2017||season>now+1||!Number.isInteger(week)||week<1||week>18)return res.status(400).json({error:'Invalid season or week.'})
   const key=`${season}:${week}`
   const cached=(await pool.query('SELECT payload,updated_at FROM nfl_weekly_stats WHERE season=$1 AND week=$2',[season,week])).rows[0]
   const fresh=cached && Date.now()-new Date(cached.updated_at).getTime()<12*60*60*1000
   if(fresh)return res.json({ ...cached.payload,updated_at:cached.updated_at,stale:false })
   if(!pending.has(key)){
    const task=limited(async()=>{
     async function get(url){const r=await fetcher(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Sleeper stats unavailable');return r.json()}
     const [raw,rows]=await Promise.all([get(`${URL_BASE}/v1/stats/nfl/regular/${season}/${week}`),get(`${URL_BASE}/stats/nfl/${season}/${week}?season_type=regular`)])
     if(!raw||Array.isArray(raw)||Object.keys(raw).length<100||!Array.isArray(rows)||rows.length<100)throw Error('Sleeper stats incomplete')
     const details=rows.filter(r=>r&&r.player_id&&r.stats&&typeof r.stats==='object').map(r=>({player_id:String(r.player_id),team:r.team,opponent:r.opponent,game_id:r.game_id,position:r.player?.position,stats:r.stats}))
     if(details.length<100)throw Error('Sleeper opponent data incomplete')
     const payload={raw,details}
     const result=await pool.query('INSERT INTO nfl_weekly_stats(season,week,payload,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(season,week) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at RETURNING updated_at',[season,week,JSON.stringify(payload)])
     return {...payload,updated_at:result.rows[0].updated_at,stale:false}
    })
    pending.set(key,task);task.finally(()=>pending.delete(key)).catch(()=>{})
   }
   try{return res.json(await pending.get(key))}catch(error){if(cached)return res.json({...cached.payload,updated_at:cached.updated_at,stale:true});throw error}
  }catch(error){next(error)}
 }
}
