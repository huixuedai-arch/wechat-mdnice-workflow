/* This function is injected only when the user clicks capture on an MDnice tab. */
globalThis.captureMdnice=()=>{
 if(location.origin!=='https://editor.mdnice.com')throw Error('请在 MDnice 已排版文章页执行');
 const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const candidates=[...document.querySelectorAll('#nice,[data-tool="mdnice编辑器"]')].filter(visible);
 const roots=candidates.filter(e=>!candidates.some(x=>x!==e&&x.contains(e)));
 if(roots.length!==1)throw Error('无法唯一定位 MDnice 排版预览；未生成文章包');
 const root=roots[0],copy=root.cloneNode(true),original=[root,...root.querySelectorAll('*')],clones=[copy,...copy.querySelectorAll('*')];
 const props=['color','background-color','font-family','font-size','font-style','font-weight','line-height','letter-spacing','text-align','text-indent','text-decoration','white-space','word-break','overflow-wrap','display','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','border-top','border-right','border-bottom','border-left','border-radius','max-width','box-sizing'];
 original.forEach((e,i)=>{const c=getComputedStyle(e);for(const p of props)clones[i].style.setProperty(p,c.getPropertyValue(p));if(e.tagName==='IMG'){clones[i].src=e.currentSrc||e.src;clones[i].style.maxWidth='100%';clones[i].style.height='auto';}});
 copy.setAttribute('data-tool','mdnice编辑器');
 return {html:copy.outerHTML,url:location.href,images:[...copy.querySelectorAll('img')].map(i=>({mdniceUrl:i.src})),theme:'MDnice 当前主题'};
};
