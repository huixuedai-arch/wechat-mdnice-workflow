(async()=>{
 if(globalThis.__newspicRunning)return;globalThis.__newspicRunning=true;
 const A=NewspicEditor,visible=A.visible;
 const msg=async(type,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(r?.error)throw Error(r.error);return r;};
 const update=(stage,note,extra={})=>msg('update',{patch:{stage,...extra},note});
 const stopped=async()=>{if((await msg('run-state')).stop)throw Error('任务已停止');};
 const click=async e=>{await stopped();if(!visible(e)||e.disabled)throw Error('目标按钮不可用');e.click();};
 const until=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){await stopped();const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,300));}throw Error('等待超时：'+label);};
 function exactButton(t,root=document){const es=[...root.querySelectorAll('button,a,[role=button]')].filter(e=>visible(e)&&e.textContent.trim()===t&&!e.disabled);if(es.length!==1)throw Error('按钮无法唯一定位：'+t);return es[0];}
 const feedback=re=>WechatFeedback.observe(re);
 const history=()=>[...document.querySelectorAll('tr,[role=row]')].filter(visible).map(e=>e.textContent).filter(t=>/手动保存/.test(t));
 let state;
 try{
  if(location.origin!=='https://mp.weixin.qq.com')throw Error('请在公众号贴图编辑页执行');
  state=await msg('load');const a=state.article;if(a.type!=='newspic')throw Error('不是贴图文章包');
  let editorError;try{await until(()=>{try{A.assertEditor();return true;}catch(e){editorError=e;return false;}},'贴图编辑器就绪',10000);}catch{throw editorError||Error('贴图编辑器未就绪');}
  if(state.stage==='import'){
   if(state.repair)throw Error('贴图不自动重复上传，请先核对已保存草稿或诊断');
   const existingTitle=A.value(A.title()),existingBody=A.text(A.body());
   const imagesComplete=state.uploadResume&&state.uploadedImages?.length===a.images.length&&A.images().length===a.images.length;
   if(imagesComplete){
    if(existingTitle&&existingTitle!==a.title&&existingTitle!==state.previousText?.title)throw Error('当前标题与文章包不一致，未覆盖');
    const comparison=A.compareText(existingBody,a.content);
    if(!A.knownBody(existingBody,a,state.previousText,state.backup))throw Object.assign(Error('当前正文有文字或空格改动，未覆盖'),{details:{textComparison:comparison}});
   }else if(existingTitle.trim()||existingBody.trim()||(!state.uploadResume&&A.images().length))throw Error('贴图页已有内容，未覆盖');
   const title=A.title();if(title.maxLength>0&&a.title.length>title.maxLength)throw Error('标题超过当前页面 '+title.maxLength+' 字符限制；原文保留，未上传');
   if(A.body().maxLength>0&&a.content.length>A.body().maxLength)throw Error('正文超过页面限制，未上传');
   let urls=state.uploadResume?(state.uploadedImages||[]):[];
   if(state.uploadResume){const live=A.images();if(urls.some((u,i)=>!live[i]||A.identity(u)!==A.identity(live[i])))throw Error('恢复时已上传图片不一致');
    if(live.length===urls.length+1){const i=urls.length;if(state.pendingImage!==undefined&&state.pendingImage!==null&&state.pendingImage!==i)throw Error('待上传图片索引不一致');await A.confirmPending(a.images[i]);urls=live;}
    else if(live.length!==urls.length)throw Error('恢复时图片数量不符，未重复上传');
   }
   await update('uploading','按顺序继续上传，已核验 '+urls.length+' 张',{mutationStarted:true,uploadedImages:urls});
   for(let i=urls.length;i<a.images.length;i++){
    await stopped();if(A.images().length!==i)throw Error('上传前图片数量发生变化，未继续');
    await update('uploading','准备上传第 '+(i+1)+' 张',{pendingImage:i,details:{expectedImage:i+1,editor:A.audit()}});A.upload(a.images[i]);
    await until(()=>{const next=A.images();if(next.length>i+1)throw Error('上传出现多余图片，未继续');if(next.length!==i+1)return false;if(urls.some((u,j)=>A.identity(u)!==A.identity(next[j])))throw Error('已上传图片顺序发生变化');urls=next;return true;},'第 '+(i+1)+' 张图片上传完成',60000);
    await update('uploading','已上传 '+(i+1)+'/'+a.images.length,{uploadedImages:urls,pendingImage:null});
   }
   await update('text','图片全部核验，继续填写或修复正文空行',{imageUrls:urls,backup:state.backup||{title:existingTitle,content:existingBody},details:{textComparison:A.compareText(A.text(A.body()),a.content)}});
   await stopped();if(A.value(A.title())!==a.title)A.put(A.title(),a.title);
   if(A.text(A.body())!==a.content)A.pasteBody(A.body(),a.content);
   try{await until(()=>A.text(A.body())===a.content,'正文逐字与空行核验',10000);}catch(e){e.details={textComparison:A.compareText(A.text(A.body()),a.content)};throw e;}A.verify(a,urls);
   await applyMetadata(false);
   await update('saving','提交贴图草稿',{imageUrls:urls});
   const old=new Set(history()),signal=feedback(/保存|备份|系统繁忙|网络.{0,15}(错误|异常)/);
   try{await click(exactButton('保存为草稿'));await until(()=>{if(WechatFeedback.failure.test(signal.read()))throw Object.assign(Error('微信保存未成功：'+signal.read()),{details:{saveFeedback:signal.evidence()}});return /保存成功|已保存|保存为草稿成功/.test(signal.read())||history().some(x=>!old.has(x));},'保存成功反馈',60000);}catch(e){e.details={...(e.details||{}),saveFeedback:signal.evidence(),currentFeedback:WechatFeedback.snapshot()};throw e;}finally{signal.close();}
   const draftId=await until(()=>new URL(location.href).searchParams.get('appmsgid'),'保存后的草稿 ID',10000);
   A.verify(a,urls);await update('await-reload','保存成功，刷新核对',{draftId,imageUrls:urls});await msg('reload');return;
  }
  if(['verify-saved','await-reload'].includes(state.stage)){
   if(!state.imageUrls)throw Error('缺少本篇上传核验记录，未发送');
   if(new URL(location.href).searchParams.get('appmsgid')!==state.draftId)throw Error('草稿身份不符');
   let mismatch;try{await until(()=>{try{A.verify(a,state.imageUrls);return true;}catch(e){mismatch=e;return false;}},'贴图保存后读回',12000);}catch{throw mismatch;}
   await applyMetadata(true);
   await update('verified','标题、正文空行空格、全部图片及顺序读回一致');
   await sendPreview();
  }
 }catch(e){const current=await msg('run-state').catch(()=>null);await update(current?.stage==='preview-pending'?'preview-unknown':'blocked',e.message,{error:e.message,details:{...(e.details||{}),editor:A.audit()},blockedAt:current?.stage||'initial'}).catch(()=>{});}
 finally{globalThis.__newspicRunning=false;}

 async function applyMetadata(check){
  const author=[...document.querySelectorAll('input,textarea')].filter(e=>visible(e)&&!e.closest('[role=dialog],.weui-desktop-dialog')&&/请输入作者/.test(e.placeholder||''));
  if(author.length>1)throw Error('署名字段不唯一');
  if(author.length){if(!check)A.put(author[0],state.profile.author);if(author[0].value!==state.profile.author)throw Error('署名核对不一致');}
  const es=[...document.querySelectorAll('*')].filter(e=>visible(e)&&e.textContent.trim()==='原创');const leaves=es.filter(e=>!es.some(x=>x!==e&&e.contains(x)));
  if(!leaves.length){await msg('update',{patch:{},note:author.length?'贴图页已核对署名，未提供原创设置入口':'贴图页未提供独立署名/原创入口，未声明已开启'});return;}
  if(leaves.length!==1)throw Error('原创入口不唯一');await click(leaves[0]);
  const d=await until(()=>[...document.querySelectorAll('[role=dialog],.weui-desktop-dialog')].find(e=>visible(e)&&e.textContent.includes('文字原创')),'原创设置');
  const options=[...d.querySelectorAll('label')].filter(e=>e.textContent.trim()===(state.profile.original?'文字原创':'无需声明'));if(options.length!==1)throw Error('贴图原创类型需要核验，未保存或发送');
  const opt=options[0],radio=opt.querySelector('input[type=radio]');if(!radio)throw Error('无法读回原创状态');
  if(!check&&!radio.checked)await click(opt);if(!radio.checked)throw Error('原创类型核对失败');
  if(state.profile.original){const authors=[...d.querySelectorAll('input')].filter(e=>visible(e)&&/请输入作者/.test(e.placeholder||''));if(authors.length!==1)throw Error('原创作者不唯一');if(!check)A.put(authors[0],state.profile.originalAuthor);if(authors[0].value!==state.profile.originalAuthor)throw Error('原创作者核对失败');}
  if(!check&&state.profile.original){const agrees=[...d.querySelectorAll('input[type=checkbox]')].filter(e=>/我已阅读并同意/.test(e.closest('label')?.textContent||''));if(agrees.length!==1)throw Error('原创协议无法核对');if(!agrees[0].checked)await click(agrees[0]);if(!agrees[0].checked)throw Error('原创协议未勾选');}
  await click(exactButton(check?'取消':'确定',d));await until(()=>!visible(d),'原创窗口关闭');
 }
 async function sendPreview(){
  const norm=t=>String(t||'').replace(/\s+/g,'');
  const roots=()=>[...document.querySelectorAll('[role=dialog],.weui-desktop-dialog')].filter(d=>visible(d)&&/微信号|公众号列表.*预览|扫码预览|二维码/.test(norm(d.textContent)));
  const find=()=>{const ds=roots(),inner=ds.filter(d=>!ds.some(x=>x!==d&&d.contains(x)));return inner.length===1?inner[0]:null;};
  const audit=()=>roots().map(d=>({tag:d.tagName,className:String(d.className),controls:[...d.querySelectorAll('label,[role=radio],input,button,a')].filter(visible).map(e=>({tag:e.tagName,type:e.type,className:String(e.className),label:((e.textContent||'')+' '+(e.placeholder||'')).trim().slice(0,180),checked:e.checked,disabled:e.disabled}))}));
  try {
   if(!find())await click(exactButton('预览'));
   let d=await until(find,'唯一预览窗口',15000);
   const inputs=()=>{d=find()||d;return [...d.querySelectorAll('input')].filter(e=>visible(e)&&!e.disabled&&['text','search',''].includes(e.type));};
   if(!inputs().length){
    let option;
    try{option=await until(()=>{
     d=find()||d;
     const es=[...d.querySelectorAll('*')].filter(e=>visible(e)&&norm(e.textContent)==='通过公众号列表预览');
     const leaves=es.filter(e=>!es.some(x=>x!==e&&e.contains(x)));
     const targets=[...new Set(leaves.map(e=>e.closest('label,[role=radio]')||e))];
     if(targets.length>1)return false;
     return targets[0];
    },'公众号列表预览选项',15000);}catch(e){
     d=find()||d;
     if(e.message==='等待超时：公众号列表预览选项'&&/扫码预览|二维码/.test(d.textContent)&&!inputs().length&&!/通过公众号列表预览/.test(norm(d.textContent))){
      if(new URL(location.href).searchParams.get('appmsgid')!==state.draftId)throw Error('草稿身份发生变化，未确认完成');
      A.verify(state.article,state.imageUrls);
      await update('draft-ready','草稿已保存并核对；当前预览需扫码，请到草稿箱审核并发表',{error:null,details:{previewMethod:'qr',previewSent:false}});
      return;
     }
     throw e;
    }
    await click(option);
   }
   const recipient=await until(()=>{const es=inputs();if(es.length>1)throw Error('预览收件框不唯一');return es[0];},'微信号输入框');A.put(recipient,state.profile.recipient);
  const send=await until(()=>{const es=[...d.querySelectorAll('button,a,[role=button]')].filter(e=>visible(e)&&!e.disabled&&/^(发送|发送预览|确定)$/.test(e.textContent.trim()));if(es.length>1)throw Error('预览发送按钮不唯一');return es[0];},'预览发送按钮');
  if(recipient.value!==state.profile.recipient)throw Error('预览微信号不符');
  await update('preview-pending','发送一次预览，结果不明不重试');const signal=feedback(/发送成功|预览成功|发送失败|未关注|不存在|验证码/);
  try{await click(send);await until(()=>{if(/发送失败|未关注|不存在|验证码/.test(signal.read()))throw Error('预览未确认成功：'+signal.read());return /发送成功|预览成功/.test(signal.read());},'预览发送反馈',45000);}finally{signal.close();}
  await update('preview-sent','平台反馈预览发送成功，等待用户微信确认');
  }catch(e){e.details={...(e.details||{}),previewDialogs:audit()};throw e;}
 }
})();
