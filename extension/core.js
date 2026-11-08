/* Shared pure validation. Personal settings never come from article packages. */
(()=>{
 const fail=m=>{throw Error(m);};
 const text=(x,name,max)=>typeof x==='string'&&x.trim()&&x.length<=max?x.trim():fail(name+'无效');
 const https=(value)=>{let u;try{u=new URL(value);}catch{fail('图片地址无效');}if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)||/\.(local|internal)$/.test(u.hostname))fail('只支持公开 HTTPS 图片地址');return u.href;};
 const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 function profile(p){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(p.recipient||''))fail('预览微信号只允许字母、数字、横线和下划线');return {accountKey:text(p.accountKey,'公众号本地标识',100),author:text(p.author,'文章作者',8),originalAuthor:text(p.originalAuthor||p.author,'原创作者',8),recipient:text(p.recipient,'预览微信号',100),original:p.original===true};}
 async function photoArticle(p){
  const allowed=['schemaVersion','type','articleId','title','content','images'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))fail('贴图包包含不支持的字段');
  const id=text(p.articleId,'文章 ID',100);if(!/^[a-zA-Z0-9_-]+$/.test(id))fail('文章 ID 无效');
  const title=text(p.title,'标题',64);
  if(typeof p.content!=='string'||p.content.length>20000)fail('正文无效或过长');
  if(!Array.isArray(p.images)||!p.images.length||p.images.length>20)fail('贴图包需含 1–20 张图片，最终以页面限制为准');
  let total=0;const images=[];
  for(const im of p.images){
   if(!im||Object.keys(im).some(k=>!['name','dataUrl','sha256'].includes(k)))fail('贴图图片字段无效');
   const name=text(im.name,'图片文件名',120);if(!/^[^/\\]+\.(png|jpe?g)$/i.test(name))fail('图片仅支持 PNG/JPG 文件名');
   const m=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(im.dataUrl||'');if(!m)fail('需要内嵌 PNG/JPG 原图');
   let bytes;try{bytes=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));}catch{fail('图片编码无效');}
   total+=bytes.length;if(bytes.length>10*1024*1024||total>32*1024*1024)fail('单图限 10 MB，图片总计限 32 MB');
   if(m[1]==='png'?![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))fail('图片类型与内容不符');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   if(hash!==im.sha256)fail('图片校验失败：'+name);images.push({name,dataUrl:im.dataUrl,sha256:hash});
  }
  const out={schemaVersion:2,type:'newspic',articleId:id,title,content:p.content,images};
  return {...out,hash:await sha(JSON.stringify([id,title,p.content,images.map(i=>i.sha256)]))};
 }
 async function article(p){
  if(p?.schemaVersion===2&&p.type==='newspic')return photoArticle(p);
  if(!p||p.schemaVersion!==1)fail('不支持的文章包版本');
  const allowed=['schemaVersion','articleId','title','summary','source','html','images','coverIndex'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))fail('文章包含不支持的字段；署名和接收人只能在插件设置');
  const id=text(p.articleId,'文章 ID',100);if(!/^[a-zA-Z0-9_-]+$/.test(id))fail('文章 ID 只允许字母数字、横线和下划线');
  const title=text(p.title,'标题',64),summary=typeof p.summary==='string'&&p.summary.length<=120?p.summary:fail('摘要最长 120 字符');
  if(typeof p.html!=='string'||!p.html.trim()||p.html.length>2000000)fail('正文为空或超过 2 MB');
  if(p.source?.kind!=='mdnice-rendered'||new URL(p.source.url).origin!=='https://editor.mdnice.com')fail('需要实际 MDnice 排版来源');
  const htmlSha=await sha(p.html);if(htmlSha!==p.source.htmlSha256)fail('MDnice HTML 哈希不符，文章包已损坏或被修改');
  if(!Array.isArray(p.images)||p.images.length<1||p.images.length>50)fail('文章包需含 1–50 张图片（封面从正文选择）');
  const images=p.images.map(im=>{const out={mdniceUrl:https(im.mdniceUrl)};if(im.wechatUrl){out.wechatUrl=https(im.wechatUrl);if(!/(^|\.)qpic\.cn$/.test(new URL(out.wechatUrl).hostname))fail('微信图片须为 qpic.cn 地址');}return out;});
  if(!Number.isInteger(p.coverIndex)||p.coverIndex<0||p.coverIndex>=images.length)fail('封面图片序号无效');
  const out={schemaVersion:1,articleId:id,title,summary,html:p.html,source:{kind:'mdnice-rendered',url:p.source.url,theme:String(p.source.theme||''),htmlSha256:htmlSha},images,coverIndex:p.coverIndex};
  return {...out,hash:await sha(JSON.stringify(out))};
 }
 const runKey=(profile,article)=>'run:'+encodeURIComponent(profile.accountKey)+':'+article.articleId+':'+article.hash;
 const guardKey=async(p,a)=>'send:'+await sha(JSON.stringify([p.accountKey,a.title,a.type==='newspic'?await sha(JSON.stringify([a.content,a.images.map(i=>i.sha256)])):a.source.htmlSha256]));
 globalThis.EditorialCore={profile,article,sha,https,runKey,guardKey};
 if(typeof module!=='undefined')module.exports=globalThis.EditorialCore;
})();
