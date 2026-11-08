#!/usr/bin/env python3
"""Package original PNG/JPG files and exact plain text; does not upload or publish."""
import argparse,base64,hashlib,json,re
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--folder',required=True,help='Folder containing 标题.txt, 正文.txt, images/')
p.add_argument('--article-id',required=True)
p.add_argument('--output',required=True)
a=p.parse_args();r=Path(a.folder)
if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',a.article_id):p.error('Invalid article ID')
title=(r/'标题.txt').read_text(encoding='utf-8-sig').rstrip('\r\n')
# read_bytes/decode preserves every newline and space, including CRLF.
content=(r/'正文.txt').read_bytes().decode('utf-8-sig')
if not title or len(title)>64:p.error('Title must be 1–64 characters; actual platform limit is checked before upload')
if '\r' in content:p.error('正文含 CRLF/CR；请确认转换为 LF 后再打包，不自动改正文')
paths=sorted((r/'images').glob('*'),key=lambda f:[int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)',f.name)])
paths=[f for f in paths if f.is_file() and f.suffix.lower() in ('.png','.jpg','.jpeg')]
if not 1<=len(paths)<=20:p.error('Expected 1–20 images')
images=[];total=0
for f in paths:
 b=f.read_bytes();total+=len(b)
 if len(b)>10*1024*1024 or total>32*1024*1024:p.error('Image size limit exceeded')
 mime='image/png' if b.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if b.startswith(b'\xff\xd8\xff') else None
 if not mime:p.error('Not a PNG/JPG: '+f.name)
 images.append(dict(name=f.name,dataUrl='data:'+mime+';base64,'+base64.b64encode(b).decode(),sha256=hashlib.sha256(b).hexdigest()))
out=dict(schemaVersion=2,type='newspic',articleId=a.article_id,title=title,content=content,images=images)
with Path(a.output).open('x',encoding='utf-8') as f:json.dump(out,f,ensure_ascii=False,separators=(',',':'))
print(json.dumps(dict(path=a.output,title=title,titleChars=len(title),bodyChars=len(content),images=len(images),bytes=total),ensure_ascii=False))
