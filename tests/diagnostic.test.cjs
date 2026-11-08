const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {
  const page = await browser.newPage(); await page.route('**/*', r => r.abort());
  await page.setContent(`<!doctype html><style>.menu{display:none}.menu.open{display:block}.image-selector__bottom-list-item{width:40px;height:40px;background-image:url('https://mmbiz.qpic.cn/mmbiz_png/private-image/640?token=SECRET')}input[type=file]{display:none}</style>
   <div class="tpl_dropdown_menu"><input type="file" accept="image/*"></div>
   <div class="image-selector"><div class="image-selector__bottom"><div class="image-selector__bottom-list-item"></div><button class="image-selector__bottom-add">添加图片</button></div></div>
   <div id="add-menu" class="menu pop-opr"><div class="weui-desktop-upload pop-opr__item">上传图片<div class="js_upload_btn_container"><div><input type="file" multiple accept="image/png"></div></div></div></div>
   <div id="replace-menu" class="menu pop-opr"><div class="weui-desktop-upload pop-opr__item">替换图片<div class="js_upload_btn_container"><div><input type="file" multiple accept="image/png"></div></div></div></div>
   <div class="ProseMirror" contenteditable="true" data-placeholder="请在这里输入标题">PRIVATE TITLE</div><div class="ProseMirror" contenteditable="true"><p>PRIVATE PROSE</p></div>
   <input value="PRIVATE INPUT"><button id="save">保存为草稿</button><button id="send">发送</button><button id="publish">发表</button>`);
  await page.evaluate(() => {
   window.counts = {add:0, upload:0, save:0, send:0, publish:0};
   document.querySelector('.image-selector__bottom-add').onclick = () => {counts.add++;document.querySelector('#add-menu').classList.add('open');};
   for(const e of document.querySelectorAll('input[type=file]')) e.onchange=()=>counts.upload++;
   for(const k of ['save','send','publish']) document.getElementById(k).onclick=()=>counts[k]++;
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../extension/diagnostic.js'),'utf8')});
  const report=await page.evaluate(()=>WechatDiagnostic({expandAddMenu:true}));
  assert.equal(report.action,'opened-add-menu-once');assert.equal(report.phases.length,5);
  assert.equal(report.phases[0].inputs.length,3);assert.equal(report.phases[0].gallery.length,1);
  const files=report.phases.at(-1).inputs;
  const add=files.find(f=>f.ancestors.some(n=>n.id==='add-menu'));
  const replace=files.find(f=>f.ancestors.some(n=>n.id==='replace-menu'));
  assert.equal(add.ancestors.find(n=>n.id==='add-menu').visible,true);
  assert.equal(replace.ancestors.find(n=>n.id==='replace-menu').visible,false);
  assert(add.ancestors.some(n=>n.label==='上传图片'));
  assert(replace.ancestors.some(n=>n.label==='替换图片'));
  assert.equal(report.phases[0].gallery[0].backgroundImages[0],'wechat-image-1');
  assert.equal(report.phases.at(-1).gallery[0].backgroundImages[0],'wechat-image-1');
  assert(report.timeline.some(e=>e.attribute==='class'));
  const json=JSON.stringify(report);for(const sensitive of ['PRIVATE TITLE','PRIVATE PROSE','PRIVATE INPUT','private-image','SECRET','https://'])assert(!json.includes(sensitive),sensitive);
  assert.deepEqual(await page.evaluate(()=>counts),{add:1,upload:0,save:0,send:0,publish:0});
  const again=await page.evaluate(()=>WechatDiagnostic({expandAddMenu:true}));
  assert.equal(again.action,'not-opened: upload menu already visible');assert.equal(await page.evaluate(()=>counts.add),1);
  await page.evaluate(()=>document.querySelector('#add-menu').classList.remove('open'));
  await page.evaluate(()=>WechatDiagnostic());assert.equal(await page.evaluate(()=>counts.add),1);
  console.log('PASS: two identical upload controls; before/after visibility and menu labels; stable image identity; no upload/save/send/publish; repeated capture does not toggle menu; prose/values/URLs omitted');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
