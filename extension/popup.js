const $=id=>document.getElementById(id),log=$('log');
let currentArticle=null,selectedMode='news',pollRunning=false,articleLoading=false,uiVersion=0,operation='draft',approvedPlan=false;
function selectMode(mode){selectedMode=mode;for(const [id,m] of [['mode-news','news'],['mode-photo','newspic']])$(id).setAttribute('aria-selected',String(m===mode));$('mode-note').textContent=mode==='newspic'?'贴图：上传原图与纯文本，请打开公众号的“贴图”编辑页。':'文章：导入 MDnice 排版包，请打开公众号的“文章”编辑页。';if($('published-tools'))$('published-tools').hidden=mode!=='newspic';renderOperation();$('run').disabled=articleLoading||!currentArticle||(currentArticle.type||'news')!==mode;}
$('mode-news').onclick=()=>selectMode('news');$('mode-photo').onclick=()=>selectMode('newspic');
function info(id,rows){const el=$(id);el.replaceChildren();for(const [name,value] of rows){const line=document.createElement('div'),label=document.createElement('strong');label.textContent=name+'：';line.append(label,document.createTextNode(value));el.append(line);}}
function message(t){$('progress').textContent=t;}
function showArticle(a){
 currentArticle=a;const grid=$('cover-grid');grid.replaceChildren();$('run').disabled=!a;$('clear').disabled=!a;selectMode(a?(a.type||'news'):selectedMode);
 if($('published-diff')){$('published-diff').replaceChildren();approvedPlan=false;$('published-diff').hidden=true;renderOperation();}
 if(!a){$('article-info').textContent='尚未导入';return;}
 const photo=a.type==='newspic';
 const d=photo?null:new DOMParser().parseFromString(a.html,'text/html');
 const chars=[...(photo?a.content:d.body.textContent||'')].length;
 info('article-info',[['类型',photo?'贴图 · 原图上传':'文章'],['标题',a.title],['正文',photo?`${chars} 字符（保留换行和空格）`:`${chars} 字符，${d.querySelectorAll('h1,h2,h3,h4,h5,h6').length} 个小标题`],['图片',`${a.images.length} 张`]]);
 $('cover-heading').textContent=photo?'图片顺序（第一张为封面）':'选择封面';
 a.images.forEach((im,i)=>{const label=document.createElement('label'),r=document.createElement('input'),img=document.createElement('img'),text=document.createElement('span');r.type='radio';r.name='cover';r.checked=photo?i===0:i===a.coverIndex;r.disabled=photo;img.src=im.dataUrl||im.wechatUrl||im.mdniceUrl;img.referrerPolicy='no-referrer';img.alt=`图片 ${i+1}`;text.textContent=`第 ${i+1} 张`;label.append(r,img,text);grid.append(label);r.onchange=()=>action(async()=>{const {hash,...p}=currentArticle;await call('package',{article:{...p,coverIndex:i}});await refresh();message(`已选择第 ${i+1} 张作为封面`);});});
}

