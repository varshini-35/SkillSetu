const CACHE='skillsetu-shell-v2';
const SHELL=['/','/manifest.webmanifest','/icons/skillsetu-app.svg','/skillsetu-logo.png'];
const STATIC_PATH=/^\/assets\/[^/]+\.(?:js|css|svg|png|webp|woff2?)$/i;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('skillsetu-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(async()=>await caches.match('/')||Response.error()));return;
 }
 if(!STATIC_PATH.test(url.pathname)&&!['/manifest.webmanifest','/icons/skillsetu-app.svg','/skillsetu-logo.png'].includes(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{if(response.ok&&response.type==='basic')void caches.open(CACHE).then(cache=>cache.put(request,response.clone()));return response}).catch(async()=>await caches.match(request)||Response.error()));
});
