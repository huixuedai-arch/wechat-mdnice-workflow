// Real framework regression: DOM selection and EditorState selection may differ.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const modules=process.env.PM_MODULES||path.join(__dirname,'../node_modules');
const {build}=require(path.join(modules,'esbuild'));
const {chromium}=require('playwright');
(async()=>{
 const source=`
 import {Schema} from 'prosemirror-model';
 import {EditorState,TextSelection} from 'prosemirror-state';
 import {EditorView} from 'prosemirror-view';
 const schema=new Schema({nodes:{doc:{content:'inline*'},text:{group:'inline'},hard_break:{inline:true,group:'inline',selectable:false,parseDOM:[{tag:'br'}],toDOM:()=>['br']}}});
 function doc(text){const nodes=[];text.split('\\n').forEach((line,i)=>{if(i)nodes.push(schema.nodes.hard_break.create());if(line)nodes.push(schema.text(line));});return schema.nodes.doc.create(null,nodes);}
 let bodyView,titleView;
 window.pm={setup(title,body){bodyView?.destroy();titleView?.destroy();document.body.innerHTML='<div id="title-host"></div><div id="body-host"></div>';
  titleView=new EditorView(document.querySelector('#title-host'),{state:EditorState.create({schema,doc:doc(title)}),attributes:{'data-placeholder':'请在这里输入标题'}});
  const d=doc(body);bodyView=new EditorView(document.querySelector('#body-host'),{state:EditorState.create({schema,doc:d,selection:TextSelection.atEnd(d)})});bodyView.focus();
 },body:()=>bodyView.dom,modelBody:()=>bodyView.state.doc.textBetween(0,bodyView.state.doc.content.size,'','\\n'),modelTitle:()=>titleView.state.doc.textContent};
 `;
 const bundled=await build({stdin:{contents:source,resolveDir:modules,loader:'js'},bundle:true,write:false,format:'iife'});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent('<style>.ProseMirror{white-space:pre-wrap;min-height:30px}</style>');
  await page.addScriptTag({content:bundled.outputFiles[0].text});await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../extension/newspic-adapter.js'),'utf8')});
  let old='A'.repeat(60)+'\n\n'+'B'.repeat(55)+'\n\n'+'C'.repeat(60),next='Revised  paragraph 👇\n\n  Second paragraph\n\nLast paragraph';
  if(process.env.WECHAT_PACKAGE){const p=JSON.parse(fs.readFileSync(process.env.WECHAT_PACKAGE,'utf8'));next=p.content;}
  const collapsed=old.replace(/\n+/g,'\n');
  await page.evaluate(({collapsed,old})=>{pm.setup('Previous title',collapsed);const el=pm.body(),r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);const d=new DataTransfer();d.setData('text/plain',old);d.setData('text/html','<span>'+old.replace(/\n/g,'<br>')+'</span>');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d}));},{collapsed,old});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>pm.modelBody()),collapsed+old,'real ProseMirror reproduces stale-selection append');
  for(const text of [next,'First  line\n\n  Second line\nThird\n']){
   await page.evaluate(({text})=>{NewspicEditor.put(NewspicEditor.title(),'Revised title');NewspicEditor.pasteBody(NewspicEditor.body(),text);},{text});
   await page.waitForTimeout(150);
   assert.equal(await page.evaluate(()=>pm.modelTitle()),'Revised title');
   if(await page.evaluate(()=>pm.modelBody())!==text)console.log(await page.evaluate(()=>({html:pm.body().innerHTML,model:pm.modelBody(),read:NewspicEditor.text(pm.body())})));
   assert.equal(await page.evaluate(()=>pm.modelBody()),text,'framework state must match, not just DOM');
   assert.equal(await page.evaluate(()=>NewspicEditor.text(NewspicEditor.body())),text,'DOM readback must match including whitespace');
  }
  console.log('PASS real ProseMirror reproduces old append; native replacement updates model and DOM exactly, including blank lines, spaces, trailing newline and emoji');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
