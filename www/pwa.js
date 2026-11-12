"use strict";
// Offline support for the hosted web app. The native Android app already ships its files.
if ("serviceWorker" in navigator && location.protocol === "https:" && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register("sw.js").catch(error => console.warn("Offline mode unavailable:", error));
}
