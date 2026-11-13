/* Published edits are staged only. Never save, publish, preview, or submit. */
(()=>{
 const A=NewspicEditor,vis=A.visible;
 const norm=s=>String(s||'').replace(/\s+/g,'').trim();
 const editable=e=>!e.disabled&&!e.readOnly&&(e.isContentEditable||['INPUT','TEXTAREA'].includes(e.tagName));
 function snapshot(){A.assertEditor();const id=new URL(location.href).searchParams.get('appmsgid');if(!id)throw Error('请打开已发表贴图的修改页');
  return {id,title:A.value(A.title()),content:A.text(A.body()),images:A.images(),titleEditable:editable(A.title()),bodyEditable:editable(A.body())};}
 const fingerprint=s=>JSON.stringify([s.id,s.title,s.content,s.images]);
 const labels=['替换','替换图片','更换','更换图片'];
 function replacement(){const roots=[...document.querySelectorAll('.image-selector__edit-bar')].filter(vis);const nodes=roots.flatMap(r=>[...r.querySelectorAll('*')]).filter(e=>vis(e)&&labels.includes(norm(e.textContent)));const leaves=nodes.filter(e=>!nodes.some(x=>x!==e&&e.contains(x)));if(leaves.length!==1)throw Error('当前页面未提供唯一的图片替换入口；未删除原图，请保留页面并下载诊断');return leaves[0];}
 function removeControl(){const es=[...document.querySelectorAll('.image-selector__edit-bar a.comm_del')].filter(vis);if(es.length!==1)throw Error('图片删除入口不唯一，未改动原图');return es[0];}
 const same=(a,b)=>a.length===b.length&&a.every((u,i)=>A.identity(u)===A.identity(b[i]));
 function expected(r){return [...r.oldUrls.slice(r.removed),...r.newUrls];}
 async function plan(article,resume){const s=snapshot();if(!s.title||!s.images.length)throw Error('此入口只用于已有贴图内容，不用于空白新稿');if(resume&&!same(s.images,expected(resume)))throw Error('当前图片与中断记录不符，未重复上传');if(!resume&&s.images.length!==article.images.length)throw Error('已发表修改暂不增删图片，请保持图片数量和顺序');
  if(s.title!==article.title&&!s.titleEditable)throw Error('页面不允许修改标题');if(s.content!==article.content&&!s.bodyEditable)throw Error('页面不允许修改正文');
  let strategy='replace';try{replacement();}catch{strategy='rebuild';}
  return {snapshot:s,fingerprint:fingerprint(s),strategy,rebuild:resume||null,titleChanged:s.title!==article.title,bodyChanged:s.content!==article.content};}
 const pause=()=>new Promise(r=>setTimeout(r,150));
 async function stage(article,approved,changes,hooks){let s=snapshot();if(fingerprint(s)!==approved.fingerprint)throw Error('核对后页面内容发生变化，未开始替换');
  if(s.title!==article.title&&!s.titleEditable||s.content!==article.content&&!s.bodyEditable)throw Error('页面字段已变为只读');
  let urls=[...s.images];
  if(changes.length&&approved.strategy==='rebuild'){urls=await rebuild(article,approved,hooks);}
  else for(const i of changes){
   await hooks.check();const rows=[...document.querySelectorAll('.image-selector__bottom-list-item')].filter(vis);if(rows.length!==urls.length)throw Error('图片列表发生变化');rows[i].click();await pause();
   const btn=replacement(),before=new Set(document.querySelectorAll('input[type=file]'));btn.click();await pause();
   const end=Date.now()+5000;let input;
   while(Date.now()<end){
    const candidates=[...document.querySelectorAll('input[type=file]')].filter(e=>!e.disabled&&!e.closest('.tpl_dropdown_menu')&&(e.closest('.image-selector__edit-bar')||!before.has(e)));
    if(candidates.length===1){input=candidates[0];break;}await pause();
   }
   if(!input)throw Error('无法唯一识别换图上传控件，未上传本张图片');
   const im=article.images[i],[,mime,data]=/^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(im.dataUrl),dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(data),x=>x.charCodeAt(0))],im.name,{type:mime}));
   await hooks.progress(i,urls);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   let done=false;const until=Date.now()+60000;
   while(Date.now()<until){await hooks.check();const next=A.images();if(next.length!==urls.length)throw Error('换图后图片数量变化，已停止，未提交');if(next.some((u,j)=>j!==i&&A.identity(u)!==A.identity(urls[j])))throw Error('换图影响了其他图片，未提交');if(A.identity(next[i])!==A.identity(urls[i])){urls[i]=next[i];done=true;break;}await pause();}
   if(!done)throw Error('等待图片替换完成超时，未提交');await hooks.done(i,urls);
  }
  await hooks.check();if(A.value(A.title())!==s.title||A.text(A.body())!==s.content)throw Error('运行期间文字发生变化，未覆盖');if(A.value(A.title())!==article.title)A.put(A.title(),article.title);if(A.text(A.body())!==article.content)A.pasteBody(A.body(),article.content);
  await pause();A.verify(article,urls);return urls;
 }
 async function rebuild(article,approved,hooks){
  const r=approved.rebuild?structuredClone(approved.rebuild):{oldUrls:[...approved.snapshot.images],newUrls:[],removed:0};
  const check=async()=>{await hooks.check();if(!same(A.images(),expected(r)))throw Error('图片列表与记录不符，未继续');if(A.value(A.title())!==approved.snapshot.title||A.text(A.body())!==approved.snapshot.content)throw Error('运行期间文字发生变化，未继续');};
  await check();removeControl();if(r.newUrls.length<article.images.length){A.input();if(r.oldUrls.length-r.removed+article.images.length>20)throw Error('无法在保留原图时上传整组新图：临时图片数超过 20，未改动原图');}
  await hooks.checkpoint(r,'先上传并核对新图，原图暂时保留');
  for(let i=r.newUrls.length;i<article.images.length;i++){
   await check();const before=expected(r);A.upload(article.images[i]);const end=Date.now()+60000;let done=false;
   while(Date.now()<end){await hooks.check();const next=A.images();if(same(next,before)){await pause();continue;}if(next.length!==before.length+1||!same(next.slice(0,-1),before))throw Error('追加新图后列表异常，原图未删除');r.newUrls.push(next.at(-1));done=true;break;}
   if(!done)throw Error('新图上传超时，原图未删除');await hooks.checkpoint(r,'已上传新图 '+(i+1)+'/'+article.images.length);
  }
  while(r.removed<r.oldUrls.length){
   await check();if(r.newUrls.length!==article.images.length)throw Error('新图未全部核对，不能移除旧图');
   const before=expected(r),rows=[...document.querySelectorAll('.image-selector__bottom-list-item')].filter(vis);if(rows.length!==before.length)throw Error('图片缩略图数量不符');rows[0].click();await pause();removeControl().click();
   const end=Date.now()+10000;let done=false,confirmed=false;
   while(Date.now()<end){await hooks.check();const next=A.images();if(same(next,before.slice(1))){done=true;break;}if(!same(next,before))throw Error('移除旧图后顺序异常，未提交');
    const dialogs=[...document.querySelectorAll('[role=dialog],.weui-desktop-dialog')].filter(e=>vis(e)&&/删除/.test(e.textContent)&&/图片/.test(e.textContent));
    if(!confirmed&&dialogs.length===1){const buttons=[...dialogs[0].querySelectorAll('button,a')].filter(e=>vis(e)&&!e.disabled&&/^(确定|删除|确定删除)$/.test(e.textContent.trim()));if(buttons.length===1){buttons[0].click();confirmed=true;}}
    await pause();
   }
   if(!done)throw Error('旧图移除未完成，保留现场，未提交');r.removed++;await hooks.checkpoint(r,'已核对并移除旧图 '+r.removed+'/'+r.oldUrls.length);
  }
  await check();return r.newUrls;
 }
 globalThis.PublishedEditor={plan,stage,snapshot,fingerprint};
})();
