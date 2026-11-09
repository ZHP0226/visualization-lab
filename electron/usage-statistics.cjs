const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const EVENTS=new Set(['workbench_first_open','workbench_daily_active']);
const DAY=86400000;
const dayKey=time=>new Date(time+8*3600000).toISOString().slice(0,10);
const defaults=()=>({schema:1,consent:null,installId:null,firstOpenSent:false,lastActiveDay:null,pending:[]});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
class UsageStatistics {
  constructor({file,config,version,platform=process.platform,transport,request=fetch,now=Date.now,isTest=false,retryMs=60000,timeoutMs=7000}){
    Object.assign(this,{file,config,version,platform,now,isTest,retryMs,timeoutMs});
    this.valid=!!config&&['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(config.host)&&/^phc_[A-Za-z0-9_-]{20,}$/.test(config.token||'');
    this.transport=transport||((body,{signal})=>request(config.host+'/i/v0/e/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'}).then(async r=>{if(!r.ok)throw new Error('HTTP '+r.status);const text=await r.text();let parsed;try{parsed=JSON.parse(text);}catch{}if(!(parsed===1||parsed?.status===1||parsed?.status==='Ok'||parsed?.success===true))throw new Error('Event not acknowledged');}));
    this.state=defaults();this.queue=Promise.resolve();this.generation=0;this.flushing=null;this.controller=null;this.timer=null;this.failures=0;this.disposed=false;this.lastResult='idle';this.ready=this.load();
  }
  async load(){
    try{
      const s=JSON.parse(await fs.readFile(this.file,'utf8'));
      if(s.schema!==1||![null,true,false].includes(s.consent)||s.installId!==null&&!uuid(s.installId)||!Array.isArray(s.pending))throw new Error('invalid schema');
      const allowed=new Set(['app_version','platform','active_day','is_test','$process_person_profile','$geoip_disable','$ip']);
      const pending=s.pending.filter(e=>EVENTS.has(e.event)&&uuid(e.uuid)&&e.distinct_id===s.installId&&typeof e.timestamp==='string'&&e.properties&&Object.keys(e.properties).every(k=>allowed.has(k))&&e.properties.$process_person_profile===false&&e.properties.$geoip_disable===true&&e.properties.$ip===null&&typeof e.properties.active_day==='string').slice(-8);
      this.state={schema:1,consent:s.consent,installId:s.installId,firstOpenSent:s.firstOpenSent===true,lastActiveDay:/^\d{4}-\d\d-\d\d$/.test(s.lastActiveDay||'')?s.lastActiveDay:null,pending:s.consent===true?pending:[]};
    }catch(error){if(error.code!=='ENOENT'){try{await fs.copyFile(this.file,this.file+'.unreadable-'+this.now());}catch{}}}
  }
  serial(operation){const result=this.queue.then(async()=>{await this.ready;return operation();});this.queue=result.catch(()=>{});return result;}
  async save(){await fs.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(this.state,null,2),'utf8');await fs.rename(temp,this.file);}
  status(){return this.serial(()=>({available:this.valid,consent:this.state.consent,lastResult:this.lastResult,provider:'PostHog Cloud',region:'US',projectId:this.config?.projectId||null}));}
  async setConsent(value){
    if(typeof value!=='boolean')throw new Error('请选择是否参与使用统计');
    if(value&&!this.valid)throw new Error('统计配置暂不可用');
    // Cancel synchronously, before queued disk work can let a retry start.
    if(!value){this.generation++;this.controller?.abort();clearTimeout(this.timer);this.timer=null;}
    await this.serial(async()=>{const before=structuredClone(this.state);this.state.consent=value;if(!value)this.state.pending=[];try{await this.save();}catch(error){this.state=before;throw error;}});
    if(value){this.failures=0;await this.activity().catch(()=>{this.lastResult='offline';});}
    return this.status();
  }
  async activity(){
    await this.serial(async()=>{
      if(this.disposed||!this.valid||this.state.consent!==true)return;
      const before=structuredClone(this.state),time=this.now(),today=dayKey(time);this.state.installId ||= randomUUID();
      const make=event=>({uuid:randomUUID(),event,distinct_id:this.state.installId,timestamp:new Date(time).toISOString(),properties:{app_version:this.version,platform:this.platform,active_day:today,is_test:this.isTest,$process_person_profile:false,$geoip_disable:true,$ip:null}});
      let changed=false;
      if(!this.state.firstOpenSent&&!this.state.pending.some(e=>e.event==='workbench_first_open')){this.state.pending.push(make('workbench_first_open'));changed=true;}
      if(this.state.lastActiveDay!==today&&!this.state.pending.some(e=>e.event==='workbench_daily_active'&&e.properties.active_day===today)){this.state.pending.push(make('workbench_daily_active'));changed=true;}
      // Bounded offline storage: first-open plus the seven most recent daily events.
      if(this.state.pending.length>8){this.state.pending=[...this.state.pending.filter(e=>e.event==='workbench_first_open'),...this.state.pending.filter(e=>e.event==='workbench_daily_active').slice(-7)];changed=true;}
      if(changed)try{await this.save();}catch(error){this.state=before;throw error;}
    });
    this.flush();
  }
  flush(){
    if(this.disposed||this.flushing||this.failures>=3)return this.flushing;
    const generation=this.generation;
    this.flushing=(async()=>{
      while(!this.disposed&&generation===this.generation){
        const event=await this.serial(()=>this.state.consent===true?this.state.pending[0]:null);
        if(!event)break;
        const controller=new AbortController();this.controller=controller;const timeout=setTimeout(()=>controller.abort(),this.timeoutMs);timeout.unref?.();
        try{
          await this.transport({api_key:this.config.token,...event},{signal:controller.signal});
          if(this.disposed||generation!==this.generation)break;
          await this.serial(async()=>{
            if(this.state.consent!==true||generation!==this.generation)return;
            const before=structuredClone(this.state);this.state.pending=this.state.pending.filter(e=>e.uuid!==event.uuid);
            if(event.event==='workbench_first_open')this.state.firstOpenSent=true;
            if(event.event==='workbench_daily_active'&&(!this.state.lastActiveDay||this.state.lastActiveDay<event.properties.active_day))this.state.lastActiveDay=event.properties.active_day;
            try{await this.save();}catch(error){this.state=before;throw error;}
          });this.failures=0;this.lastResult='accepted';
        }catch(error){
          if(generation!==this.generation||this.disposed)break;
          this.failures++;this.lastResult='offline';
          if(this.failures<3){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;this.flush();},this.retryMs);this.timer.unref?.();}
          break;
        }finally{clearTimeout(timeout);if(this.controller===controller)this.controller=null;}
      }
    })().catch(()=>{this.lastResult='offline';}).finally(()=>{this.flushing=null;if(!this.disposed&&generation!==this.generation&&this.state.consent===true)this.flush();});
    return this.flushing;
  }
  async idle(){await this.queue;await this.flushing;await this.queue;}
  dispose(){this.disposed=true;this.generation++;clearTimeout(this.timer);this.controller?.abort();}
}
module.exports={UsageStatistics,dayKey};