const call=async(type,extra={})=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const r=await chrome.runtime.sendMessage({type,tabId:tab?.id,...extra});if(r?.error&&!(type==='status'&&typeof r.stage==='string')&&!(type==='stop'&&typeof r.stage==='string'))throw Error(r.error);return r;};
function download(name,obj){const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function refresh(){const version=++uiVersion;const {profile:p,article:a}=await call('get-settings');if(version!==uiVersion||articleLoading)return;$('setup').open=!p;if(p){$('account').value=p.accountKey;$('author').value=p.author;$('original-author').value=p.originalAuthor;$('recipient').value=p.recipient;$('original').checked=p.original;info('config-summary',[['公众号',p.accountKey],['文章作者',p.author],['原创作者',p.originalAuthor],['文字原创',p.original?'开启':'关闭'],['预览微信号',p.recipient]]);}showArticle(a);}

async function action(fn){try{log.textContent='';await fn();if(log.textContent)message(log.textContent);}catch(e){log.textContent=e.message;message(e.message);}}
$('settings').onclick=()=>action(async()=>{await call('settings',{profile:{accountKey:$('account').value,author:$('author').value,originalAuthor:$('original-author').value,recipient:$('recipient').value,original:$('original').checked}});await refresh();log.textContent='设置已保存。任务启动时会固定配置，运行中更改设置不改变收件人。';});
$('package').onchange=()=>action(async()=>{
 const f=$('package').files[0];if(!f)return;articleLoading=true;uiVersion++;pollRunning=false;showArticle(null);$('package').disabled=true;message('正在校验并加载文章包，请稍候…');
 try{if(f.size>48*1024*1024)throw Error('文章包超过 48 MB');const p=JSON.parse(await f.text());const a=await EditorialCore.article(p);if(a.type!=='newspic')EditorialEditor.prepared(a);await call('package',{article:p});articleLoading=false;await refresh();log.textContent='文章包已加载，尚未启动。点击下方绿色按钮开始。';}
 finally{articleLoading=false;$('package').disabled=false;selectMode(selectedMode);}
});
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>action(async()=>{log.textContent=JSON.stringify(await call('start',{mode:b.dataset.mode,consent:true}),null,2);});
if($('status'))$('status').onclick=()=>action(async()=>{log.textContent=JSON.stringify(await call('status'),null,2);});
$('stop').onclick=()=>action(async()=>{log.textContent=JSON.stringify(await call('stop'),null,2);});
$('report').onclick=()=>action(async()=>{const previous=$('progress').textContent;$('report').disabled=true;message('正在读取页面状态和保存提示…');try{const report=await call('inspect');download('wechat-diagnostic.json',{...report,popup:{selectedMode,message:previous}});message('完整诊断已下载，未上传、保存或发送。');}finally{$('report').disabled=false;}});
if($('received'))$('received').onclick=()=>action(async()=>{if(!confirm('确认你的微信已经收到当前这篇预览？此操作只记账，不发送。'))return;log.textContent=JSON.stringify(await call('received',{confirmed:true}),null,2);});
action(async()=>{await refresh();pollRunning=!!currentArticle;});

$('profile-import').onchange=()=>action(async()=>{const f=$('profile-import').files[0];if(!f)return;if(f.size>10000)throw Error('配置文件过大');await call('settings',{profile:JSON.parse(await f.text())});await refresh();log.textContent='已导入本机配置，未执行网站操作。';});

$('run').onclick=()=>action(async()=>{
 if(articleLoading)throw Error('文章包仍在加载，请稍候');
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.url||new URL(tab.url).origin!=='https://mp.weixin.qq.com')throw Error('请先在 Chrome 登录微信公众号后台，打开新建图文的空白编辑页，再从工具栏打开本插件执行。');
 if(!currentArticle||(currentArticle.type||'news')!==selectedMode)throw Error('所选 tab 与文章包类型不一致，请切换 tab 或加载对应文章包');
 const photo=currentArticle.type==='newspic';
 if(photo&&operation==='published'){if(approvedPlan){await call('published-start',{consent:true,expectedHash:currentArticle.hash});approvedPlan=false;pollRunning=true;renderOperation();message('正在填入修改，完成后请在公众号页面审核并提交。');}else await publishedPlan();return;}
 const state=photo?null:await call('status');
 if(state&&['preview-sent','preview-unknown','preview-pending'].includes(state.stage))throw Error('这篇文章已有发送记录，请先核对微信，插件不会重复发送。');
 const mode=photo?(await call('photo-plan')).mode:state.stage==='blocked'&&['import','cover'].includes(state.blockedAt)?'continue':state.draftId?'resume':'full';
 let approvedFirstImageUrl;
 if(currentArticle.type==='newspic'&&mode==='continue'){const recovery=await call('photo-recovery');if(recovery.needed){if(!confirm('旧版已上传第 1 张，但没有留下图片校验记录。请核对公众号页面上的首图与文章包第 1 张一致。\n\n确认后保留首图，从第 2 张继续上传，填写标题正文、保存核对并发送一次预览。')){message('已取消恢复，没有上传或发送。');return;}approvedFirstImageUrl=recovery.firstImageUrl;}}
 await call('start',{mode:photo?'auto':mode,consent:true,approvedFirstImageUrl,expectedHash:currentArticle.hash});pollRunning=true;log.textContent='已启动，正在保存草稿并核对，完成后发送预览。';
});
const stageNames={'published-edit':'正在填入已发表文章的修改','published-ready':'修改内容已填入并核对，请在网页审核后手动提交修改','draft-ready':'草稿已保存并核对；预览需扫码，请到草稿箱审核并发表','verify-saved':'正在核对已保存草稿','text':'正在核对正文及空行','uploading':'正在按顺序上传原图','metadata':'正在处理署名和原创选项','import':'正在导入正文','cover':'正在设置封面和作者','saving':'正在保存草稿','await-reload':'正在刷新核对','verified':'核对完成','preview-pending':'正在发送预览','preview-sent':'预览已发送，请查看微信','preview-unknown':'发送结果待确认，请先查看微信，勿重复发送','blocked':'流程已停止','stopped':'已停止'};
setInterval(async()=>{if(!currentArticle||!pollRunning)return;try{const epoch=uiVersion,hash=currentArticle.hash;const s=await call('status');if(!pollRunning||epoch!==uiVersion||hash!==currentArticle?.hash)return;if(stageNames[s.stage])message(stageNames[s.stage]+(s.error?'：'+s.error:''));if(['published-ready','draft-ready','blocked','preview-sent','preview-unknown','stopped'].includes(s.stage))pollRunning=false;}catch{}},2000);

