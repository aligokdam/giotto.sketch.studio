## <img src="assets/icons/icon.svg" alt="Giotto Sketch Studio logo" width="32" height="32" align="center"> Giotto Sketch Studio

Turn any photo into a live drawing reference directly in your browser.

Giotto Sketch Studio is an open-source drawing assistant that converts photographs into clean sketch references and projects them over your live camera feed — helping artists align, trace, and draw with confidence.

All processing happens locally in your browser. Your images are never uploaded or stored.

🌐 **Live Demo:** https://aligokdam.github.io/giotto.sketch.studio/

---

## Features

- 📤 Upload JPG, PNG, WEBP and HEIC images (drag & drop, file picker or paste)
- ✏️ Sketch filters: Grayscale, High Contrast, Sketch, Edge Detect, Blueprint
- 🎚️ Opacity, brightness, contrast, sharpness, edge strength, saturation and blur
- 📷 Live camera overlay (rear camera on phones)
- 🔄 Drag, pinch-to-scale, twist-to-rotate, flip, lock and double-tap reset
- 🖌️ Drawing Mode — hides everything except opacity while you trace
- ⌨️ Keyboard shortcuts on desktop (Space, R, F, arrows, Esc)
- 🌗 Light, Dark and System appearance
- 🌍 Turkish and English, plus 22 more languages for the studio
- 📱 Mobile and desktop friendly
- 🔒 Privacy-first — images never leave your device

---

## How It Works

1. Tap **Start** and upload a reference image.
2. Pick a filter and adjust the sliders until you get a clean sketch.
3. Tap **Open Camera** and allow camera access.
4. Place your paper under the camera.
5. Drag, pinch and rotate the overlay until it lines up.
6. Set the opacity and switch to **Drawing Mode**.
7. Start drawing.

---

## Supported Formats

| Format | Support |
|--------|---------|
| JPG / JPEG | ✅ All modern browsers |
| PNG | ✅ All modern browsers |
| WEBP | ✅ All modern browsers |
| HEIC / HEIF | ✅ Browsers that decode HEIC natively (Safari on iPhone, iPad and Mac). Elsewhere, convert to JPG first. |

Maximum file size: 40 MB. Large images are downscaled to 1600 px on the longest side for fast, smooth processing.

---

## Privacy

Giotto Sketch Studio processes everything entirely on your device.

- 🚫 No images are uploaded.
- 🚫 No camera frames are recorded or stored.
- 🚫 No account required.
- 🚫 No cloud processing, analytics or third-party scripts.

Only your language and appearance preferences are saved in your browser's local storage. The site is a set of static files served by GitHub Pages.

---

## Project Structure

```text
giotto.sketch.studio/
├── index.html            # Home, Privacy, Terms and the studio markup
├── assets/
│   ├── css/app.css       # All styles (light + dark tokens)
│   ├── js/i18n.js        # Language loader (JSON, English fallback)
│   ├── js/studio.js      # Upload, filters, camera overlay, drawing mode
│   ├── js/app.js         # Theme, hash router, settings sheet
│   ├── i18n/             # en.json, tr.json, …
│   └── icons/            # icon.svg, apple-touch-icon.png
├── LICENSE
└── README.md
```

No framework, no build step, no dependencies.

Routes: `#home`, `#how`, `#features`, `#faq`, `#privacy`, `#terms`, `#studio`, `#studio/edit`, `#studio/camera`. Browser back/forward moves between them and leaving the camera screen always turns the camera off.

### Adding a language

1. Copy `assets/i18n/en.json` to `assets/i18n/<code>.json` and translate the values.
2. Add `{ code: "<code>", name: "<Native name>" }` to `LANGUAGES` in `assets/js/i18n.js` (add `rtl: true` for right-to-left scripts).

Missing keys fall back to English automatically.

---

## Supported Browsers

| Browser | Support |
|---------|---------|
| Chrome | ✅ |
| Edge | ✅ |
| Safari (macOS & iOS) | ✅ |
| Firefox | ✅ |

The camera requires HTTPS (or `localhost`) and permission from the browser.

---

## Local Development

Clone the repository:

```bash
git clone https://github.com/aligokdam/giotto.sketch.studio.git
cd giotto.sketch.studio
```

Serve it with any static web server (translations are loaded with `fetch`, so opening `index.html` straight from disk won't work):

```bash
python3 -m http.server 8000
# or
npx serve
```

Then open http://localhost:8000.

To deploy, push the folder to a GitHub repository and enable GitHub Pages — no build step is required.

---

## Roadmap

- Additional sketch filters
- Grid and perspective guides
- Multi-layer references
- PWA / offline mode

---

## License

MIT License

---

Created by **Ali Gökdam**

