/* Shared pure validation. Personal settings never come from article packages. */
(()=>{
 const fail=m=>{throw Error(m);};
 const text=(x,name,max)=>typeof x==='string'&&x.trim()&&x.length<=max?x.trim():fail(name+'无效');
 const https=(value)=>{let u;try{u=new URL(value);}catch{fail('图片地址无效');}if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)||/\.(local|internal)$/.test(u.hostname))fail('只支持公开 HTTPS 图片地址');return u.href;};
 const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 function profile(p){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(p.recipient||''))fail('预览微信号只允许字母、数字、横线和下划线');return {accountKey:text(p.accountKey,'公众号本地标识',100),author:text(p.author,'文章作者',8),originalAuthor:text(p.originalAuthor||p.author,'原创作者',8),recipient:text(p.recipient,'预览微信号',100),original:p.original===true};}
 async function article(p){
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
 const guardKey=async(p,a)=>'send:'+await sha(JSON.stringify([p.accountKey,a.title,a.source.htmlSha256]));
 globalThis.EditorialCore={profile,article,sha,https,runKey,guardKey};
 if(typeof module!=='undefined')module.exports=globalThis.EditorialCore;
})();