$('clear').onclick=()=>action(async()=>{pollRunning=false;await call('clear-package');$('package').value='';await refresh();log.textContent='';message('');});

function renderOperation(){
 const published=operation==='published'&&selectedMode==='newspic';
 $('operation-draft').setAttribute('aria-pressed',String(!published));$('operation-published').setAttribute('aria-pressed',String(published));
 $('operation-help').textContent=published?'先查看新旧差异，确认后填入；最后由你在公众号页面提交修改。':'导入后保存并核对草稿；支持微信号预览时发送预览。';
 $('run').textContent=published?(approvedPlan?'确认差异并填入修改':'查看新旧内容差异'):'保存草稿并预览';
}
for(const [id,value] of [['operation-draft','draft'],['operation-published','published']])$(id).onclick=()=>{operation=value;approvedPlan=false;$('published-diff').replaceChildren();$('published-diff').hidden=true;renderOperation();message('');};
async function publishedPlan(){
 const plan=await call('published-plan'),root=$('published-diff');root.replaceChildren();
 for(const [label,before,after] of [['标题',plan.snapshot.title,plan.newTitle],['正文',plan.snapshot.content,plan.newContent]]){const p=document.createElement('p');p.textContent=label+(before===after?'：不变':'：'+before+' → '+after);root.append(p);}
 if(plan.strategy==='rebuild'&&plan.changes.length){const method=document.createElement('p');method.textContent=plan.rebuild?'继续中断的上传/旧图移除步骤，不重复上传已核对的新图。':'页面没有替换按钮：先上传并核对整组新图，再移除旧图。不会提交修改。';root.append(method);}
 const note=document.createElement('p');note.textContent=plan.imageProof?'将替换第 '+(plan.changes.map(i=>i+1).join('、')||'无')+' 张图片':'未找到旧包的图片校验记录。请逐张核对下方旧图和新图；本次将替换全部图片。';root.append(note);
 for(const i of plan.changes){const line=document.createElement('div'),label=document.createElement('p');label.textContent='第 '+(i+1)+' 张：旧图 → 新图';line.append(label);for(const src of [plan.snapshot.images[i],currentArticle.images[i].dataUrl]){const img=document.createElement('img');img.src=src;img.referrerPolicy='no-referrer';img.style.cssText='width:45%;max-height:180px;object-fit:contain';line.append(img);}root.append(line);}
 approvedPlan=true;root.hidden=false;renderOperation();message('请核对差异；仅填入网页，不保存、不预览、不提交修改。');
}
