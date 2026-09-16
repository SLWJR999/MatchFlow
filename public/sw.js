// MatchFlow — service worker minimal.
// La logique de réception des notifications push (event 'push') sera
// ajoutée avec la configuration VAPID, à une étape suivante.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});