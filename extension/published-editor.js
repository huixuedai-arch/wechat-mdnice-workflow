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
 async function plan(article){const s=snapshot();if(!s.title||!s.images.length)throw Error('此入口只用于已有贴图内容，不用于空白新稿');if(s.images.length!==article.images.length)throw Error('已发表修改暂不增删图片，请保持图片数量和顺序');
  if(s.title!==article.title&&!s.titleEditable)throw Error('页面不允许修改标题');if(s.content!==article.content&&!s.bodyEditable)throw Error('页面不允许修改正文');
  return {snapshot:s,fingerprint:fingerprint(s),titleChanged:s.title!==article.title,bodyChanged:s.content!==article.content};}
 const pause=()=>new Promise(r=>setTimeout(r,150));
 async function stage(article,approved,changes,hooks){let s=snapshot();if(fingerprint(s)!==approved.fingerprint)throw Error('核对后页面内容发生变化，未开始替换');
  if(changes.length)replacement(); // Preflight before writing any text.
  const urls=[...s.images];
  for(const i of changes){
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
  await hooks.check();if(A.value(A.title())!==article.title)A.put(A.title(),article.title);if(A.text(A.body())!==article.content)A.pasteBody(A.body(),article.content);
  await pause();A.verify(article,urls);return urls;
 }
 globalThis.PublishedEditor={plan,stage,snapshot,fingerprint};
})();
