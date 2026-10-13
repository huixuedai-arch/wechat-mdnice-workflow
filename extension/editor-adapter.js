/* DOM-only adapter: no credentials, private APIs, or publication action. */
(()=>{
 const norm=s=>String(s||'').replace(/[\s\u200b-\u200d\ufeff]+/g,'').normalize('NFC');
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 function bodyText(ed){const copy=ed.cloneNode(true);copy.querySelectorAll('.ProseMirror-widget[contenteditable="false"]').forEach(e=>{if(e.textContent.trim()==='从这里开始写正文')e.remove();});return copy.textContent;}
 const value=e=>('value'in e?e.value:e.textContent)||'';
 const titleHint=/请(?:在这里)?输入标题/;
 function titleCandidates(doc=document){
  return [...doc.querySelectorAll('input,textarea,[contenteditable="true"]')].filter(e=>visible(e)&&!doc.querySelector('.rich_media_content .ProseMirror')?.contains(e)&&
   (e.id==='title'||titleHint.test([e.getAttribute('placeholder'),e.getAttribute('data-placeholder'),e.getAttribute('aria-label'),e.textContent].join(' '))||
    [...e.querySelectorAll('[placeholder],[data-placeholder]')].some(x=>titleHint.test((x.getAttribute('placeholder')||'')+(x.getAttribute('data-placeholder')||'')))));
 }
 function titleField(){const cs=titleCandidates();const leaf=cs.filter(e=>!cs.some(x=>x!==e&&e.contains(x)));if(leaf.length!==1)throw Error('可见标题输入框不唯一：'+leaf.length+' 个；未使用隐藏 #title');return leaf[0];}
 function titleValue(){const text=value(titleField());return titleHint.test(text.trim())&&text.trim().length<15?'':text.trim();}
 function setTitle(text){
  const e=titleField();e.focus();
  if(e.matches('input,textarea')){const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,text);e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));e.dispatchEvent(new Event('change',{bubbles:true}));}
  else{const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);if(!document.execCommand('insertText',false,text))throw Error('可见标题框不支持文本输入');}
  e.blur();if(titleValue()!==text)throw Error('可见标题写入后读回不一致');
 }
 function source(a){
  if(a.source?.kind!=='mdnice-rendered')throw Error('需要 MDnice 排版包');
  const d=document.createElement('div');d.innerHTML=a.html;
  const tags=new Set('SECTION DIV P SPAN H1 H2 H3 H4 H5 H6 STRONG B EM I U S DEL BR HR UL OL LI BLOCKQUOTE PRE CODE TABLE THEAD TBODY TFOOT TR TH TD FIGURE FIGCAPTION IMG A SUP SUB'.split(' '));
  for(const e of d.querySelectorAll('*')){
   if(!tags.has(e.tagName))throw Error('正文包含不支持的标签：'+e.tagName);
   for(const at of [...e.attributes]){
    if(/^on/i.test(at.name)||['srcdoc','srcset','contenteditable','formaction'].includes(at.name))throw Error('正文包含不支持的活动属性');
    if(at.name==='style'&&/url\s*\(|expression|@import|behavior|-moz-binding/i.test(at.value))throw Error('样式不允许外部资源或执行内容');
    if(!['style','class','id','title','alt','src','href','width','height','colspan','rowspan','start','type'].includes(at.name)&&!at.name.startsWith('data-'))e.removeAttribute(at.name);
   }
   if(e.hasAttribute('href')&&!/^https:\/\//i.test(e.getAttribute('href')))throw Error('只支持 HTTPS 链接');
   if(e.tagName==='IMG'&&!/^https:\/\//i.test(e.getAttribute('src')))throw Error('只支持 HTTPS 图片；请先在 MDnice 上传图片');
  }
  return d;
 }
 function prepared(a){const d=source(a);const imgs=[...d.querySelectorAll('img')];if(imgs.length!==a.images.length)throw Error('MDnice 图片数量不一致');imgs.forEach((img,i)=>{if(new URL(img.getAttribute('src')).href!==a.images[i].mdniceUrl)throw Error('MDnice 图片顺序不符');img.src=a.images[i].wechatUrl||a.images[i].mdniceUrl;});return d.innerHTML;}
 const settle=()=>new Promise(r=>setTimeout(r,150));
 async function paste(ed,html){
  const needsClear=!!norm(bodyText(ed))||!!ed.querySelector('img:not(.ProseMirror-separator),video,iframe');
  ed.focus();const range=document.createRange();range.selectNodeContents(ed);const s=getSelection();s.removeAllRanges();s.addRange(range);
  // ProseMirror updates its own selection asynchronously; a DOM Range alone is insufficient.
  await settle();
  if(needsClear&&norm(s.toString())!==norm(bodyText(ed)))throw Error('未完整选中旧正文，停止替换');
  if(needsClear&&!document.execCommand('delete'))throw Error('无法清空旧正文，停止替换');
  await settle();
  if(norm(bodyText(ed))||ed.querySelector('img:not(.ProseMirror-separator),video,iframe'))throw Error('旧正文未完全清空，未粘贴新内容');
  ed.focus();const caret=document.createRange();caret.selectNodeContents(ed);caret.collapse(true);s.removeAllRanges();s.addRange(caret);await settle();
  const dt=new DataTransfer();const d=document.createElement('div');d.innerHTML=html;dt.setData('text/html',html);dt.setData('text/plain',d.textContent);
  const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});ed.dispatchEvent(event);if(!event.defaultPrevented)throw Error('编辑器未接管富文本粘贴；旧稿已备份，不降级成纯文本');
  await settle();
 }
 function textDiff(want,got){want=norm(want);got=norm(got);let at=0;while(at<Math.min(want.length,got.length)&&want[at]===got[at])at++;return {at,expectedLength:want.length,actualLength:got.length,expected:want.slice(Math.max(0,at-20),at+60),actual:got.slice(Math.max(0,at-20),at+60)};}
 function verifyLayout(ed,a,{markers=false}={}){
  const d=document.createElement('div');d.innerHTML=markers?prepared(a):a.html;
  if(norm(bodyText(ed))!==norm(d.textContent))throw Object.assign(Error('正文逐字核对失败；首个差异已写入诊断'),{details:textDiff(d.textContent,bodyText(ed))});
  const blocks=[...d.querySelectorAll('p,h2,figcaption')].filter(e=>norm(e.textContent));
  const actual=[...ed.querySelectorAll('p,section,h1,h2,h3,h4,figcaption,div')];
  const missed=blocks.filter(b=>!actual.some(e=>norm(e.textContent)===norm(b.textContent)));
  if(missed.length)throw Object.assign(Error('段落边界丢失，禁止保存或发送'),{details:{missingBlocks:missed.map(e=>e.textContent.slice(0,50))}});
  const headings=[...d.querySelectorAll('h1,h2,h3,h4')].map(e=>e.textContent).map(t=>actual.filter(e=>norm(e.textContent)===norm(t)));
  if(headings.some(es=>!es.some(e=>{const c=getComputedStyle(e);return parseFloat(c.fontSize)>=18||parseFloat(c.fontWeight)>=600||[...e.querySelectorAll('*')].some(x=>parseFloat(getComputedStyle(x).fontWeight)>=600);})))throw Error('小标题格式未保留，禁止保存或发送');
  const lead=blocks.length&&actual.find(e=>norm(e.textContent)===norm(blocks[0].textContent));const cs=lead&&getComputedStyle(lead);if(!cs||parseFloat(cs.lineHeight)<parseFloat(cs.fontSize)*1.5)throw Error('正文行距未保留，禁止保存或发送');
  return {blocks:blocks.length,headings:headings.length};
 }
 function repairComparison(ed,a){const d=source(a);return {matches:norm(bodyText(ed))===norm(d.textContent),...textDiff(d.textContent,bodyText(ed))};}
 function repairable(ed,a){return repairComparison(ed,a).matches;}
 globalThis.EditorialEditor={norm,bodyText,visible,titleCandidates,titleField,titleValue,setTitle,source,prepared,paste,verifyLayout,textDiff,repairable,repairComparison};
})();
