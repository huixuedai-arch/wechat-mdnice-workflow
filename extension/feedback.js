/* Observe user-visible platform feedback, including short-lived top banners. */
(()=>{
 const selector='.weui-desktop-toast,.weui-desktop-toptips,.js_tips,.page_tips,.tips_global,[role=alert]';
 const failure=/保存.{0,30}(失败|错误|异常|出错|未成功)|无法保存|保存不了|请.{0,20}备份|注意.{0,20}备份|系统繁忙|网络.{0,15}(错误|异常)/;
 const clean=t=>String(t||'').replace(/https?:\/\/[^\s<>"']+/g,'[URL omitted]').trim().slice(0,300);
 const shown=e=>e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 function scan(root,pattern,requireVisible){
  if(root?.nodeType===3)root=root.parentElement;
  if(!root?.querySelectorAll)return [];
  const nodes=[root,...root.querySelectorAll('*')].slice(0,1600),out=[];
  for(const e of nodes){
   if(e.closest('.ProseMirror,[contenteditable=true],textarea,script,style'))continue;
   if(requireVisible&&!shown(e))continue;
   const text=clean(e.textContent);
   if(!text||text.length>280||!pattern.test(text))continue;
   if(!e.matches(selector)&&[...e.children].some(c=>pattern.test(clean(c.textContent))))continue;
   out.push({element:e,text,tag:e.tagName,className:String(e.className).slice(0,160)});
  }
  return out;
 }
 function observe(pattern){
  const baseline=new WeakMap(),seen=new Map();
  for(const x of scan(document.body,pattern,false))baseline.set(x.element,{text:x.text,visible:shown(x.element)});
  const collect=(n,requireVisible=false)=>{for(const {element,...x} of scan(n,pattern,requireVisible)){
   const previous=baseline.get(element),visible=shown(element);
   // Do not mistake an old success banner for acknowledgement of this save.
   if(previous?.text===x.text&&(previous.visible||!visible))continue;
   if(element.isConnected&&!visible)continue;
   seen.set(x.text,x);baseline.set(element,{text:x.text,visible});
  }};
  const observer=new MutationObserver(records=>{for(const r of records){collect(r.target,true);for(const n of r.addedNodes)collect(n);for(const n of r.removedNodes)collect(n);}});
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']});
  return {read:()=>[...seen.keys()].join(' '),evidence:()=>[...seen.values()].slice(-15),close:()=>observer.disconnect()};
 }
 globalThis.WechatFeedback={observe,failure,snapshot:()=>scan(document.body,/保存|备份|失败|错误|异常|繁忙/,true).slice(-20).map(({element,...x})=>x)};
})();
