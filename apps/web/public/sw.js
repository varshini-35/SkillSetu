const CACHE = 'skillsetu-shell-v3';

const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/skillsetu-app.svg',
  '/skillsetu-logo.png',
];

const STATIC_PATH =
  /^\/assets\/[^/]+\.(?:js|css|svg|png|webp|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('skillsetu-shell-') &&
                key !== CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        return (await caches.match('/')) || Response.error();
      })
    );
    return;
  }

  const isKnownStaticFile =
    STATIC_PATH.test(url.pathname) ||
    [
      '/manifest.webmanifest',
      '/icons/skillsetu-app.svg',
      '/skillsetu-logo.png',
    ].includes(url.pathname);

  if (!isKnownStaticFile) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);

        if (response.ok && response.type === 'basic') {
          const responseForCache = response.clone();

          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) =>
                cache.put(request, responseForCache)
              )
              .catch((error) => {
                console.error(
                  'SkillSetu cache update failed:',
                  error
                );
              })
          );
        }

        return response;
      } catch (error) {
        return (
          (await caches.match(request)) ||
          Response.error()
        );
      }
    })()
  );
});
