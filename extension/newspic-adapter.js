/* DOM adapter for a user-opened image-text editor. No private APIs. */
(()=>{
 const visible=e=>{if(!e||!e.getClientRects().length)return false;for(let n=e;n;n=n.parentElement){const s=getComputedStyle(n);if(n.hidden||s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}return true;};
 const unique=(es,label)=>{if(es.length!==1)throw Error(label+'无法唯一定位（'+es.length+'）');return es[0];};
 const dialogs='[role=dialog],.weui-desktop-dialog';
 const outside=e=>!e.closest(dialogs);
 function title(){return unique([...document.querySelectorAll('input,textarea,[contenteditable=true]')].filter(e=>visible(e)&&outside(e)&&(e.id==='title'||/请输入标题|请在这里输入标题/.test((e.getAttribute('placeholder')||'')+(e.getAttribute('data-placeholder')||'')))),'贴图标题');}
 function body(){return unique([...document.querySelectorAll('.ProseMirror[contenteditable=true],.js_pmEditorArea[contenteditable=true],textarea')].filter(e=>visible(e)&&outside(e)&&e!==title()&&(e.tagName!=='TEXTAREA'||/正文|内容/.test(e.placeholder||''))),'贴图正文');}
 const value=e=>'value'in e?e.value:e.textContent;
 function text(el){if('value'in el)return el.value;
  const copy=el.cloneNode(true);copy.querySelectorAll('.ProseMirror-widget[contenteditable=false],.ProseMirror-separator,.ProseMirror-trailingBreak').forEach(e=>e.remove());
  const read=node=>node.nodeType===3?node.nodeValue:node.nodeName==='BR'?'\n':[...node.childNodes].map(read).join('');
  const blocks=[...copy.children];
  if(blocks.length&&blocks.every(e=>['P','DIV'].includes(e.tagName)))return blocks.map(e=>{
   const brs=[...e.querySelectorAll('br')];if(!e.textContent&&brs.length===1)return '';return read(e);
  }).join('\n');
  return read(copy);
 }
 function put(el,v){if(el.maxLength>0&&v.length>el.maxLength)throw Error('页面限制为 '+el.maxLength+' 字符，原文有 '+v.length+'，未自动缩短');
  if('value'in el){const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  else{el.focus();const range=document.createRange();range.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);if(!document.execCommand('insertText',false,v))throw Error('文本输入失败');}el.blur();
 }
 const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 function pasteBody(el,v){if('value'in el){put(el,v);return;}
  el.focus();const range=document.createRange();range.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
  // Native editing replaces the DOM selection. A synthetic paste may use the
  // framework's stale selection instead, appending to an existing document.
  if(!sel.rangeCount||!el.contains(sel.getRangeAt(0).commonAncestorContainer))throw Error('正文替换选区未落在编辑器内');
  const html='<span style="white-space:pre-wrap">'+esc(v).replace(/\n/g,'<br>')+'</span>'+(v.endsWith('\n')?'<br>':'');
  if(!document.execCommand('insertHTML',false,html))throw Error('浏览器未接受正文替换，已停止');
  el.blur();
 }
 function knownBody(actual,article,previous,backup){
  const texts=[article.content,previous?.content,backup?.content,previous?.backupContent].filter(t=>typeof t==='string');
  const variants=[...new Set(texts.flatMap(t=>[t,t.replace(/\n+/g,'\n')]))];
  if(!actual||variants.includes(actual))return true;
  // Repair only the exact duplication caused by older synthetic-paste builds.
  return variants.some(a=>variants.some(b=>actual===a+b));
 }
 const wx=u=>{try{return /(^|\.)qpic\.cn$/.test(new URL(u).hostname);}catch{return false;}};
 const identity=u=>{const x=new URL(u);return x.hostname+x.pathname.replace(/\/(0|640|1080)$/,'');};
 function images(){
  // The thumbnail list is authoritative; the large preview repeats its current image.
  const rows=[...document.querySelectorAll('.image-selector__bottom-list-item')].filter(e=>visible(e)&&outside(e));
  if(rows.length)return rows.map(e=>{const candidates=[e,...e.querySelectorAll('img')];for(const n of candidates){const u=n.getAttribute('data-src')||n.getAttribute('src');if(u&&wx(u))return u;for(const m of getComputedStyle(n).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g))if(wx(m[1]))return m[1];}return null;}).filter(Boolean);
  const es=[...document.querySelectorAll('.weui-desktop-upload__thumb,.pic_item,[class*=upload_thumb],[class*=upload__thumb],[class*=image-selector]')].filter(e=>visible(e)&&outside(e));
  const urls=[],preview=[];for(const e of es){const candidates=e.className&&String(e.className).includes('image-selector')?[e]:[e,...e.querySelectorAll('img')];if(String(e.className).includes('image-selector'))candidates.push(...[...e.querySelectorAll('img')].filter(i=>i.parentElement===e));for(const n of candidates){const u=n.getAttribute('data-src')||n.getAttribute('src');const bg=getComputedStyle(n).backgroundImage;for(const url of [u,...[...bg.matchAll(/url\(["']?(.*?)["']?\)/g)].map(m=>m[1])])if(url&&wx(url)){const list=n.closest('[class*=preview-center]')?preview:urls;if(!list.some(x=>identity(x)===identity(url)))list.push(url);}}}
  return urls.length?urls:preview;
 }
 function input(){
  const roots=[...document.querySelectorAll('.image-selector')].filter(e=>visible(e)&&outside(e));
  if(roots.length){
   const root=unique(roots,'贴图图片区域');
   // Both uploaders remain mounted. Select their semantic parent, not input visibility.
   const selector=images().length?'.image-selector__bottom-add':'.image-selector__add';
   const entry=unique([...root.querySelectorAll(selector)].filter(visible),'贴图'+(images().length?'追加图片':'首图')+'入口');
   return unique([...entry.querySelectorAll('.js_upload_btn_container input[type=file]')].filter(e=>!e.disabled),'贴图本地上传控件');
  }
  // Legacy editor: exclude toolbar inserts and require one unambiguous uploader.
  const primary=[...document.querySelectorAll('.js_upload_btn_container input[type=file]')].filter(e=>!e.disabled&&outside(e));
  const candidates=primary.length?primary:[...document.querySelectorAll('input[type=file][multiple][accept*=image]')].filter(e=>!e.disabled&&outside(e)&&!e.closest('.tpl_dropdown_menu_item'));
  return unique(candidates,'贴图上传控件');
 }
 function assertEditor(){title();body();if(visible(document.querySelector('#js_cover_area'))&&!document.querySelector('.image-selector'))throw Error('当前是普通文章编辑页，请新建“贴图”内容后运行');}
 function upload(im){const [,mime,b64]=/^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(im.dataUrl);const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],im.name,{type:mime}));const el=input();el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));}
 async function confirmPending(im){
  for(const input of document.querySelectorAll('input[type=file]'))for(const file of input.files||[]){
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');if(hash===im.sha256)return true;
  }
  throw Error('当前页面没有保留待上传图片的文件校验依据，不能自动认领现有图片；未重复上传');
 }
 function verify(a,expected){if(value(title())!==a.title)throw Error('贴图标题读回不一致');const got=text(body());if(got!==a.content)throw Object.assign(Error('贴图正文或空行/空格读回不一致'),{details:{expectedChars:a.content.length,actualChars:got.length,expectedLines:a.content.split('\n').length,actualLines:got.split('\n').length}});
  const urls=images();if(urls.length!==a.images.length)throw Error('贴图图片数量不一致：'+urls.length+'/'+a.images.length);
  if(!expected||JSON.stringify(urls.map(identity))!==JSON.stringify(expected.map(identity)))throw Error('贴图图片顺序或身份读回不一致');return urls;
 }
 function compareText(actual,expected){
  let i=0;while(i<actual.length&&i<expected.length&&actual[i]===expected[i])i++;
  return {matches:actual===expected,newlineRunsOnly:actual.replace(/\n+/g,'\n')===expected.replace(/\n+/g,'\n'),expectedChars:expected.length,actualChars:actual.length,
   expectedLineBreaks:(expected.match(/\n/g)||[]).length,actualLineBreaks:(actual.match(/\n/g)||[]).length,
   firstMismatch:actual===expected?null:i,expectedCodePoint:expected.codePointAt(i)??null,actualCodePoint:actual.codePointAt(i)??null};
 }
 function audit(){
  const read=fn=>{try{return fn();}catch(e){return {error:e.message};}};
  return {saveResponses:read(()=>JSON.parse(document.documentElement.getAttribute('data-wechat-save-diagnostic')||'[]')),at:new Date().toISOString(),imageCount:read(()=>images().length),thumbnailCount:document.querySelectorAll('.image-selector__bottom-list-item').length,
   uploadEntries:[...document.querySelectorAll('.image-selector__add,.image-selector__bottom-add')].map(e=>({className:e.className,visible:visible(e),fileInputs:e.querySelectorAll('input[type=file]').length})),
   selectedUpload:read(()=>{const e=input();return {entry:e.closest('.image-selector__add,.image-selector__bottom-add')?.className||'legacy',fileCount:e.files.length};}),
   titleChars:read(()=>value(title()).length),bodyChars:read(()=>text(body()).length),
   bodyStructure:read(()=>[body(),...body().querySelectorAll('*')].slice(0,50).map(e=>({tag:e.tagName,className:String(e.className).slice(0,120),editable:e.getAttribute('contenteditable'),textLength:e.textContent.length}))),
   alerts:[...document.querySelectorAll('.weui-desktop-toast,.weui-desktop-toptips,.js_tips,[role=alert]')].filter(visible).map(e=>e.textContent.slice(0,160).replace(/https?:\/\/[^\s<>"']+/g,'[URL omitted]')).slice(0,5)};
 }
 globalThis.NewspicEditor={visible,title,body,value,text,put,pasteBody,images,input,assertEditor,upload,verify,identity,confirmPending,audit,compareText,knownBody};
})();
