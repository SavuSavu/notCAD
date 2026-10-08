"""Record source fingerprints and links for review; never silently changes parity targets."""
import concurrent.futures, datetime, hashlib, json, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=set()
 def handle_starttag(self,tag,attrs):
  if tag=='a':
   href=dict(attrs).get('href','')
   if '.htm' in href:self.links.add(href)
def capture(url):
 with urllib.request.urlopen(url,timeout=30) as response:
  data=response.read();parser=Links();parser.feed(data.decode())
  return {'url':url,'sha256':hashlib.sha256(data).hexdigest(),'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'lastModified':response.headers.get('Last-Modified'),'linkedDocumentation':sorted(set(urljoin(url,x) for x in parser.links if '/Content/' in urljoin(url,x)))}
urls=sorted({row['source'] for row in json.loads(Path('docs/parity.json').read_text())['rows']} | {'https://cad.onshape.com/help/Content/Sketch/sketch_tools.htm','https://cad.onshape.com/help/Content/PartStudio/feature_tools.htm','https://cad.onshape.com/help/Content/Assembly/mates.htm'})
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 snapshots=list(pool.map(capture,urls))
Path('docs/baseline-sources.json').write_text(json.dumps({'targetDate':'2026-10-09','auditStatus':'pending','sources':snapshots},indent=2)+'\n')
