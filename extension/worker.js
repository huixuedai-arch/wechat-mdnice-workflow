importScripts('core.js');
const C=EditorialCore;
const read=async k=>(await chrome.storage.local.get(k))[k];
const write=(k,v)=>chrome.storage.local.set({[k]:v});
let queue=Promise.resolve();
const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
const now=()=>new Date().toISOString();
const origin=t=>{if(new URL(t.url).origin!=='https://mp.weixin.qq.com')throw Error('请在公众号图文编辑页运行');};
const terminal=new Set(['published-ready','draft-ready','blocked','preview-unknown','preview-sent','metadata-saved','checked','stopped']);
async function recordFor(tabId){const k=await read('tab:'+tabId);return k?await read(k):null;}
const redact=s=>String(s||'').replace(/https?:\/\/[^\s<>"']+/g,'[URL omitted]').replace(/(?:token|access_token|cookie)\s*[=:]\s*[^\s,;]+/gi,'[credential omitted]');
function publicRecord(r){if(!r)return {stage:'尚未运行'};return {runId:r.runId,articleId:r.article.articleId,title:r.article.title,stage:r.stage,blockedAt:r.blockedAt,draftId:r.draftId,author:r.profile.author,originalAuthor:r.profile.originalAuthor,recipient:r.profile.recipient,original:r.profile.original,error:r.error?redact(r.error):undefined,events:r.events.map(e=>({...e,note:redact(e.note)})),metadataVerified:r.metadataVerified,stop:r.stop,backupAvailable:!!r.backup,type:r.article.type||'news',imageCount:r.article.images.length,rebuildProgress:r.rebuildState?{uploaded:r.rebuildState.newUrls.length,removed:r.rebuildState.removed,original:r.rebuildState.oldUrls.length}:undefined,details:r.article.type==='newspic'?r.details:undefined};}
async function launch(tabId){const active=await recordFor(tabId);chrome.scripting.executeScript({target:{tabId},files:active?.mode==='published'?['newspic-adapter.js','published-editor.js','published-runner.js']:active?.article.type==='newspic'?['newspic-adapter.js','feedback.js','newspic-runner.js']:['preflight.js','editor-adapter.js','runner.js']}).catch(e=>serial(async()=>{const r=await recordFor(tabId);if(!r||terminal.has(r.stage))return;r.blockedAt=r.stage;r.stage='blocked';r.error='脚本未能启动，请重新点击插件授予当前页访问：'+e.message;await write(r.runId,r);}));}
const photoWrites=r=>!!(r?.mutationStarted||r?.uploadResume||r?.uploadedImages?.length||r?.events?.some(e=>e.stage==='uploading'));
const canResumePhoto=r=>!!(r&&r.stage==='blocked'&&['import','uploading','text'].includes(r.blockedAt)&&(!photoWrites(r)||r.uploadResume||r.uploadedImages?.length||r.events?.some(e=>e.stage==='uploading')));
const revisionReady=(r,p,a)=>!!(r&&a?.type==='newspic'&&r.article.type==='newspic'&&r.profile.accountKey===p.accountKey&&r.article.articleId===a.articleId&&r.article.hash!==a.hash&&r.stage==='blocked'&&['import','uploading','text'].includes(r.blockedAt)&&r.uploadedImages?.length===a.images.length&&r.article.images.length===a.images.length&&r.article.images.every((im,i)=>im.sha256===a.images[i].sha256));
// A failed full import can bind the tab to an empty new run while the
// previous version still owns the uploaded images in storage.
const emptyPhotoImport=r=>r?.stage==='blocked'&&r.blockedAt==='import'&&r.error==='贴图页已有内容，未覆盖'&&!photoWrites(r)&&!r.draftId&&!r.imageUrls?.length;
async function revisionCandidates(bound,old,p,a){
 if(old&&!emptyPhotoImport(old))return [];
 if(revisionReady(bound,p,a))return [bound];
 if(a.type!=='newspic'||!emptyPhotoImport(old))return [];
 const local=chrome.storage.local,prefix=C.runKey(p,a).slice(0,-a.hash.length);
 if(!local.getKeys)return Object.entries(await local.get(null)).filter(([k])=>k.startsWith(prefix)).map(([,r])=>r).filter(r=>revisionReady(r,p,a));
 const keys=(await local.getKeys()).filter(k=>k.startsWith(prefix)&&k!==old.runId);
 return keys.length?Object.values(await local.get(keys)).filter(r=>revisionReady(r,p,a)):[];
}
const photoIdentity=u=>{const x=new URL(u);return x.hostname+x.pathname.replace(/\/(0|640|1080)$/,'');};
async function photoSnapshot(id){
 await chrome.scripting.executeScript({target:{tabId:id},files:['newspic-adapter.js']});
 const got=await chrome.scripting.executeScript({target:{tabId:id},func:()=>{try{const a=NewspicEditor;a.assertEditor();return {title:a.value(a.title()),content:a.text(a.body()),imageUrls:a.images()};}catch(e){return {error:e.message};}}});
 const snap=got[0]?.result;if(!snap||snap.error)throw Error(snap?.error||'未能读取当前贴图');return snap;
}
async function photoPlan(id,p,a){
 const bound=await recordFor(id),canonical=await read(C.runKey(p,a));
 const old=bound?.article.hash===a.hash&&bound.profile.accountKey===p.accountKey?bound:canonical;
 if([old,bound].some(r=>r&&!terminal.has(r.stage)))throw Error('此稿件或标签仍有运行中的任务，请等待完成或停止');
 if(await read(await C.guardKey(p,a)))throw Error('此稿件已有发送记录，禁止自动重发');
 const snap=await photoSnapshot(id),draftId=new URL((await chrome.tabs.get(id)).url).searchParams.get('appmsgid');
 if(!draftId&&!snap.title.trim()&&!snap.content.trim()&&!snap.imageUrls.length)return {mode:'fresh'};
 if(old?.draftId&&draftId===old.draftId)return {mode:'resume'};
 if(canResumePhoto(old)&&photoWrites(old)&&snap.imageUrls.length&&(!snap.title||snap.title===old.article.title||snap.title===old.previousText?.title)&&(old.uploadedImages||[]).every((u,i)=>snap.imageUrls[i]&&photoIdentity(u)===photoIdentity(snap.imageUrls[i])))return {mode:'continue'};
 const candidates=await revisionCandidates(bound,old,p,a);
 const matches=candidates.filter(r=>(!r.draftId||r.draftId===draftId)&&snap.title===r.article.title&&snap.imageUrls.length===r.uploadedImages.length&&r.uploadedImages.every((u,i)=>photoIdentity(u)===photoIdentity(snap.imageUrls[i])));
 if(matches.length===1)return {mode:'revise'};
 throw Error('当前页有内容，但未匹配到可恢复的本篇稿件，请保留页面并采集诊断');
}
const legacyFirst=r=>!!(r&&!r.draftId&&!r.uploadedImages?.length&&r.events?.some(e=>e.stage==='blocked'&&e.note==='等待超时：第 1 张图片上传完成'));
async function publishedAction(m,id){
 origin(await chrome.tabs.get(id));const p=await read('profile'),a=await read('article');if(!p||a?.type!=='newspic')throw Error('请配置账号并导入贴图文章包');
 if(m.type==='published-plan'){
  const bound=await recordFor(id);if(bound&&!terminal.has(bound.stage))throw Error('当前页有正在运行的任务，请先停止');
  await chrome.scripting.executeScript({target:{tabId:id},files:['newspic-adapter.js','published-editor.js']});
  const result=await chrome.scripting.executeScript({target:{tabId:id},func:async (article,resume)=>{try{return await PublishedEditor.plan(article,resume);}catch(e){return {error:e.message};}},args:[{title:a.title,content:a.content,images:a.images.map(x=>({sha256:x.sha256}))},bound?.mode==='published'&&bound.article.hash===a.hash&&bound.stage==='blocked'?(bound.rebuildState??null):null]});
  const plan=result[0]?.result;if(!plan||plan.error)throw Error(plan?.error||'无法读取已发表修改页');
  const all=await chrome.storage.local.get(null);
  const originals=Object.values(all).filter(r=>r?.article?.type==='newspic'&&(r.mode!=='published'||r.stage==='published-ready')&&r.profile?.accountKey===p.accountKey&&r.draftId===plan.snapshot.id&&r.article.title===plan.snapshot.title&&r.article.content===plan.snapshot.content&&r.imageUrls?.length===plan.snapshot.images.length&&r.imageUrls.every((u,i)=>photoIdentity(u)===photoIdentity(plan.snapshot.images[i])));
  const signatures=new Map(originals.map(r=>[r.article.images.map(x=>x.sha256).join(','),r]));
  const original=signatures.size===1?[...signatures.values()][0]:null;
  plan.changes=a.images.map((im,i)=>i).filter(i=>!original||original.article.images[i]?.sha256!==a.images[i].sha256);plan.imageProof=!!original;if(plan.rebuild)plan.changes=a.images.map((_,i)=>i);
  await write('published-plan:'+id,{...plan,hash:a.hash,account:p.accountKey});return {...plan,newTitle:a.title,newContent:a.content};
 }
 const approved=await read('published-plan:'+id);if(!m.consent||!approved||approved.hash!==a.hash||approved.account!==p.accountKey||m.expectedHash!==a.hash)throw Error('请先核对本页的新旧内容');
 const bound=await recordFor(id);if(bound&&!terminal.has(bound.stage))throw Error('当前页已有任务运行');
 const runId='published:'+id+':'+a.hash+':'+Date.now();const r={runId,owner:id,mode:'published',stage:'published-edit',article:a,profile:p,draftId:approved.snapshot.id,stop:false,events:[],approved,backup:approved.rebuild&&bound?.backup?bound.backup:approved.snapshot,rebuildState:approved.rebuild||null,uploadedImages:approved.snapshot.images,imageUrls:approved.snapshot.images,started:now()};
 await write(runId,r);await write('tab:'+id,runId);launch(id);return publicRecord(r);
}
async function handle(m,sender){
 if(!sender.tab){
  if(m.type==='settings'){const p=C.profile(m.profile);await write('profile',p);return {profile:p};}
  if(m.type==='clear-package'){await chrome.storage.local.remove('article');return {ok:true};}
  if(m.type==='get-settings')return {profile:await read('profile')||null,article:await read('article')||null};
  if(m.type==='package'){const a=await C.article(m.article);await write('article',a);return {article:a};}
 }
 const id=sender.tab?.id??m.tabId;if(!Number.isInteger(id))throw Error('缺少标签页');
 if(['published-plan','published-start'].includes(m.type)){if(sender.tab)throw Error('请从插件核对后启动');return publishedAction(m,id);}
 if(sender.tab){if(new URL(sender.url).origin!=='https://mp.weixin.qq.com')throw Error('来源不符');}
 else if(['start','status','inspect','stop','received','photo-recovery','photo-plan'].includes(m.type))origin(await chrome.tabs.get(id));
 if(m.type==='status'){
  let r=await recordFor(id);const p=await read('profile'),a=await read('article');
  if(p&&a){
   const matching=await read(C.runKey(p,a)),sources=await revisionCandidates(r,matching,p,a);
   if(sources.length)return {stage:'revision-ready',title:a.title,hash:a.hash,imageCount:a.images.length};
   if(r?.article.hash===a.hash&&r.profile.accountKey===p.accountKey){}else if(matching)r=matching;else r=null;
  }
  return publicRecord(r);
 }
 if(m.type==='photo-plan'){
  if(sender.tab)throw Error('请从插件启动');
  const p=await read('profile'),a=await read('article');if(!p||a?.type!=='newspic')throw Error('请先加载贴图文章包');return photoPlan(id,p,a);
 }
 if(m.type==='photo-recovery'){
  if(sender.tab)throw Error('请从插件恢复');
  const p=await read('profile'),a=await read('article');if(!p||a?.type!=='newspic')return {needed:false};
  const old=await read(C.runKey(p,a));if(!legacyFirst(old)||!canResumePhoto(old))return {needed:false};
  if(old.owner!==id)throw Error('请在原先上传首图的贴图标签页继续');
  const snap=await photoSnapshot(id);
  if(snap.title.trim()||snap.content.trim())throw Error('当前贴图已有标题或正文，未覆盖；请采集完整诊断');
  if(snap.imageUrls.length!==1)throw Error('旧版首图恢复要求页面恰好有 1 张图片；当前 '+snap.imageUrls.length+' 张，未重新上传');
  return {needed:true,firstImageUrl:snap.imageUrls[0],title:a.title};
 }
 if(m.type==='start'){
  if(sender.tab)throw Error('请从插件按钮启动');
  if(!m.consent)throw Error('请确认当前公众号、稿件和操作授权');
  if(!['auto','full','resume','continue','revise','metadata','check'].includes(m.mode))throw Error('未知模式');
  const profile=C.profile(await read('profile')||{}),a=await read('article');if(!a)throw Error('先加载文章包');if(m.expectedHash&&m.expectedHash!==a.hash)throw Error('文章包版本发生变化，请重新打开插件核对后启动');
  if(m.mode==='auto'){if(a.type!=='newspic')throw Error('自动选择仅用于贴图');m={...m,...await photoPlan(id,profile,a)};}
  const bound=await recordFor(id);let k=C.runKey(profile,a),old=await read(k);
  if(m.mode==='resume'&&a.type==='newspic'&&bound?.article.hash===a.hash&&bound.profile.accountKey===profile.accountKey&&bound.draftId===new URL((await chrome.tabs.get(id)).url).searchParams.get('appmsgid')){k=bound.runId;old=bound;}
  const revision=m.mode==='revise';
  if(bound&&!terminal.has(bound.stage))throw Error('此标签仍有运行中的任务；先等待完成或停止');
  if(old&&!terminal.has(old.stage))throw Error('此文章正在其他标签运行；等待或停止原任务后再恢复');
  if(a.type==='newspic'&&(['metadata','check'].includes(m.mode)||(m.mode==='continue'&&!canResumePhoto(old))))throw Error('贴图已有写入或状态不明，不能重复上传');
  if(m.mode==='continue'&&(!old||old.stage!=='blocked'||!['import','cover',...(a.type==='newspic'?['uploading','text']:[])].includes(old.blockedAt)))throw Error('仅允许继续导入或封面阶段已停止的同一稿件；保存结果不明时请从草稿箱恢复');
  const tab=await chrome.tabs.get(id),draftId=new URL(tab.url).searchParams.get('appmsgid');
  const guard=await C.guardKey(profile,a),sent=await read(guard);
  if(['fresh','full','resume','continue','revise'].includes(m.mode)&&sent)throw Error('此稿件已有发送记录（'+sent.stage+'），禁止自动重发');
  if(m.mode==='full'&&(old||draftId))throw Error('完整导入只允许没有运行记录的新稿和空白编辑页；已有稿请恢复核对');
  if(['metadata','check','resume'].includes(m.mode)&&!draftId)throw Error('请先从草稿箱打开本篇已保存文章');
  let source;
  if(revision){
   const candidates=await revisionCandidates(bound,old,profile,a);
   if(candidates.length){
    const snap=await photoSnapshot(id);
    const matches=candidates.filter(r=>(!r.draftId||r.draftId===draftId)&&snap.title===r.article.title&&snap.imageUrls.length===r.uploadedImages.length&&r.uploadedImages.every((u,i)=>photoIdentity(u)===photoIdentity(snap.imageUrls[i])));
    if(matches.length===1)source=matches[0];
   }
   if(!source)throw Error('当前标题和图片顺序未能唯一匹配历史稿件，未替换');
   if(await read(await C.guardKey(source.profile,source.article)))throw Error('旧版已有预览发送记录，不能自动以修订流程重发');
  }
  const base=m.mode==='fresh'?null:revision?source:old;
  if(base?.draftId&&draftId!==base.draftId)throw Error('当前草稿 ID 与此文章记录不符');
  let approvedFirst;
  if(a.type==='newspic'&&m.mode==='continue'&&legacyFirst(old)){
   if(old.owner!==id||typeof m.approvedFirstImageUrl!=='string')throw Error('旧版首图需要在原标签核对确认后恢复，未重复上传');
   const snap=await photoSnapshot(id);
   if(snap.title.trim()||snap.content.trim()||snap.imageUrls.length!==1||snap.imageUrls[0]!==m.approvedFirstImageUrl)throw Error('首图确认后页面发生变化，已停止');
   approvedFirst=snap.imageUrls[0];
  }
  if(m.mode==='fresh'&&old){
   const archive=k+':history:'+Date.now();
   await write(archive,{...old,runId:archive,originalRunId:k});
   if(old.owner!==id&&await read('tab:'+old.owner)===k)await write('tab:'+old.owner,archive);
   old=undefined;
  }
  // An explicit resume of a user-selected saved draft is readback-verified against the package.
  const r={runId:k,owner:id,stage:['fresh','full','continue','revise'].includes(m.mode)?'import':m.mode==='metadata'?'metadata':m.mode==='check'?'check-only':'verify-saved',mode:m.mode,repair:m.mode==='continue'&&a.type!=='newspic',profile,article:a,hash:a.hash,draftId:draftId||undefined,metadataOnly:m.mode==='metadata',metadataRequired:true,stop:false,events:[...(old?.events||[]),{time:now(),stage:'start',note:'用户启动 '+m.mode}],started:now(),backup:revision?undefined:old?.backup,imageUrls:base?.imageUrls,cover:base?.cover,uploadedImages:approvedFirst?[approvedFirst]:base?.uploadedImages,pendingImage:approvedFirst?null:base?.pendingImage,mutationStarted:photoWrites(base),uploadResume:a.type==='newspic'&&['continue','revise'].includes(m.mode)&&photoWrites(base),previousText:revision?{title:source.article.title,content:source.article.content,backupContent:source.backup?.content}:old?.previousText,revisedFrom:revision?source.runId:old?.revisedFrom,firstImageConfirmation:approvedFirst?{at:now(),method:'user-confirmed'}:base?.firstImageConfirmation};
  if(revision)r.events.push({time:now(),stage:'revision',note:'用户加载同篇新版本，保留已上传图片，核对并替换标题正文'});
  if(approvedFirst)r.events.push({time:now(),stage:'recovery',note:'用户核对确认现有首图，保留首图并从第 2 张继续'});
  await write(k,r);await write('tab:'+id,k);launch(id);return publicRecord(r);
 }
 let r=await recordFor(id);
 if(m.type==='stop'&&!sender.tab){const p=await read('profile'),a=await read('article');if(p&&a&&!(r?.article.hash===a.hash&&r.profile.accountKey===p.accountKey))r=await read(C.runKey(p,a))||r;}
 if(m.type==='inspect'){
  if(sender.tab)throw Error('请从插件采集诊断');
  // Read-only diagnostics remain available while a task is running.
  const result=await chrome.scripting.executeScript({target:{tabId:id},func:()=>{
   const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
   const dialogs=[...document.querySelectorAll('[role="dialog"],.weui-desktop-dialog')].filter(visible);
   return {pageType:{type:new URL(location.href).searchParams.get('type'),createType:new URL(location.href).searchParams.get('createType'),coverExists:!!document.querySelector('#js_cover_area'),coverVisible:!!document.querySelector('#js_cover_area')&&visible(document.querySelector('#js_cover_area')),uploadContainerVisible:!!document.querySelector('.js_upload_btn_container')&&visible(document.querySelector('.js_upload_btn_container'))},capturedAt:new Date().toISOString(),draftId:new URL(location.href).searchParams.get('appmsgid'),imageCount:document.querySelectorAll('.rich_media_content .ProseMirror img:not(.ProseMirror-separator)').length,
    fileInputs:[...document.querySelectorAll('input[type=file]')].map(e=>({accept:e.accept,multiple:e.multiple,selectedFiles:[...(e.files||[])].map(f=>({name:f.name,size:f.size})),ancestors:[e.parentElement,e.parentElement?.parentElement,e.parentElement?.parentElement?.parentElement].filter(Boolean).map(x=>String(x.className).slice(0,180)),id:e.id,parentClass:String(e.parentElement?.className||'').slice(0,160)})),
    editorFields:[...document.querySelectorAll('input,textarea,[contenteditable=true]')].filter(visible).map(e=>({tag:e.tagName,id:e.id,placeholder:e.getAttribute('placeholder')||e.getAttribute('data-placeholder'),maxLength:e.maxLength,className:String(e.className).slice(0,160)})),
    imageElements:[...document.querySelectorAll('img')].filter(visible).slice(0,50).map(e=>({className:String(e.className).slice(0,100),parentClass:String(e.parentElement?.className||'').slice(0,100),hosted:/^https?:\/\/[^/]*qpic\.cn\//.test(e.getAttribute('data-src')||e.src)})),
    imageContainers:[...document.querySelectorAll('.weui-desktop-upload__thumb,.pic_item,[class*=upload_thumb],[class*=upload__thumb],[class*=image-selector]')].filter(visible).map(e=>({tag:e.tagName,className:String(e.className).slice(0,160),hasImage:!!e.querySelector('img'),hasBackground:getComputedStyle(e).backgroundImage!=='none'})),
    authors:[...document.querySelectorAll('input,textarea,[contenteditable="true"]')].filter(e=>visible(e)&&/请输入作者/.test((e.getAttribute('placeholder')||'')+(e.getAttribute('data-placeholder')||''))).map(e=>({value:'value'in e?e.value:e.textContent,inDialog:!!e.closest('[role="dialog"],.weui-desktop-dialog')})),
    dialogs:dialogs.map(d=>({title:d.querySelector('h3')?.textContent||'',controls:[...d.querySelectorAll('input')].map(e=>({type:e.type,label:e.dataset.label||e.placeholder||'',checked:e.type==='radio'||e.type==='checkbox'?e.checked:undefined,value:e.placeholder==='请输入作者'?e.value:undefined}))}))};
  }});
  let componentInspection;
  if(r?.article.type==='newspic'){
   await chrome.scripting.executeScript({target:{tabId:id},files:['diagnostic.js','feedback.js']});
   const deep=await chrome.scripting.executeScript({target:{tabId:id},func:async()=>({...await globalThis.WechatDiagnostic({expandAddMenu:false}),platformMessages:WechatFeedback.snapshot()})});
   componentInspection=deep[0]?.result;
  }
  const loaded=await read('article');
  return {version:chrome.runtime.getManifest().version,loadedPackage:loaded?{articleId:loaded.articleId,hash:loaded.hash,title:loaded.title,contentChars:loaded.content?.length,imageCount:loaded.images.length}:null,status:publicRecord(r),inspection:result[0]?.result,componentInspection,uploadProgress:r?.article.type==='newspic'?{recordedImages:r.uploadedImages?.length||0,pendingImage:r.pendingImage??null,uploadResume:!!r.uploadResume,mutationStarted:!!r.mutationStarted,expectedImages:r.article.images.map((im,i)=>({index:i,name:im.name,sha256:im.sha256})),expectedContentChars:r.article.content.length}:undefined};
 }
 if(!r)throw Error('当前标签没有运行记录；选择文章包后用恢复或只读核对入口');
 if(m.type==='stop'){r.stop=true;if(!terminal.has(r.stage)){r.blockedAt=r.stage;r.stage=r.stage==='preview-pending'?'preview-unknown':'stopped';}await write(r.runId,r);return publicRecord(r);}
 if(r.owner!==id)throw Error('任务已转移到另一标签');
 if(m.type==='received'){
  if(sender.tab||!m.confirmed)throw Error('请在插件中确认实际收到');const g=await C.guardKey(r.profile,r.article),sent=await read(g);if(!sent)throw Error('没有发送记录');sent.stage='recipient-confirmed';sent.confirmedAt=now();await write(g,sent);r.stage='preview-sent';r.events.push({time:now(),stage:'recipient-confirmed',note:'用户确认已收到'});await write(r.runId,r);return publicRecord(r);
 }
 if(!sender.tab)throw Error('该操作仅供运行页');
 if(m.type==='load')return r;
 if(m.type==='run-state')return {stage:r.stage,stop:r.stop};
 if(m.type==='update'){
  const patch=m.patch||{};
  const allowed=['stage','error','details','blockedAt','metadataSnapshot','metadataBefore','metadataVerified','metadataRequired','backup','imageUrls','cover','draftId','mutationStarted','preflight','layoutWarning','uploadedImages','pendingImage','rebuildState'];
  if(Object.keys(patch).some(k=>!allowed.includes(k)))throw Error('不允许修改任务身份或配置');
  if(r.stop&&patch.stage!=='blocked'&&patch.stage!=='preview-unknown')throw Error('任务已停止');
  if(patch.stage==='draft-ready'&&(r.stage!=='verified'||!r.draftId||!r.imageUrls?.length))throw Error('尚未核对已保存草稿，不能标记完成');
  if(patch.stage==='preview-pending'){
   if(r.mode==='published'||r.mode==='metadata'||r.mode==='check'||r.stage!=='verified')throw Error('当前模式不可发送');
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
