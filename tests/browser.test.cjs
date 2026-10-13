/* All browser traffic is restricted to a local fixture. No real WeChat requests. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const ext=path.join(__dirname,'../extension');
const adapter=fs.readFileSync(path.join(ext,'editor-adapter.js'),'utf8'),preflight=fs.readFileSync(path.join(ext,'preflight.js'),'utf8');
const runner=fs.readFileSync(path.join(ext,'runner.js'),'utf8').replace("location.origin!=='https://mp.weixin.qq.com'","location.hostname!=='127.0.0.1'");
async function scenario(browser,server,opts){
 const count=opts.count||3,id=opts.id||'demo-a',profile={accountKey:'demo-account',author:opts.author||'Alice',originalAuthor:opts.originalAuthor||opts.author||'Alice',recipient:opts.recipient||'reader_a',original:opts.original!==false};
 const images=Array.from({length:count},(_,i)=>({mdniceUrl:`https://images.example.org/${id}/${i}.png`}));
 const html=`<section data-tool="mdnice编辑器"><h2 style="font-size:22px;font-weight:700">Example heading</h2><p style="font-size:16px;line-height:28px">Article ${id} with independent content.</p><blockquote><p style="line-height:28px">A quoted example.</p></blockquote>${images.map(x=>`<figure><img src="${x.mdniceUrl}" style="max-width:100%"></figure>`).join('')}</section>`;
 const article={title:'Test article '+id,summary:'Summary '+id,html,source:{kind:'mdnice-rendered'},images,coverIndex:count-1};
 let state={stage:'import',article,profile,mode:'full',events:[],metadataRequired:true},saved=null,loads=0,counts={save:0,send:0,paste:0,public:0};
 const page=await browser.newPage();await page.route('https://**',r=>r.abort());
 const hosted=i=>`https://mmbiz.qpic.cn/mmbiz_png/${id}-${i}/640?wx_fmt=png`;
 if(opts.mode){saved={title:article.title,html:html.replaceAll(/https:\/\/images.example.org\/[^\"]+\/(\d+)\.png/g,(_,i)=>hosted(Number(i))),author:opts.mode==='check-only'?profile.author:'Previous',summary:article.summary,cover:`url("${hosted(count-1)}")`,original:{enabled:opts.mode==='check-only'?profile.original:false,author:opts.mode==='check-only'?profile.originalAuthor:''}};state.stage=opts.mode;state.mode=opts.mode;state.draftId='fixture-draft';state.metadataOnly=opts.mode==='metadata';}

 await page.exposeFunction('fixtureMessage',async m=>{
  if(m.type==='load')return structuredClone(state);
  if(m.type==='update'){if(m.patch.stage==='preview-pending'&&counts.send)throw Error('duplicate');Object.assign(state,m.patch);state.events.push(m.note);return {ok:true};}
  if(m.type==='reload'){setTimeout(()=>page.reload().catch(()=>{}),30);return {ok:true};}
  throw Error('unknown '+m.type);
 });
 await page.exposeFunction('fixtureLoad',()=>{loads++;return {saved,article,profile,hosted:images.map((_,i)=>hosted(i)),opts};});
 await page.exposeFunction('fixtureSave',data=>{saved=data;counts.save++;});
 await page.exposeFunction('fixtureCount',name=>{counts[name]++;});
 await page.addInitScript(({adapter,preflight,runner})=>{
  window.chrome={runtime:{sendMessage:m=>window.fixtureMessage(m)}};
  document.addEventListener('DOMContentLoaded',async()=>{
   const f=await fixtureLoad();const dialog=()=>{const d=document.createElement('div');d.setAttribute('role','dialog');document.body.append(d);return d;};
   document.body.innerHTML='<div data-placeholder="请在这里输入标题" contenteditable="true"></div><input placeholder="请输入作者" id="author"><textarea id="js_description"></textarea><div class="rich_media_content"><div class="ProseMirror" contenteditable="true"></div></div><div id="js_cover_area"><div id="js_cover_null"><a class="js_selectCoverFromContent">从正文选择</a></div><div class="js_cover_preview_new" style="width:80px;height:40px"></div></div><button id="original">原创</button><button id="save">保存为草稿</button><button id="preview">预览</button><button id="publish">发表</button><div class="weui-desktop-toast"></div>';
   const ed=document.querySelector('.ProseMirror'),title=document.querySelector('[data-placeholder]'),author=document.querySelector('#author'),summary=document.querySelector('#js_description'),cover=document.querySelector('.js_cover_preview_new');
   window.originalData=f.saved?.original||{enabled:false,author:''};if(f.saved&&f.opts.corruptOriginal)window.originalData.enabled=false;
   if(f.saved){title.textContent=f.saved.title;ed.innerHTML=f.saved.html;author.value=f.saved.author;summary.value=f.saved.summary;cover.style.backgroundImage=f.saved.cover;if(f.opts.corruptReload)ed.querySelector('p').textContent='Unexpected changed content';}
   else if(f.opts.nonempty){title.textContent='Other draft';ed.textContent='Do not overwrite this';}
   else ed.innerHTML='<span class="ProseMirror-widget" contenteditable="false">从这里开始写正文</span>';
   document.querySelector('#publish').onclick=()=>fixtureCount('public');
   ed.addEventListener('paste',e=>{e.preventDefault();fixtureCount('paste');const content=e.clipboardData.getData('text/html');setTimeout(()=>{ed.innerHTML=content;setTimeout(()=>ed.querySelectorAll('img').forEach((img,i)=>{img.src=f.hosted[i];img.dataset.src=f.hosted[i]}),80)},80);});
   document.querySelector('#original').onclick=()=>{const d=dialog();d.innerHTML='<h3>原创</h3><p>声明类型</p><label><input type="radio" name="kind" id="yes"><span>文字原创</span></label><label><input type="radio" name="kind" id="no"><span>无需声明</span></label><input placeholder="请输入作者"><label><input type="checkbox">我已阅读并同意</label><button>确定</button><button>取消</button>';
    d.querySelector(originalData.enabled?'#yes':'#no').checked=true;d.querySelector('[placeholder]').value=originalData.author;
    d.querySelectorAll('button')[0].onclick=()=>{originalData={enabled:d.querySelector('#yes').checked,author:d.querySelector('[placeholder]').value};d.remove()};d.querySelectorAll('button')[1].onclick=()=>d.remove();};
   document.querySelector('.js_selectCoverFromContent').onclick=()=>{const d=dialog();d.textContent='选择图片 从正文选择';let chosen;const next=document.createElement('button');next.textContent='下一步';next.disabled=true;d.append(next);
    f.hosted.forEach(url=>{const tile=document.createElement('div');tile.style.cssText=`width:40px;height:40px;background-image:url("${url}")`;tile.onclick=()=>{chosen=url;next.disabled=false};d.append(tile)});
    next.onclick=()=>{d.remove();const crop=dialog();crop.innerHTML='<h3>编辑封面</h3><div class="cover-edit-new"><img class="crop-img"></div><button>确认</button>';crop.querySelector('img').src=chosen;crop.querySelector('button').onclick=()=>{cover.style.backgroundImage=`url("${chosen}")`;crop.remove()};};};
   document.querySelector('#save').onclick=async()=>{await fixtureSave({title:title.textContent,html:ed.innerHTML,author:author.value,summary:summary.value,cover:cover.style.backgroundImage,original:originalData});history.replaceState(null,'','?appmsgid=fixture-draft');if(f.opts.historyOnly){const t=document.createElement('table');t.innerHTML='<tr><td>12:00:01 手动保存</td></tr>';document.body.append(t);}else{const t=document.createElement('div');t.className='weui-desktop-toast';t.textContent='保存成功';document.body.append(t);t.remove();}};
   document.querySelector('#preview').onclick=()=>{const d=dialog();d.innerHTML='<h3>预览</h3><a id="optimize">一键排版</a><label><input type="radio" name="preview" checked>扫码预览</label><label><input type="radio" name="preview"><span>通过公众号列表预览</span></label>';d.querySelector('#optimize').onclick=()=>fixtureCount('public');
    d.querySelectorAll('input')[1].onchange=()=>{d.remove();const next=dialog();next.textContent='微信号';const input=document.createElement('input'),b=document.createElement('button');b.textContent='发送';b.disabled=true;input.oninput=()=>setTimeout(()=>b.disabled=false,50);b.onclick=async()=>{if(input.value!==f.profile.recipient)throw Error('wrong recipient');await fixtureCount('send');next.remove();const tip=document.createElement('div');tip.className='weui-desktop-toast';tip.textContent='发送成功';document.body.append(tip);tip.remove();};next.append(input,b);};};
   (0,eval)(preflight);(0,eval)(adapter);(0,eval)(runner);
  });
 },{adapter,preflight,runner});
 await page.goto('http://127.0.0.1:'+server.address().port+(opts.mode?'/?appmsgid=fixture-draft':''));
 const end=Date.now()+25000;while(Date.now()<end&&!['preview-sent','blocked','metadata-saved','checked'].includes(state.stage))await new Promise(r=>setTimeout(r,80));
 try{
  if(opts.mode){assert.equal(state.stage,opts.mode==='metadata'?'metadata-saved':'checked',state.error);assert.equal(counts.send,0);assert.equal(counts.save,opts.mode==='metadata'?1:0);assert.equal(counts.paste,0);assert.equal(saved.author,profile.author);if(profile.original)assert.equal(saved.original.author,profile.originalAuthor);}
  else if(opts.nonempty){assert.equal(state.stage,'blocked');assert.deepEqual(counts,{save:0,send:0,paste:0,public:0});}
  else if(opts.corruptReload||opts.corruptOriginal){assert.equal(state.stage,'blocked');assert.equal(counts.save,1);assert.equal(counts.send,0);}
  else{assert.equal(state.stage,'preview-sent',JSON.stringify({error:state.error,details:state.details,stage:state.stage}));assert.deepEqual(counts,{save:1,send:1,paste:1,public:0});assert(loads>=2,'must perform a real local page reload');assert.equal(saved.author,profile.author);assert.equal(saved.original.enabled,profile.original);if(profile.original)assert.equal(saved.original.author,profile.originalAuthor);assert(saved.cover.includes(id+'-'+(count-1)));}
  console.log('PASS browser',JSON.stringify(opts),counts,'page loads',loads);
 }finally{await page.close();}
}
(async()=>{const server=http.createServer((q,r)=>r.end('<!doctype html><html><body></body></html>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const options={headless:true};if(process.env.CHROME_PATH)options.executablePath=process.env.CHROME_PATH;const browser=await chromium.launch(options);try{
 const securityPage=await browser.newPage();await securityPage.route('https://**',r=>r.abort());await securityPage.goto('http://127.0.0.1:'+server.address().port);await securityPage.setContent('<section id="nice"><h2>Demo</h2><p style="line-height:28px">A local MDnice fixture</p><img src="https://images.example.org/demo.png"></section>');await securityPage.addScriptTag({content:adapter});const capture=fs.readFileSync(path.join(ext,'capture.js'),'utf8').replace("location.origin!=='https://editor.mdnice.com'","location.hostname!=='127.0.0.1'");await securityPage.addScriptTag({content:capture});
 const captureResult=await securityPage.evaluate(()=>{const c=captureMdnice();let rejected=0;for(const bad of ['<script>alert(1)</script>','<img src="https://example.org/x" onerror="alert(1)">','<p style="background:url(https://example.org)">bad</p>','<a href="javascript:alert(1)">bad</a>']){try{EditorialEditor.source({source:{kind:'mdnice-rendered'},html:bad});}catch{rejected++;}}return {count:c.images.length,inline:c.html.includes('line-height: 28px'),rejected};});assert.deepEqual(captureResult,{count:1,inline:true,rejected:4});await securityPage.close();console.log('PASS MDnice computed-style export and active-content rejection');
 await scenario(browser,server,{id:'first',count:1,author:'Alice',recipient:'reader_a'});
 await scenario(browser,server,{id:'second',count:8,author:'李明',recipient:'reader_b',historyOnly:true});
 await scenario(browser,server,{id:'third',count:3,author:'Writer',originalAuthor:'Creator',recipient:'reader_c',original:false});
 await scenario(browser,server,{id:'separate',count:2,author:'Writer',originalAuthor:'Creator',recipient:'reader_d'});
 await scenario(browser,server,{id:'settings-only',count:2,mode:'metadata'});
 await scenario(browser,server,{id:'check-only',count:2,mode:'check-only'});
 await scenario(browser,server,{id:'original-fails',count:1,corruptOriginal:true});
 await scenario(browser,server,{id:'changed',count:2,corruptReload:true});
 await scenario(browser,server,{id:'protect',nonempty:true});
 }finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1});
