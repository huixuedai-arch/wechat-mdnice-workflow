#!/usr/bin/env python3
"""Wrap an actual MDnice HTML export in a versioned article package. No network."""
import argparse,hashlib,json,re
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlparse
class Images(HTMLParser):
    def __init__(self):super().__init__();self.urls=[]
    def handle_starttag(self,tag,attrs):
        if tag=='img':self.urls.append(dict(attrs).get('src',''))
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--html',required=True);p.add_argument('--source-url',required=True);p.add_argument('--theme',default='MDnice export')
p.add_argument('--article-id',required=True);p.add_argument('--title',required=True);p.add_argument('--summary',default='');p.add_argument('--cover',type=int,default=1,help='1-based body image number');p.add_argument('--output',required=True)
a=p.parse_args();html=Path(a.html).read_text();images=Images();images.feed(html)
if urlparse(a.source_url).scheme!='https' or urlparse(a.source_url).netloc!='editor.mdnice.com':p.error('source-url 必须是实际 MDnice 页面')
if not re.fullmatch('[a-zA-Z0-9_-]{1,100}',a.article_id):p.error('article-id 只允许字母数字、横线、下划线')
if not 1<=len(a.title)<=64 or len(a.summary)>120:p.error('标题 1–64 字符，摘要最多 120 字符')
if not 1<=len(images.urls)<=50 or not 1<=a.cover<=len(images.urls):p.error('需要 1–50 张图片和有效封面序号')
if any(urlparse(u).scheme!='https' for u in images.urls):p.error('图片必须先上传到 MDnice 并获得 HTTPS 地址')
result=dict(schemaVersion=1,articleId=a.article_id,title=a.title,summary=a.summary,html=html,source=dict(kind='mdnice-rendered',url=a.source_url,theme=a.theme,htmlSha256=hashlib.sha256(html.encode()).hexdigest()),images=[dict(mdniceUrl=u) for u in images.urls],coverIndex=a.cover-1)
with Path(a.output).open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2)
print(a.output)
