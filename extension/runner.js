(async()=>{
 if(globalThis.__editorialRunning)return;globalThis.__editorialRunning=true;
 const msg=async(type,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(r?.error)throw Error(r.error);return r;};
 const update=(stage,note,extra={})=>msg('update',{patch:{stage,...extra},note});
 const visible=e=>!!e && e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden';
 const editor=()=>document.querySelector('.rich_media_content .ProseMirror');
 const cleanImages=()=>[...editor().querySelectorAll('img')].filter(i=>!i.classList.contains('ProseMirror-separator'));
 const wxImage=u=>{try{return /(^|\.)qpic\.cn$/.test(new URL(u).hostname);}catch{return false;}};
 const A=EditorialEditor;
 const imageIdentity=u=>{const x=new URL(u);return x.hostname+x.pathname.replace(/\/(0|640|1080)$/,'');};
 async function checkStop(){const r=await msg('load');if(r.stop)throw Error('用户停止了后续操作');}
 async function until(fn,label,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){await checkStop();const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,400));}throw Error('等待超时：'+label);}
 function exactButton(text,root=document){const found=[...root.querySelectorAll('button,a,[role="button"]')].filter(e=>visible(e)&&e.textContent.trim()===text&&!e.disabled);if(found.length!==1)throw Error('无法唯一定位按钮：'+text+'（'+found.length+'个）');return found[0];}
 function field(sel,value){const e=document.querySelector(sel);if(!e)throw Error('找不到字段 '+sel);const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
 function metadataSnapshot(){return {title:A.titleValue(),summary:document.querySelector('#js_description')?.value,text:A.norm(A.bodyText(editor())),blocks:[...editor().querySelectorAll('p,h1,h2,h3,h4,blockquote,figcaption')].map(e=>({tag:e.tagName,text:A.norm(e.textContent),style:[...e.style].sort().map(k=>[k,e.style.getPropertyValue(k).trim(),e.style.getPropertyPriority(k)])})),images:cleanImages().map(i=>i.getAttribute('data-src')||i.src)};}
 function verify(article){if(state?.metadataOnly){const now=metadataSnapshot(),expected=state.metadataSnapshot;if(!expected)throw Error('缺少保存前快照');const fields=Object.keys(expected).filter(k=>JSON.stringify(now[k])!==JSON.stringify(expected[k]));if(fields.length)throw Object.assign(Error('保存后核对不一致：'+fields.join('、')),{details:{fields,expectedSummary:expected.summary,actualSummary:now.summary,expectedBlockCount:expected.blocks.length,actualBlockCount:now.blocks.length,firstDifferentBlock:now.blocks.findIndex((b,i)=>JSON.stringify(b)!==JSON.stringify(expected.blocks[i])),textUnchanged:now.text===expected.text,imagesUnchanged:JSON.stringify(now.images)===JSON.stringify(expected.images)}});return now.images;}if(A.titleValue()!==article.title)throw Error('可见文章标题核对失败');A.verifyLayout(editor(),article);if(document.querySelector('#js_description')?.value!==article.summary)throw Error('摘要核对失败');const imgs=cleanImages();if(imgs.length!==article.images.length||!imgs.every(i=>wxImage(i.getAttribute('data-src')||i.src)))throw Error('配图数量或微信托管地址核对失败');const urls=imgs.map(i=>i.getAttribute('data-src')||i.src);if(state.imageUrls&&JSON.stringify(urls.map(imageIdentity))!==JSON.stringify(state.imageUrls.map(imageIdentity)))throw Error('配图身份或顺序变化');return urls;}
 function tips(){return [...document.querySelectorAll('.weui-desktop-toast,.weui-desktop-toptips,.js_tips')].filter(visible).map(e=>e.textContent.trim()).join(' ');}
 function feedback(pattern){
  const seen=new Set(),selector='.weui-desktop-toast,.weui-desktop-toptips,.js_tips';
  const collect=n=>{if(n.nodeType===3)n=n.parentElement;if(!n||n.nodeType!==1)return;
   const items=[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)];
   const parent=n.closest(selector);if(parent)items.push(parent);
   for(const e of items){const t=e.textContent.trim();if(pattern.test(t))seen.add(t);}
  };
  const observer=new MutationObserver(records=>{for(const r of records){collect(r.target);for(const n of [...r.addedNodes,...r.removedNodes])collect(n);}});
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  return {text:()=>[...seen].join(' '),close:()=>observer.disconnect()};
 }
 function saveHistory(){return [...document.querySelectorAll('tr,[role="row"]')].filter(visible).map(e=>e.textContent.trim()).filter(t=>/手动保存/.test(t));}
 function coverValue(){const e=document.querySelector('#js_cover_area .js_cover_preview_new');return visible(e)&&/https?:/.test(getComputedStyle(e).backgroundImage)?getComputedStyle(e).backgroundImage:'';}
 async function prepareReadback(a,note){
  const draftId=new URL(location.href).searchParams.get('appmsgid');
  if(!draftId)throw Error('当前地址没有稳定草稿 ID；未再次保存、未刷新、未发送。请从草稿箱重新打开本篇，再点核对已保存草稿。');
  const imageUrls=verify(a),cover=coverValue();if(!cover)throw Error('封面未就绪，未刷新或发送');
  const current=await msg('load');
  const snapshot={title:A.titleValue(),html:editor().innerHTML,summary:document.querySelector('#js_description')?.value,capturedAt:new Date().toISOString()};
  await update('await-reload',note,{draftId,imageUrls,cover,backup:current.backup||snapshot});
  await msg('reload');
 }
 function authorField(root=document){
  const es=[...root.querySelectorAll('input,textarea,[contenteditable="true"]')].filter(e=>visible(e)&&!editor()?.contains(e)&&/请输入作者/.test((e.getAttribute('placeholder')||'')+(e.getAttribute('data-placeholder')||''))&& (root!==document||!e.closest('[role="dialog"],.weui-desktop-dialog')));
  if(es.length!==1)throw Error('作者输入框不唯一：'+es.length);return es[0];
 }
 const value=e=>('value'in e?e.value:e.textContent).trim();
 function putAuthor(e,name){e.focus();if(e.matches('input,textarea')){const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,name);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}else{const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);if(!document.execCommand('insertText',false,name))throw Error('作者写入失败');}e.blur();if(value(e)!==name)throw Error('作者写入核对失败');}
 function textLeaf(root,text){const es=[...root.querySelectorAll('*')].filter(e=>visible(e)&&e.textContent.trim()===text);const leaves=es.filter(e=>!es.some(x=>x!==e&&e.contains(x)));if(leaves.length!==1)throw Error('无法唯一定位：'+text);return leaves[0];}
 async function originalDialog(){
  const find=()=>[...document.querySelectorAll('[role="dialog"],.weui-desktop-dialog')].find(d=>visible(d)&&d.textContent.includes('声明类型')&&d.textContent.includes('文字原创'));
  if(!find())await click(textLeaf(document,'原创'));return until(find,'原创声明窗口');
 }
 function radioFor(d,enabled=true){const label=textLeaf(d,enabled?'文字原创':'无需声明').closest('label,[role="radio"]');if(!label)throw Error('无法核对文字原创选项');const radio=label.matches('[role="radio"]')?label:label.querySelector('input[type="radio"]');if(!radio)throw Error('无法读取文字原创选中状态');return {label,radio,checked:radio.checked===true||radio.getAttribute('aria-checked')==='true'};}
 async function metadata(checkOnly=false){
  const cfg=state.profile,author=authorField();
  if(checkOnly){if(value(author)!==cfg.author)throw Error('刷新后文章作者不一致');}
  else if(!author.readOnly)putAuthor(author,cfg.author);
  const d=await originalDialog(),opt=radioFor(d,cfg.original);
  if(checkOnly){if(!opt.checked||(cfg.original&&value(authorField(d))!==cfg.originalAuthor))throw Error('刷新后原创类型或原创作者不一致');await click(exactButton('取消',d));await until(()=>!visible(d),'关闭原创核验窗口');return;}
  if(!opt.checked)await click(opt.label);
  if(cfg.original){
   putAuthor(authorField(d),cfg.originalAuthor);
   const agreements=[...d.querySelectorAll('input[type="checkbox"],[role="checkbox"]')].filter(e=>/我已阅读并同意/.test(e.closest('label')?.textContent||e.parentElement?.textContent||''));
   if(agreements.length!==1)throw Error('无法唯一核对原创协议勾选框');const agree=agreements[0];if(!agree.checked&&agree.getAttribute('aria-checked')!=='true')await click(agree);
   if(!agree.checked&&agree.getAttribute('aria-checked')!=='true')throw Error('原创协议勾选失败');
  }
  if(!radioFor(d,cfg.original).checked)throw Error('原创类型核对失败');
  await click(exactButton('确定',d));await until(()=>!visible(d),'原创声明确认完成');
  const after=authorField();if(!after.readOnly&&value(after)!==cfg.author)putAuthor(after,cfg.author);
  if(value(after)!==cfg.author)throw Error('平台将署名与原创作者联动锁定；请将两个作者配置为相同值，未保存或发送');
 }
 async function saveReadback(a){
  await update('saving','提交保存草稿');const before=tips(),historyBefore=new Set(saveHistory()),signal=feedback(/保存成功|已保存|保存为草稿成功|保存.*失败|草稿.*失败/);
  try{await click(exactButton('保存为草稿'));await until(()=>{const t=signal.text()+' '+(tips()!==before?tips():'');if(/保存.*失败|草稿.*失败/.test(t))throw Error(t);return /保存成功|已保存|保存为草稿成功/.test(t)||saveHistory().some(row=>!historyBefore.has(row));},'保存反馈或新增手动保存记录',60000);}finally{signal.close();}
  await prepareReadback(a,'保存反馈已确认，备份并刷新读回核对');
 }
 async function click(el){await checkStop();el.click();}
 function structureDialog(){return [...document.querySelectorAll('[role="dialog"],.weui-desktop-dialog')].find(e=>visible(e)&&e.textContent.includes('内容结构检测'));}
 async function settleImport(){
  const end=Date.now()+30000;let accepted=false;
  while(Date.now()<end){await checkStop();const d=structureDialog();
   if(d){const t=d.textContent;if(accepted)throw Error('排版提示仍未关闭，停止重复确认');
    if(!t.includes('居中布局不一致'))throw Object.assign(Error('出现新的内容结构提示，需要核对'),{details:{dialog:t.slice(0,3000)}});
    await msg('update',{patch:{layoutWarning:t.slice(0,3000)},note:'微信提示图片居中布局；继续插入后逐字和格式核验'});
    await click(exactButton('继续插入',d));accepted=true;await until(()=>!visible(d),'内容结构提示关闭',15000);
   }else if(A.norm(A.bodyText(editor()))){return;}
   await new Promise(r=>setTimeout(r,400));
  }
  throw Error('等待正文插入超时，未保存或发送');
 }
 let state;
 try{
  state=await msg('load');const a=state.article;
  if(location.origin!=='https://mp.weixin.qq.com')throw Error('站点错误');
  await until(()=>editor()&&A.titleCandidates().length,'图文编辑器及可见标题');
  A.source(a);
  if(state.draftId&&new URL(location.href).searchParams.get('appmsgid')!==state.draftId)throw Error('草稿身份与任务记录不符');
  if(state.stage==='check-only'){if(A.titleValue()!==a.title)throw Error('当前草稿标题与所加载文章包不符');await metadata(true);await update('checked','两个作者和原创类型已只读核对',{metadataVerified:{...state.profile,verifiedAt:new Date().toISOString()}});return;}
  if(state.stage==='metadata'){
   if(!state.draftId||new URL(location.href).searchParams.get('appmsgid')!==state.draftId||A.titleValue()!==a.title)throw Error('请打开当前文章绑定的已保存草稿');
   state.metadataSnapshot=metadataSnapshot();
   if(!state.metadataSnapshot.text||state.metadataSnapshot.images.length!==a.images.length||!state.metadataSnapshot.images.every(wxImage))throw Error('当前正文或配图不完整，未修改');
   await msg('update',{patch:{metadataSnapshot:state.metadataSnapshot,backup:state.backup||{title:A.titleValue(),html:editor().innerHTML,summary:document.querySelector('#js_description')?.value,capturedAt:new Date().toISOString()}},note:'备份当前版本；仅更新署名和原创，保留正文改动'});
   verify(a);
   await msg('update',{patch:{metadataBefore:{author:value(authorField()),capturedAt:new Date().toISOString()}},note:'备份原署名，开始更新作者与原创声明'});
   await metadata();verify(a);await saveReadback(a);return;
  }
  if(state.stage==='verify-saved'){await metadata(true);await prepareReadback(a,'备份并核对现有草稿身份；不再次保存，刷新读回后发送预览');return;}
  if(state.stage==='import'&&state.repair){try{verify(a);await update('cover','现有图文已完整核验，从封面步骤继续');state.stage='cover';}catch(e){/* Incomplete import must follow the guarded repair path. */}}
  if(state.stage==='import'){
   const pending=structureDialog();if(pending){await click(exactButton('取消',pending));await until(()=>!visible(pending),'关闭上一次未完成的插入提示');}
   const ed=editor();
   const placeholderEvidence=[ed,...ed.querySelectorAll('[data-placeholder],[placeholder],[contenteditable="false"]')].some(e=>
    e.getAttribute('data-placeholder')==='从这里开始写正文' || e.getAttribute('placeholder')==='从这里开始写正文' ||
    (e.getAttribute('contenteditable')==='false' && e.textContent.trim()==='从这里开始写正文'));
   const zeroWordCount=[...document.querySelectorAll('span,div,p')].some(e=>visible(e)&&/^正文字数\s*0$/.test(e.textContent.trim()));
   const preflight={title:A.titleValue(),body:A.bodyText(ed),
    mediaCount:cleanImages().length+ed.querySelectorAll('video,audio,iframe,embed,object,svg,canvas').length,
    hasStructuredContent:!!ed.querySelector('table,hr'),placeholderEvidence,zeroWordCount};
   await msg('update',{patch:{preflight:{...preflight,title:preflight.title.slice(0,100),body:preflight.body.slice(0,160),bodyLength:preflight.body.length}},note:'空白检测诊断'});
   if(!EditorialPreflight.empty(preflight))throw Error('编辑页含已有内容，未覆盖；请打开空白编辑页或使用核对已保存草稿入口');
   if(!document.querySelector('#js_description'))throw Error('摘要字段未出现；未写入任何内容，需要适配');
   await update('import','开始导入标题、摘要、正文',{mutationStarted:true});A.setTitle(a.title);field('#js_description',a.summary);await A.paste(ed,A.prepared(a));await settleImport();A.verifyLayout(ed,a,{markers:true});
   await until(()=>cleanImages().length===a.images.length&&cleanImages().every(i=>wxImage(i.getAttribute('data-src')||i.src)),'微信接管并上传正文图片',120000);
   await msg('update',{patch:{imageUrls:verify(a)},note:'正文图片已转为微信托管地址'});
  }
  if(state.stage==='cover'||state.stage==='import'){
   verify(a);await update('cover','核验完成，选择封面');
   const area=document.querySelector('#js_cover_area');
   if(!area)throw Error('找不到实际封面区域 #js_cover_area');
   // Empty-cover, landscape replacement and square replacement share a label.
   // Bind to the empty-cover menu by DOM identity, not text (which includes hidden tips).
   if(!(state.cover&&coverValue()===state.cover)){
   const menu=area.querySelector('#js_cover_null');
   const fromBody=menu?[...menu.querySelectorAll('a.js_selectCoverFromContent')]:[];
   if(fromBody.length!==1)throw Object.assign(Error('新封面菜单按钮缺失或不唯一'),{details:{coverComponent:area.outerHTML.slice(0,18000)}});
   const findPicker=()=>[...document.querySelectorAll('[role="dialog"],.weui-desktop-dialog')].find(d=>visible(d)&&/选择图片/.test(d.textContent)&&/正文/.test(d.textContent));
   const imagePath=u=>{try{return new URL(u,location.href).pathname;}catch{return '';}};
   const target=imagePath(verify(a)[a.coverIndex]);
   const findCrop=()=>[...document.querySelectorAll('[role="dialog"],.weui-desktop-dialog')].find(d=>visible(d)&&d.querySelector('.cover-edit-new')&&d.textContent.includes('编辑封面'));
   let crop=findCrop();
   if(!crop){
   let dialog=findPicker();if(!dialog){await click(fromBody[0]);dialog=await until(findPicker,'正文封面选图对话框');}

   const tiles=()=>[...dialog.querySelectorAll('*')].filter(visible).filter(e=>{
    const urls=[e.getAttribute('src'),e.getAttribute('data-src'),e.getAttribute('data-url')].filter(Boolean);
    const bg=getComputedStyle(e).backgroundImage;for(const m of bg.matchAll(/url\(["']?(.*?)["']?\)/g))urls.push(m[1]);
    return urls.some(u=>wxImage(u)&&imagePath(u)===target);
   });
   const chosen=await until(()=>{const es=tiles();const leaves=es.filter(e=>!es.some(x=>x!==e&&e.contains(x)));if(leaves.length>1)throw Object.assign(Error('预定封面有多个候选，未选择'),{details:{candidates:leaves.map(e=>e.outerHTML.slice(0,1500))}});return leaves[0];},'预定封面缩略图加载',30000);
   await click(chosen);
   const next=await until(()=>[...dialog.querySelectorAll('button,a,[role="button"]')].find(e=>visible(e)&&e.textContent.trim()==='下一步'&&!e.disabled),'封面下一步可用');
   await click(next);
   crop=await until(findCrop,'新的编辑封面裁剪窗口');
   }
   const cropImages=[...crop.querySelectorAll('img.crop-img')];
   if(!cropImages.length||!cropImages.every(i=>wxImage(i.src)&&imagePath(i.src)===target))throw Error('当前裁剪窗口不是预定封面图片，未确认');
   const done=await until(()=>{const buttons=[...crop.querySelectorAll('button')].filter(e=>visible(e)&&e.textContent.trim()==='确认'&&!e.disabled);return buttons.length===1&&buttons[0];},'裁剪确认按钮可用');
   await click(done);await until(()=>!visible(crop),'裁剪确认完成');
   await until(()=>{const cover=area.querySelector('.js_cover_preview_new');return visible(cover)&&getComputedStyle(cover).backgroundImage!=='none'&&/https?:/.test(getComputedStyle(cover).backgroundImage);},'封面预览已生成');
   }
   verify(a);await metadata();await msg('update',{patch:{metadataRequired:true},note:'作者与原创声明已设置'});await saveReadback(a);return;
  }
  if(state.stage==='await-reload'){
   if(state.metadataOnly){
    if(new URL(location.href).searchParams.get('appmsgid')!==state.draftId)throw Error('草稿身份变化，停止');
    await metadata(true);await msg('update',{patch:{metadataVerified:{author:state.profile.author,originalAuthor:state.profile.originalAuthor,original:state.profile.original,verifiedAt:new Date().toISOString()}},note:'已读回确认作者和原创设置；继续核对正文保留情况'});
    let mismatch;try{await until(()=>{try{verify(a);return true;}catch(e){mismatch=e;return false;}},'保存后内容加载及逐项核对',12000);}catch(e){throw mismatch||e;}
   }
   if(!state.metadataOnly){let last;try{await until(()=>{try{verify(a);return true;}catch(e){last=e;return false;}},'草稿内容读回就绪',15000);}catch(e){throw last||e;}}
   if(new URL(location.href).searchParams.get('appmsgid')!==state.draftId)throw Error('草稿身份变化，停止');if(state.cover&&coverValue()!==state.cover)throw Error('刷新后封面缺失或变化，未发送');const urls=verify(a);if(JSON.stringify(urls.map(imageIdentity))!==JSON.stringify(state.imageUrls.map(imageIdentity)))throw Error('刷新后图片顺序或地址变化');
   if(state.metadataRequired&&!state.metadataOnly)await metadata(true);
   if(state.metadataOnly){await update('metadata-saved','作者和原创类型已刷新核对；未发送预览');return;}
   await update('verified','刷新后标题、摘要、正文、配图地址和顺序一致');await click(exactButton('预览'));
   const findPreview=()=>[...document.querySelectorAll('[role="dialog"],.weui-desktop-dialog')].find(d=>visible(d)&&(/微信号/.test(d.textContent)||d.textContent.includes('通过公众号列表预览')));
   let dialog=await until(findPreview,'预览方式对话框');
   const recipientInputs=()=>{dialog=findPreview()||dialog;return [...dialog.querySelectorAll('input')].filter(e=>visible(e)&&!e.disabled&&['text','search',''].includes(e.type));};
   if(!recipientInputs().length){
    const matches=[...dialog.querySelectorAll('*')].filter(e=>visible(e)&&e.textContent.trim()==='通过公众号列表预览');
    const leaves=matches.filter(e=>!matches.some(x=>x!==e&&e.contains(x)));
    if(leaves.length!==1)throw Object.assign(Error('无法唯一定位“通过公众号列表预览”，未发送'),{details:{dialog:dialog.textContent.slice(0,3000)}});
    const option=leaves[0].closest('label,[role="radio"]')||leaves[0];
    await click(option);
   }
   const inputs=await until(()=>{const es=recipientInputs();if(es.length>1)throw Error('预览收件人输入框不唯一');return es.length===1&&es;},'切换公众号列表预览后出现微信号输入框',15000);
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inputs[0],state.profile.recipient);inputs[0].dispatchEvent(new Event('input',{bubbles:true}));inputs[0].dispatchEvent(new Event('change',{bubbles:true}));
   if(inputs[0].value!==state.profile.recipient)throw Error('收件人核对失败');
   await until(()=>[...dialog.querySelectorAll('button,a,[role="button"]')].some(e=>visible(e)&&/^(发送|发送预览|确定)$/.test(e.textContent.trim())&&!e.disabled),'预览收件人确认及发送按钮就绪');
   const sends=[...dialog.querySelectorAll('button,a,[role="button"]')].filter(e=>visible(e)&&/^(发送|发送预览|确定)$/.test(e.textContent.trim())&&!e.disabled);if(sends.length!==1)throw Error('预览发送按钮不唯一');
   // Persist BEFORE sending: ambiguous results must never be retried automatically.
   await update('preview-pending','即将向配置接收人发送一次预览；不自动重试');const before=tips(),signal=feedback(/发送成功|预览成功|发送失败|未关注|不存在|验证码/);
   try{await click(sends[0]);
    await until(()=>{const t=signal.text()+' '+(tips()!==before?tips():'');if(/发送失败|未关注|不存在|验证码/.test(t))throw Error(t);return /发送成功|预览成功/.test(t);},'预览发送成功反馈',45000);
   }finally{signal.close();}
   await update('preview-sent','平台显示发送成功。是否收到仍请在微信核对。');
  }
 }catch(e){const current=await msg('load').catch(()=>null);await update(current?.stage==='preview-pending'?'preview-unknown':'blocked',e.message,{error:e.message,details:e.details||null,blockedAt:current?.stage||'initial'}).catch(()=>{});}
 finally{globalThis.__editorialRunning=false;}
})();
