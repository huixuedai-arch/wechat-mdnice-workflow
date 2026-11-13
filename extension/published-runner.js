(async()=>{
 if(globalThis.__publishedRunning)return;globalThis.__publishedRunning=true;
 const msg=async(type,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(r?.error)throw Error(r.error);return r;};
 const update=(stage,note,extra={})=>msg('update',{patch:{stage,...extra},note});
 try{const r=await msg('load');if(r.mode!=='published')throw Error('非已发表修改任务');
 const urls=await PublishedEditor.stage(r.article,r.approved,r.approved.changes,{
 check:async()=>{if((await msg('run-state')).stop)throw Error('任务已停止，未提交');},
 progress:async(i,urls)=>update('published-edit','准备替换第 '+(i+1)+' 张图片',{imageUrls:urls,pendingImage:i}),
 done:async(i,urls)=>update('published-edit','已填入第 '+(i+1)+' 张新图片',{imageUrls:urls,pendingImage:null})});
 await update('published-ready','修改内容已填入并核对；请在网页审核后手动提交修改',{imageUrls:urls,error:null});
 }catch(e){await update('blocked',e.message,{blockedAt:'published-edit',error:e.message,details:{editor:NewspicEditor.audit(),controls:[...document.querySelectorAll('.image-selector__edit-bar *')].filter(NewspicEditor.visible).map(e=>({tag:e.tagName,className:String(e.className),text:e.textContent.slice(0,80)}))}}).catch(()=>{});}
 finally{globalThis.__publishedRunning=false;}
})();
