import os,sys,json,subprocess,time,re,socket,shutil,hashlib,fcntl
from pathlib import Path
IMAGE='ghcr.io/nankeonlydream/sub2api@sha256:08b4ab58edc9c963c2867377d235812f4eb3b31c38f1c73ef9919a4d3d48c3c3'
REV='61ca54f205bff657028e2e758a9f103e44c24c46'
VERSION='2.10.2-creator.3'
ROOT=Path('/root/sub2api-creator-release/'+VERSION)
OVERRIDE=Path('/root/sub2api-deploy/docker-compose.creator.yml')
COMPOSE=['docker','compose','-f','/root/sub2api-deploy/docker-compose.yml','-f',str(OVERRIDE)]
def run(args):
 return subprocess.check_output(args,stderr=subprocess.STDOUT,universal_newlines=True)
def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
def env(c):return dict(v.split('=',1) for v in c['Config']['Env'])
def mounts(c):return sorted((m['Type'],m['Source'],m['Destination'],m['RW']) for m in c['Mounts'])
def log(s):print(s,flush=True)
def curl(name,path):return run(['docker','exec',name,'curl','-fsS','--max-time','10','http://127.0.0.1:8080'+path])
def assets(name):
 html=curl(name,'/creator')
 assert '<html' in html.lower(), 'Creator HTML missing'
 scripts=re.findall(r'<script[^>]+src="([^"]+)"',html)
 assert scripts, 'Frontend scripts missing'
 for src in scripts:
  js=curl(name,src)
  match=re.search(r'(?:/assets/)?CreatorStudioView-[A-Za-z0-9_-]+\.js',js)
  if match:
   path=match.group(0)
   if not path.startswith('/'):path='/assets/'+path
   chunk=curl(name,path)
   assert '1024x688' in chunk and '688x1024' in chunk, 'New 1K presets missing'
   log('CREATOR_ASSET_OK '+path+' sha256='+hashlib.sha256(chunk.encode()).hexdigest())
   return
 raise RuntimeError('Creator chunk reference missing')
def healthy():
 for _ in range(60):
  c=inspect('sub2api')
  if c['State'].get('Health',{}).get('Status')=='healthy':return c
  time.sleep(2)
 raise RuntimeError('Container failed health check')
os.umask(0o077)
assert os.geteuid()==0
assert socket.gethostname()=='iZrj92zzv39jbi7n9fz4fuZ','Wrong server'
ROOT.mkdir(parents=True,exist_ok=True)
lock=open(str(ROOT/'deploy.lock'),'w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not (ROOT/'DEPLOYED_OK').exists(),'Already deployed; inspect result'
old=inspect('sub2api')
assert old['Config']['Image']=='sub2api-local:2.10.2-creator.2','Unexpected current image'
original=OVERRIDE.read_text()
assert original.count('image: sub2api-local:2.10.2-creator.2')==1
(ROOT/'container-before.json').write_text(json.dumps(old))
(ROOT/'docker-compose.creator.before.yml').write_text(original)
log('PULL_START '+IMAGE)
log(run(['docker','pull',IMAGE]))
img=inspect(IMAGE)
assert img['Architecture']=='amd64'
assert img['Config']['Labels']['org.opencontainers.image.revision']==REV
version=run(['docker','run','--rm','--network','none','--entrypoint','/app/sub2api',IMAGE,'-version'])
assert VERSION in version and REV in version,version
log('IMAGE_VERSION_OK '+version.strip())
smoke='creator3-image-smoke'
log(run(['docker','run','-d','--name',smoke,'--network','none','-e','AUTO_SETUP=false',IMAGE]).strip())
try:
 for _ in range(20):
  try:
   assert json.loads(curl(smoke,'/health'))['status']=='ok'
   break
  except Exception:time.sleep(1)
 else:raise RuntimeError('Isolated smoke startup failed')
 assets(smoke)
finally:run(['docker','rm','-f',smoke])
log('ISOLATED_SMOKE_OK')
changed=False
try:
 OVERRIDE.write_text(original.replace('image: sub2api-local:2.10.2-creator.2','image: '+IMAGE))
 changed=True
 run(COMPOSE+['config','--quiet'])
 log(run(COMPOSE+['up','-d','--no-deps','--pull','never','sub2api']))
 new=healthy()
 assert new['Image']==img['Id'],'Wrong running image'
 assert env(new)==env(old),'Environment changed'
 assert mounts(new)==mounts(old),'Mounts changed'
 assert new['HostConfig']['PortBindings']==old['HostConfig']['PortBindings'],'Ports changed'
 assert new['HostConfig']['NetworkMode']==old['HostConfig']['NetworkMode'],'Network changed'
 v=run(['docker','exec','sub2api','/app/sub2api','-version'])
 assert VERSION in v and REV in v
 assert json.loads(curl('sub2api','/health'))['status']=='ok'
 assets('sub2api')
 result={'version':VERSION,'revision':REV,'image':IMAGE,'container_id':new['Id'],'health':'healthy','environment_mounts_ports':'preserved','database_backup':False}
 (ROOT/'DEPLOYED_OK').write_text(json.dumps(result,indent=2)+'\n')
 log('DEPLOYMENT_COMPLETE '+json.dumps(result))
except Exception:
 if changed:
  log('VALIDATION_FAILED_ROLLING_BACK')
  OVERRIDE.write_text(original)
  log(run(COMPOSE+['up','-d','--no-deps','--pull','never','sub2api']))
  healthy()
  log('ROLLBACK_OK')
 raise
