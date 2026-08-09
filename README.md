# Giotto Sketch Studio

Turn any photo into a live drawing reference directly in your browser.

Giotto Sketch Studio is an open-source drawing assistant that converts photographs into clean sketch references and projects them over your live camera feed — helping artists align, trace, and draw with confidence.

All processing happens locally in your browser. Your images are never uploaded or stored.

🌐 **Live Demo Link :** https://aligokdam.github.io/giotto.sketch.studio/

---

## Features

- 📤 Upload JPG, PNG, WEBP and HEIC images
- 🎚️ Adjustable opacity
- ✏️ Edge detection & sketch filters
- 💡 Brightness and sharpness controls
- 📷 Live camera overlay
- 🔄 Drag, rotate and scale the reference image
- 🖌️ Drawing Mode for tracing
- 📱 Mobile and desktop friendly
- 🔒 Privacy-first — images never leave your device

---

## How It Works

1. Upload a reference image.
2. Adjust the filters until you get a clean sketch.
3. Open the camera.
4. Place your paper under the camera.
5. Move, rotate and resize the overlay.
6. Adjust opacity.
7. Start drawing.

---

## Project Structure

```text
giotto.sketch.studio/
├── index.html
└── README.md
```

---

## Supported Browsers

| Browser | Support |
|----------|----------|
| Chrome | ✅ |
| Edge | ✅ |
| Safari | ✅ |
| Firefox | ✅ |

For the best experience, use the latest version of your browser and allow camera access when prompted.

---

## Privacy

Giotto Sketch Studio processes everything entirely on your device.

- 🚫 No images are uploaded.
- 🚫 No camera frames are stored.
- 🚫 No account required.
- 🚫 No cloud processing.

Your photos remain yours.

---

## Local Development

Clone the repository:

```bash
git clone https://github.com/aligokdam/giotto.sketch.studio.git
```

Open the project folder:

```bash
cd giotto.sketch.studio
```

Serve it using any static web server.

Example with Python:

```bash
python -m http.server
```

or with Node.js:

```bash
npx serve
```

Open your browser:

```
http://localhost:8000
```

---

## Technology

- HTML5
- CSS3
- JavaScript
- Canvas API
- MediaDevices API
- File API

Everything runs entirely in the browser.

---

## Roadmap

- Additional sketch filters
- Custom color overlays
- Perspective guides
- Grid mode
- Multi-layer references
- PWA support
- Offline mode

---

## License

MIT License

---

Created by **Ali Gökdam**
