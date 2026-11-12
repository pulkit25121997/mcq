# Orbit Qbank: web app + Android app

Orbit is a private, on-device study app for importing HTML MCQ exports and practising them together. It includes custom modules, tutor and exam modes, bookmarks, a mistake notebook, notes, session review and progress backups.

The website and Android package contain **only app code**. Import your own HTML files in the app; no question banks or progress are uploaded to a server. Images and video links embedded in the original exports may still require internet or original-platform access.

## Use the web app

Serve the `www/` folder from any HTTPS static host. For GitHub Pages:

1. Put the contents of this folder in a repository.
2. Push to its `main` branch.
3. In repository **Settings → Pages**, select **GitHub Actions** as the source.
4. The `Deploy Orbit web app` workflow publishes `www/`; its deployment URL appears in the workflow run.

On iPad or iPhone, open that HTTPS URL in Safari, choose **Share → Add to Home Screen**, then open Orbit from the Home Screen. Tap **Import banks → Choose HTML files** and select the exports from Files, Downloads or iCloud Drive. Keep the app open while large banks import. The 91 MB Cerebellum export is read in chunks.

The app stores question banks, bookmarks, notes and sessions in browser IndexedDB on that device. Storage is not shared between Safari and the Android app or between devices. Export a progress backup before clearing site data, uninstalling or switching devices; import the same bank files before restoring.

## Android

Capacitor wraps the same `www/` app in an Android WebView. The `Build Android APK` workflow installs the Android SDK in GitHub Actions and builds a debug APK; downloads are available under the run's **Artifacts**. When triggered by a published GitHub Release, the workflow also attaches `app-debug.apk` to that release.

To build locally, install Node.js 22, JDK 21 and Android SDK Platform 35 / Build Tools, then run:

```sh
npm install
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Android may ask you to approve installation from the browser or file manager.

## Local web development and tests

Serve `www/` over HTTP (for example `python3 -m http.server 8780 --directory www`), then open `http://localhost:8780`. To run the browser checks, install Playwright's Chromium browser and use:

```sh
npm install
npx playwright install chromium
QBANK_DIR=/path/to/your/html-exports npm test
```

`QBANK_DIR=/path/to/your/html-exports npm run test:full-import` also imports all seven source exports, including the large Cerebellum file. Set `FILES` to a comma-separated list to choose other filenames.

## Supported exports

The importer reads the embedded `TESTS_LIST` JSON from HTML without executing imported scripts. It sanitizes rich text, keeps source/module attribution, deduplicates identical questions within a platform, and keeps different platforms separate. Known exports include Marrow, Core BTR and Cerebellum. Other HTML exports work if they use the same embedded structure.

## Privacy and limitations

- All imported content and study progress remain in local browser storage; there is no account, analytics, sync or question-bank upload.
- Browser storage can be cleared by the user or browser. Export progress backups regularly.
- The app does not bundle, publish, or redistribute the original question banks.
- Original remote media can be unavailable or access restricted. The app does not bypass platform protections.
- This is a personal study tool, not medical advice and not affiliated with any source platform.
