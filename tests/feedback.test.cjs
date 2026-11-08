const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try {
  const page=await browser.newPage();
  await page.setContent('<div id="old">保存成功</div><div id="hidden" style="display:none">保存成功</div><div contenteditable="true">保存错误，请备份</div>');
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../extension/feedback.js'),'utf8')});
  await page.evaluate(()=>{window.signal=WechatFeedback.observe(/保存|备份/);document.body.append(document.createElement('hr'));});
  assert.equal(await page.evaluate(()=>signal.read()),'','unrelated mutation cannot reuse stale save success or editor content');
  await page.evaluate(()=>document.querySelector('#old').remove());
  assert.equal(await page.evaluate(()=>signal.read()),'','removing old success must not acknowledge new save');
  await page.evaluate(()=>{const tip=document.createElement('section');tip.innerHTML='<span>保存出现错误，请注意备份内容</span>';document.body.append(tip);tip.remove();});
  assert.match(await page.evaluate(()=>signal.read()),/保存出现错误，请注意备份内容/,'unknown nested transient banner is retained');
  assert(await page.evaluate(()=>WechatFeedback.failure.test(signal.read())));
  await page.evaluate(()=>{signal.close();signal=WechatFeedback.observe(/保存/);document.querySelector('#hidden').style.display='block';});
  assert.equal(await page.evaluate(()=>signal.read()),'保存成功','hidden-to-visible new feedback captured');
  await page.evaluate(()=>{signal.close();signal=WechatFeedback.observe(/保存/);document.querySelector('#hidden').firstChild.data='保存失败，请保留备份';});
  assert.match(await page.evaluate(()=>signal.read()),/保存失败/,'text-node update captured');
  assert(await page.evaluate(()=>JSON.stringify(signal.evidence()).includes('保存失败')));
  console.log('PASS stale feedback isolation, transient generic/nested errors, visibility and text changes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
