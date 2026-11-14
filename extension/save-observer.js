/* Passive, page-local save diagnostics. No request changes, credentials or text retained. */
(()=>{
 if(globalThis.__wechatSaveObserver)return;globalThis.__wechatSaveObserver=true;
 const records=[],pending=new WeakMap();
 const publish=()=>document.documentElement.setAttribute('data-wechat-save-diagnostic',JSON.stringify(records));
 function begin(url,method,body){let u;try{u=new URL(url,location.href);}catch{return null;}
  if(u.origin!==location.origin||!u.pathname.includes('appmsg')||String(method).toUpperCase()!=='POST')return null;
  const r={at:new Date().toISOString(),path:u.pathname,status:'pending',textFields:[]};
  try{const pairs=body instanceof FormData||body instanceof URLSearchParams?body:new URLSearchParams(typeof body==='string'?body:'');for(const [key,value] of pairs){if(/^(title|content|digest)\d*$/.test(key)&&typeof value==='string')r.textFields.push({name:key,chars:value.length});}}catch{}
  records.push(r);if(records.length>10)records.shift();publish();return r;
 }
 function finish(r,status,data){if(!r)return;r.status=status;try{const d=typeof data==='string'?JSON.parse(data):data;for(const [key,v] of [['ret',d?.base_resp?.ret??d?.ret],['errcode',d?.errcode]])if(typeof v==='number'||typeof v==='string'&&/^-?\d+$/.test(v))r[key]=v;}catch{}publish();}
 const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
 XMLHttpRequest.prototype.open=function(method,url,...rest){pending.set(this,{method,url});return open.call(this,method,url,...rest);};
 XMLHttpRequest.prototype.send=function(body){const m=pending.get(this),r=m&&begin(m.url,m.method,body);if(r)this.addEventListener('loadend',()=>{let data;try{data=this.responseType==='json'?this.response:this.responseText;}catch{}finish(r,this.status,data);},{once:true});return send.call(this,body);};
 const fetchOriginal=globalThis.fetch;if(fetchOriginal)globalThis.fetch=function(input,init){const r=begin(typeof input==='string'?input:input.url,init?.method||input.method||'GET',init?.body);return fetchOriginal.apply(this,arguments).then(response=>{if(r)response.clone().text().then(data=>finish(r,response.status,data)).catch(()=>finish(r,response.status,null));return response;},error=>{finish(r,'network-error',null);throw error;});};
 publish();
})();
