importScripts('core.js');
const C=EditorialCore;
const read=async k=>(await chrome.storage.local.get(k))[k];
const write=(k,v)=>chrome.storage.local.set({[k]:v});
let queue=Promise.resolve();
const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
const now=()=>new Date().toISOString();
const origin=t=>{if(new URL(t.url).origin!=='https://mp.weixin.qq.com')throw Error('请在公众号图文编辑页运行');};
const terminal=new Set(['blocked','preview-unknown','preview-sent','metadata-saved','checked','stopped']);
async function recordFor(tabId){const k=await read('tab:'+tabId);return k?await read(k):null;}
const redact=s=>String(s||'').replace(/https?:\/\/[^\s<>"']+/g,'[URL omitted]').replace(/(?:token|access_token|cookie)\s*[=:]\s*[^\s,;]+/gi,'[credential omitted]');
function publicRecord(r){if(!r)return {stage:'尚未运行'};return {runId:r.runId,articleId:r.article.articleId,title:r.article.title,stage:r.stage,blockedAt:r.blockedAt,draftId:r.draftId,author:r.profile.author,originalAuthor:r.profile.originalAuthor,recipient:r.profile.recipient,original:r.profile.original,error:r.error?redact(r.error):undefined,events:r.events.map(e=>({...e,note:redact(e.note)})),metadataVerified:r.metadataVerified,stop:r.stop,backupAvailable:!!r.backup};}
function launch(tabId){chrome.scripting.executeScript({target:{tabId},files:['preflight.js','editor-adapter.js','runner.js']}).catch(e=>serial(async()=>{const r=await recordFor(tabId);if(!r||terminal.has(r.stage))return;r.blockedAt=r.stage;r.stage='blocked';r.error='脚本未能启动，请重新点击插件授予当前页访问：'+e.message;await write(r.runId,r);}));}
async function handle(m,sender){
 if(!sender.tab){
  if(m.type==='settings'){const p=C.profile(m.profile);await write('profile',p);return {profile:p};}
  if(m.type==='get-settings')return {profile:await read('profile')||null,article:await read('article')||null};
  if(m.type==='package'){const a=await C.article(m.article);await write('article',a);return {article:a};}
 }
 const id=sender.tab?.id??m.tabId;if(!Number.isInteger(id))throw Error('缺少标签页');
 if(sender.tab){if(new URL(sender.url).origin!=='https://mp.weixin.qq.com')throw Error('来源不符');}
 else if(['start','status','inspect','stop','received'].includes(m.type))origin(await chrome.tabs.get(id));
 if(m.type==='status'){
  let r=await recordFor(id);const p=await read('profile'),a=await read('article');
  if(p&&a){const matching=await read(C.runKey(p,a));if(matching)r=matching;else if(r?.article.hash!==a.hash)r=null;}
  return publicRecord(r);
 }
 if(m.type==='start'){
  if(sender.tab)throw Error('请从插件按钮启动');
  if(!m.consent)throw Error('请确认当前公众号、稿件和操作授权');
  if(!['full','resume','continue','metadata','check'].includes(m.mode))throw Error('未知模式');
  const profile=C.profile(await read('profile')||{}),a=await read('article');if(!a)throw Error('先加载文章包');
  const k=C.runKey(profile,a),old=await read(k),bound=await recordFor(id);
  if(bound&&!terminal.has(bound.stage))throw Error('此标签仍有运行中的任务；先等待完成或停止');
  if(old&&!terminal.has(old.stage))throw Error('此文章正在其他标签运行；等待或停止原任务后再恢复');
  if(m.mode==='continue'&&(!old||old.stage!=='blocked'||!['import','cover'].includes(old.blockedAt)))throw Error('仅允许继续导入或封面阶段已停止的同一稿件；保存结果不明时请从草稿箱恢复');
  const tab=await chrome.tabs.get(id),draftId=new URL(tab.url).searchParams.get('appmsgid');
  const guard=await C.guardKey(profile,a),sent=await read(guard);
  if(['full','resume','continue'].includes(m.mode)&&sent)throw Error('此稿件已有发送记录（'+sent.stage+'），禁止自动重发');
  if(m.mode==='full'&&(old||draftId))throw Error('完整导入只允许没有运行记录的新稿和空白编辑页；已有稿请恢复核对');
  if(['metadata','check','resume'].includes(m.mode)&&!draftId)throw Error('请先从草稿箱打开本篇已保存文章');
  if(old?.draftId&&draftId!==old.draftId)throw Error('当前草稿 ID 与此文章记录不符');
  // An explicit resume of a user-selected saved draft is readback-verified against the package.
  const r={runId:k,owner:id,stage:['full','continue'].includes(m.mode)?'import':m.mode==='metadata'?'metadata':m.mode==='check'?'check-only':'verify-saved',mode:m.mode,repair:m.mode==='continue',profile,article:a,hash:a.hash,draftId:draftId||undefined,metadataOnly:m.mode==='metadata',metadataRequired:true,stop:false,events:[...(old?.events||[]),{time:now(),stage:'start',note:'用户启动 '+m.mode}],started:now(),backup:old?.backup,imageUrls:old?.imageUrls,cover:old?.cover};
  await write(k,r);await write('tab:'+id,k);launch(id);return publicRecord(r);
 }
 let r=await recordFor(id);
 if(m.type==='stop'&&!sender.tab){const p=await read('profile'),a=await read('article');if(p&&a)r=await read(C.runKey(p,a))||r;}
 if(m.type==='inspect'){
  const result=await chrome.scripting.executeScript({target:{tabId:id},func:()=>{
   const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
   const dialogs=[...document.querySelectorAll('[role="dialog"],.weui-desktop-dialog')].filter(visible);
   return {capturedAt:new Date().toISOString(),draftId:new URL(location.href).searchParams.get('appmsgid'),imageCount:document.querySelectorAll('.rich_media_content .ProseMirror img:not(.ProseMirror-separator)').length,
    authors:[...document.querySelectorAll('input,textarea,[contenteditable="true"]')].filter(e=>visible(e)&&/请输入作者/.test((e.getAttribute('placeholder')||'')+(e.getAttribute('data-placeholder')||''))).map(e=>({value:'value'in e?e.value:e.textContent,inDialog:!!e.closest('[role="dialog"],.weui-desktop-dialog')})),
    dialogs:dialogs.map(d=>({title:d.querySelector('h3')?.textContent||'',controls:[...d.querySelectorAll('input')].map(e=>({type:e.type,label:e.dataset.label||e.placeholder||'',checked:e.type==='radio'||e.type==='checkbox'?e.checked:undefined,value:e.placeholder==='请输入作者'?e.value:undefined}))}))};
  }});return {version:chrome.runtime.getManifest().version,status:publicRecord(r),inspection:result[0]?.result};
 }
 if(!r)throw Error('当前标签没有运行记录；选择文章包后用恢复或只读核对入口');
 if(m.type==='stop'){r.stop=true;if(!terminal.has(r.stage)){r.blockedAt=r.stage;r.stage=r.stage==='preview-pending'?'preview-unknown':'stopped';}await write(r.runId,r);return publicRecord(r);}
 if(r.owner!==id)throw Error('任务已转移到另一标签');
 if(m.type==='received'){
  if(sender.tab||!m.confirmed)throw Error('请在插件中确认实际收到');const g=await C.guardKey(r.profile,r.article),sent=await read(g);if(!sent)throw Error('没有发送记录');sent.stage='recipient-confirmed';sent.confirmedAt=now();await write(g,sent);r.stage='preview-sent';r.events.push({time:now(),stage:'recipient-confirmed',note:'用户确认已收到'});await write(r.runId,r);return publicRecord(r);
 }
 if(!sender.tab)throw Error('该操作仅供运行页');
 if(m.type==='load')return r;
 if(m.type==='update'){
  const patch=m.patch||{};
  const allowed=['stage','error','details','blockedAt','metadataSnapshot','metadataBefore','metadataVerified','metadataRequired','backup','imageUrls','cover','draftId','mutationStarted','preflight','layoutWarning'];
  if(Object.keys(patch).some(k=>!allowed.includes(k)))throw Error('不允许修改任务身份或配置');
  if(r.stop&&patch.stage!=='blocked'&&patch.stage!=='preview-unknown')throw Error('任务已停止');
  if(patch.stage==='preview-pending'){
   if(r.mode==='metadata'||r.mode==='check'||r.stage!=='verified')throw Error('当前模式不可发送');
   const g=await C.guardKey(r.profile,r.article);if(await read(g))throw Error('已有发送记录，禁止重复');
   await write(g,{stage:'preview-pending',recipient:r.profile.recipient,draftId:r.draftId,createdAt:now()});
  }
  if(['preview-sent','preview-unknown'].includes(patch.stage)){
   const g=await C.guardKey(r.profile,r.article),sent=await read(g);if(sent){sent.stage=patch.stage;await write(g,sent);}
  }
  Object.assign(r,patch);r.events.push({time:now(),stage:r.stage,note:String(m.note||'')});r.events=r.events.slice(-100);await write(r.runId,r);return {ok:true};
 }
 if(m.type==='reload'){if(r.stage!=='await-reload'||r.stop)throw Error('无刷新授权');await chrome.tabs.reload(id);return {ok:true};}
 throw Error('未知操作');
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{serial(()=>handle(m,s)).then(reply,e=>reply({error:e.message}));return true;});
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='complete')serial(async()=>{const r=await recordFor(id);if(r?.owner===id&&r.stage==='await-reload'&&!r.stop)launch(id);});});
