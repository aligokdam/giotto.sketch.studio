/* Giotto Sketch Studio: studio (upload -> adjust -> camera overlay -> drawing mode)
   The image pipeline, overlay gestures and shortcuts are the original Giotto
   implementation. Screen changes go through window.GiottoStudio.show(), driven
   by the router in app.js, so browser back/forward works between screens. */
(function(){
  "use strict";

  /* ============================= STATE ============================= */
  const state = {
    sourceCanvas: null,      // original uploaded image, capped resolution
    bakedCanvas: null,       // processed pixels (sharpen/edge-strength/preset effect)
    filter: "normal",        // normal | grayscale | highcontrast | sketch | edgedetect | blueprint
    adj: { opacity:100, brightness:100, contrast:100, sharpness:0, edge:0, saturation:100, blur:0 },
    overlay: { x:0, y:0, scale:1, rotation:0, flipH:1, flipV:1, locked:false },
    bakePending:false,
    stream:null
  };
  const DEFAULT_ADJ = { opacity:100, brightness:100, contrast:100, sharpness:0, edge:0, saturation:100, blur:0 };

  const MAX_DIM = 1600;
  const MAX_SIZE = 40 * 1024 * 1024;

  const t = (key)=>window.GiottoI18n.t(key);
  const nav = (path, opts)=>window.GiottoRouter.go(path, opts);

  /* ============================= DOM ============================= */
  const $ = (id)=>document.getElementById(id);
  const screens = { upload:$("screen-upload"), editor:$("screen-editor"), camera:$("screen-camera") };
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const toast = $("toast");
  const editCanvas = $("editCanvas");
  const editCtx = editCanvas.getContext("2d");
  const overlayImg = $("overlayImg");
  const overlayWrap = $("overlayWrap");
  const cameraVideo = $("cameraVideo");
  const drawUI = $("drawUI");
  const camStack = $("camStack");
  const camTop = $("camTop");
  const kbdHint = $("kbdHint");

  /* ============================= UTIL ============================= */
  function showToast(msg, ms=3200){
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toast.classList.remove("show"), ms);
  }

  let currentScreen = "upload";
  function setScreen(name){
    currentScreen = name;
    Object.keys(screens).forEach(k=>screens[k].classList.toggle("active", k === name));
  }
  const isActive = (name)=>currentScreen === name && !$("app").hidden;

  function clamp(v,min,max){return Math.min(max, Math.max(min,v));}

  /* ============================= UPLOAD HANDLING ============================= */
  dropzone.addEventListener("click", ()=>fileInput.click());
  dropzone.addEventListener("keydown", (e)=>{ if(e.target === dropzone && (e.key==="Enter" || e.key===" ")){ e.preventDefault(); fileInput.click(); } });

  ["dragenter","dragover"].forEach(evt=>{
    dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); dropzone.classList.add("drag-over"); });
  });
  ["dragleave","drop"].forEach(evt=>{
    dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); dropzone.classList.remove("drag-over"); });
  });
  dropzone.addEventListener("drop", (e)=>{
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) handleFile(f);
  });

  fileInput.addEventListener("change", ()=>{
    const f = fileInput.files[0];
    if(f) handleFile(f);
    fileInput.value = "";
  });

  window.addEventListener("paste", (e)=>{
    if(!isActive("upload")) return;
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(const it of items){
      if(it.type && it.type.startsWith("image/")){
        const f = it.getAsFile();
        if(f) handleFile(f);
        break;
      }
    }
  });

  function looksLikeImage(file){
    if(file.type && file.type.startsWith("image/")) return true;
    return /\.(png|jpe?g|webp|heic|heif|gif|bmp|avif)$/i.test(file.name||"");
  }

  async function handleFile(file){
    if(!looksLikeImage(file)){
      showToast(t("errUnsupported"));
      return;
    }
    if(file.size > MAX_SIZE){
      showToast(t("errTooLarge"));
      return;
    }

    let source = null;
    // Primary path: createImageBitmap — broadest format/orientation support across engines.
    if(typeof createImageBitmap === "function"){
      try{
        source = await createImageBitmap(file, { imageOrientation: "from-image" });
      }catch(e1){
        try{ source = await createImageBitmap(file); }catch(e2){ source = null; }
      }
    }
    // Fallback path: classic <img> decode via object URL (Safari decodes HEIC here).
    if(!source){
      try{ source = await loadViaImageElement(file); }
      catch(e3){
        showToast(t("errCantRead"));
        return;
      }
    }

    try{
      loadImageIntoState(source);
    }catch(e4){
      showToast(t("errCantRead"));
      return;
    }
    nav("studio/edit");
  }

  function loadViaImageElement(file){
    return new Promise((resolve, reject)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = ()=>{ resolve(img); };
      img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
      img._objectUrl = url;
      img.src = url;
    });
  }

  function loadImageIntoState(source){
    // works for both ImageBitmap (width/height) and HTMLImageElement (naturalWidth/naturalHeight)
    let w = source.naturalWidth || source.width;
    let h = source.naturalHeight || source.height;
    if(!w || !h) throw new Error("invalid image dimensions");
    const scale = Math.min(1, MAX_DIM / Math.max(w,h));
    w = Math.round(w*scale); h = Math.round(h*scale);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(source, 0, 0, w, h);
    if(typeof source.close === "function") source.close();
    if(source._objectUrl) URL.revokeObjectURL(source._objectUrl);
    state.sourceCanvas = c;

    // reset adjustments & filter for a fresh image
    resetEdits();
  }

  /* ============================= IMAGE PROCESSING (BAKE) ============================= */
  function requestBake(){
    if(state.bakePending) return;
    state.bakePending = true;
    requestAnimationFrame(()=>{
      state.bakePending = false;
      bakeImage();
    });
  }

  function bakeImage(){
    if(!state.sourceCanvas) return;
    const src = state.sourceCanvas;
    let work = cloneCanvas(src);

    // 1. Sharpening (unsharp mask convolution)
    if(state.adj.sharpness > 0){
      work = applyConvolutionSharpen(work, state.adj.sharpness/100);
    }
    // 2. Edge strength enhancement (blend Sobel edges into image)
    if(state.adj.edge > 0){
      work = applyEdgeEnhance(work, state.adj.edge/100);
    }
    // 3. Special full-pixel presets
    if(state.filter === "sketch"){
      work = applySketch(work);
    } else if(state.filter === "edgedetect"){
      work = applySobelLineArt(work, false);
    } else if(state.filter === "blueprint"){
      work = applySobelLineArt(work, true);
    }

    state.bakedCanvas = work;
    updateOutputs();
  }

  function cloneCanvas(src){
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    // pixel filters read this canvas back with getImageData, so keep it CPU-side
    c.getContext("2d", { willReadFrequently: true }).drawImage(src,0,0);
    return c;
  }

  function applyConvolutionSharpen(canvas, amount){
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext("2d");
    const src = ctx.getImageData(0,0,w,h);
    const dst = ctx.createImageData(w,h);
    const k = amount * 1.4;
    const kernel = [0,-k,0, -k,1+4*k,-k, 0,-k,0];
    convolve(src.data, dst.data, w, h, kernel);
    ctx.putImageData(dst,0,0);
    return canvas;
  }

  function convolve(sd, dd, w, h, kernel){
    const kw=3, half=1;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let r=0,g=0,b=0;
        for(let ky=-half;ky<=half;ky++){
          for(let kx=-half;kx<=half;kx++){
            const sx = clamp(x+kx,0,w-1), sy = clamp(y+ky,0,h-1);
            const idx = (sy*w+sx)*4;
            const kv = kernel[(ky+half)*kw+(kx+half)];
            r += sd[idx]*kv; g += sd[idx+1]*kv; b += sd[idx+2]*kv;
          }
        }
        const di = (y*w+x)*4;
        dd[di] = clamp(r,0,255); dd[di+1] = clamp(g,0,255); dd[di+2] = clamp(b,0,255);
        dd[di+3] = sd[di+3];
      }
    }
  }

  function toGray(sd, w, h){
    const gray = new Float32Array(w*h);
    for(let i=0;i<w*h;i++){
      const idx=i*4;
      gray[i] = sd[idx]*0.299 + sd[idx+1]*0.587 + sd[idx+2]*0.114;
    }
    return gray;
  }

  function sobelMagnitude(gray, w, h){
    const mag = new Float32Array(w*h);
    const gx = [-1,0,1,-2,0,2,-1,0,1], gy=[-1,-2,-1,0,0,0,1,2,1];
    let maxV = 1;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let sx=0, sy=0, k=0;
        for(let ky=-1;ky<=1;ky++){
          for(let kx=-1;kx<=1;kx++){
            const px = clamp(x+kx,0,w-1), py = clamp(y+ky,0,h-1);
            const v = gray[py*w+px];
            sx += v*gx[k]; sy += v*gy[k]; k++;
          }
        }
        const m = Math.sqrt(sx*sx+sy*sy);
        mag[y*w+x] = m;
        if(m>maxV) maxV = m;
      }
    }
    return {mag, maxV};
  }

  function applyEdgeEnhance(canvas, amount){
    const w=canvas.width, h=canvas.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0,0,w,h);
    const gray = toGray(imgData.data, w, h);
    const {mag, maxV} = sobelMagnitude(gray, w, h);
    const d = imgData.data;
    for(let i=0;i<w*h;i++){
      const e = (mag[i]/maxV) * amount * 255;
      const idx = i*4;
      d[idx]   = clamp(d[idx]   - e*0.6, 0, 255);
      d[idx+1] = clamp(d[idx+1] - e*0.6, 0, 255);
      d[idx+2] = clamp(d[idx+2] - e*0.6, 0, 255);
    }
    ctx.putImageData(imgData,0,0);
    return canvas;
  }

  function applySketch(canvas){
    const w=canvas.width, h=canvas.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0,0,w,h);
    const d = imgData.data;
    const gray = toGray(d, w, h);
    // invert + gaussian-ish blur via box blur approximation, then color-dodge blend
    const blurred = boxBlur(gray, w, h, 4);
    const out = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const base = gray[i];
      const inv = 255 - blurred[i];
      let val = (base*255) / (255-inv+1);
      val = clamp(val, 0, 255);
      const idx=i*4;
      out.data[idx]=val; out.data[idx+1]=val; out.data[idx+2]=val; out.data[idx+3]=255;
    }
    ctx.putImageData(out,0,0);
    return canvas;
  }

  function boxBlur(gray, w, h, radius){
    const tmp = new Float32Array(w*h);
    const out = new Float32Array(w*h);
    // horizontal pass
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let sum=0, count=0;
        for(let k=-radius;k<=radius;k++){
          const sx = clamp(x+k,0,w-1);
          sum += gray[y*w+sx]; count++;
        }
        tmp[y*w+x] = sum/count;
      }
    }
    // vertical pass
    for(let x=0;x<w;x++){
      for(let y=0;y<h;y++){
        let sum=0, count=0;
        for(let k=-radius;k<=radius;k++){
          const sy = clamp(y+k,0,h-1);
          sum += tmp[sy*w+x]; count++;
        }
        out[y*w+x] = sum/count;
      }
    }
    return out;
  }

  function applySobelLineArt(canvas, blueprintStyle){
    const w=canvas.width, h=canvas.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0,0,w,h);
    const gray = toGray(imgData.data, w, h);
    const {mag, maxV} = sobelMagnitude(gray, w, h);
    const out = ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      const e = clamp((mag[i]/maxV)*255*1.6, 0, 255);
      const idx=i*4;
      if(blueprintStyle){
        out.data[idx]   = 10 + e*0.15;
        out.data[idx+1] = 24 + e*0.55;
        out.data[idx+2] = 58 + e*0.85;
      } else {
        out.data[idx]=e; out.data[idx+1]=e; out.data[idx+2]=e;
      }
      out.data[idx+3]=255;
    }
    ctx.putImageData(out,0,0);
    return canvas;
  }

  /* ============================= OUTPUT (CSS filter + baked pixels) ============================= */
  function cssFilterString(){
    const a = state.adj;
    let extra = "";
    if(state.filter === "grayscale") extra += " grayscale(100%)";
    if(state.filter === "highcontrast") extra += " contrast(1.35) brightness(1.05)";
    return `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) blur(${a.blur}px)${extra}`;
  }

  function updateOutputs(){
    if(!state.bakedCanvas) return;
    fitEditorCanvas();
    // overlay image — only regenerated when pixels change, not on every CSS-only tweak
    overlayImg.src = state.bakedCanvas.toDataURL("image/png");
    applyLiveCss();
  }

  function applyLiveCss(){
    const filterStr = cssFilterString();
    editCanvas.style.filter = filterStr;
    editCanvas.style.opacity = (state.adj.opacity/100).toString();
    overlayImg.style.filter = filterStr;
  }

  function fitEditorCanvas(){
    if(!state.bakedCanvas || !isActive("editor")) return;
    const wrap = document.querySelector(".editor-canvas-wrap");
    const cs = getComputedStyle(wrap);
    const maxW = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const maxH = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if(maxW <= 0 || maxH <= 0) return;
    const iw = state.bakedCanvas.width, ih = state.bakedCanvas.height;
    const ratio = Math.min(maxW/iw, maxH/ih, 1.6);
    editCanvas.width = iw; editCanvas.height = ih;
    editCanvas.style.width = (iw*ratio)+"px";
    editCanvas.style.height = (ih*ratio)+"px";
    editCtx.clearRect(0,0,iw,ih);
    editCtx.drawImage(state.bakedCanvas,0,0);
  }

  /* ============================= EDITOR CONTROLS ============================= */
  const editSliderIds = ["opacity","brightness","contrast","sharpness","edge","saturation","blur"];
  editSliderIds.forEach(key=>{
    const input = $("s-"+key);
    input.addEventListener("input", ()=>{
      state.adj[key] = Number(input.value);
      $("v-"+key).textContent = input.value + (key==="blur" ? "px" : "%");
      if(key==="sharpness" || key==="edge"){
        requestBake();
      } else {
        applyLiveCss();
      }
    });
  });

  function syncSlidersFromState(){
    editSliderIds.forEach(key=>{
      $("s-"+key).value = state.adj[key];
      $("v-"+key).textContent = state.adj[key] + (key==="blur" ? "px" : "%");
    });
  }

  const filterChips = document.querySelectorAll(".filter-chip");
  function syncChips(){ filterChips.forEach(b=>b.classList.toggle("active", b.dataset.filter===state.filter)); }
  filterChips.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      state.filter = btn.dataset.filter;
      syncChips();
      requestBake();
    });
  });

  function resetEdits(){
    state.filter = "normal";
    state.adj = Object.assign({}, DEFAULT_ADJ);
    syncChips();
    syncSlidersFromState();
    requestBake();
  }
  $("btnResetEdits").addEventListener("click", resetEdits);

  $("btnBackToUpload").addEventListener("click", ()=>nav("studio", { back:true }));
  $("btnHome").addEventListener("click", ()=>nav("home", { back:true }));

  /* ============================= CAMERA ============================= */
  $("btnOpenCamera").addEventListener("click", startCamera);

  async function startCamera(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      showToast(t("errCamera"));
      return;
    }
    try{
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio:false
      });
    } catch(err){
      showToast(t("errCamera"));
      return;
    }
    cameraVideo.srcObject = state.stream;
    const playing = cameraVideo.play();
    if(playing && playing.catch) playing.catch(()=>{});
    nav("studio/camera");
    resetOverlayTransform();
  }

  function stopCamera(){
    if(state.stream){
      state.stream.getTracks().forEach(track=>track.stop());
      state.stream = null;
    }
    cameraVideo.srcObject = null;
  }

  $("btnCloseCamera").addEventListener("click", ()=>nav("studio/edit", { back:true }));

  /* Re-center overlay on rotation so it never drifts off-screen or hugs an edge */
  function handleOrientationChange(){
    if(!isActive("camera")) return;
    state.overlay.x = 0; state.overlay.y = 0;
    applyOverlayTransform();
  }
  if(window.screen && window.screen.orientation && window.screen.orientation.addEventListener){
    window.screen.orientation.addEventListener("change", handleOrientationChange);
  } else {
    window.addEventListener("orientationchange", handleOrientationChange);
  }
  window.addEventListener("resize", ()=>{
    if(isActive("editor")) fitEditorCanvas();
    else handleOrientationChange();
  });

  /* ---- overlay transform ---- */
  function applyOverlayTransform(){
    const o = state.overlay;
    overlayWrap.style.transform =
      `translate(-50%,-50%) translate(${o.x}px, ${o.y}px) rotate(${o.rotation}deg) scale(${o.scale*o.flipH}, ${o.scale*o.flipV})`;
    overlayWrap.classList.toggle("locked", o.locked);
  }

  function resetOverlayTransform(){
    state.overlay.x = 0; state.overlay.y = 0; state.overlay.scale = 1;
    state.overlay.rotation = 0; state.overlay.flipH = 1; state.overlay.flipV = 1;
    applyOverlayTransform();
    syncOverlaySlidersFromState();
  }

  $("btnResetOverlay").addEventListener("click", resetOverlayTransform);

  function setOverlayOpacity(v){
    state.adj.opacity = v;
    overlayImg.style.opacity = (v/100).toString();
    $("o-opacity").value = v; $("ov-opacity").textContent = v+"%";
    $("d-opacity").value = v; $("dv-opacity").textContent = v+"%";
  }
  $("o-opacity").addEventListener("input", (e)=>setOverlayOpacity(Number(e.target.value)));
  $("d-opacity").addEventListener("input", (e)=>setOverlayOpacity(Number(e.target.value)));
  $("o-scale").addEventListener("input", (e)=>{
    if(state.overlay.locked) return;
    state.overlay.scale = Number(e.target.value)/100;
    $("ov-scale").textContent = e.target.value+"%";
    applyOverlayTransform();
  });
  $("o-rotation").addEventListener("input", (e)=>{
    if(state.overlay.locked) return;
    state.overlay.rotation = Number(e.target.value);
    $("ov-rotation").textContent = e.target.value+"°";
    applyOverlayTransform();
  });

  function syncOverlaySlidersFromState(){
    setOverlayOpacity(state.adj.opacity);
    const s = Math.round(state.overlay.scale*100);
    const r = Math.round(state.overlay.rotation);
    $("o-scale").value = s; $("ov-scale").textContent = s+"%";
    $("o-rotation").value = r; $("ov-rotation").textContent = r+"°";
  }

  $("btnFlipH").addEventListener("click", ()=>{
    if(state.overlay.locked) return;
    state.overlay.flipH *= -1; applyOverlayTransform();
  });
  $("btnFlipV").addEventListener("click", ()=>{
    if(state.overlay.locked) return;
    state.overlay.flipV *= -1; applyOverlayTransform();
  });

  $("btnLock").addEventListener("click", (e)=>{
    state.overlay.locked = !state.overlay.locked;
    e.currentTarget.classList.toggle("active", state.overlay.locked);
    e.currentTarget.setAttribute("aria-pressed", String(state.overlay.locked));
    applyOverlayTransform();
  });

  /* Fullscreen: standard API with the WebKit prefix; hidden where unsupported (iPhone Safari). */
  const docEl = document.documentElement;
  const fsRequest = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
  const fsExit = document.exitFullscreen || document.webkitExitFullscreen;
  const fsElement = ()=>document.fullscreenElement || document.webkitFullscreenElement;
  if(!fsRequest) $("btnFullscreen").hidden = true;
  $("btnFullscreen").addEventListener("click", toggleFullscreen);
  function toggleFullscreen(){
    if(!fsRequest) return;
    try{
      const p = fsElement() ? fsExit.call(document) : fsRequest.call(docEl);
      if(p && p.catch) p.catch(()=>{});
    }catch(e){}
  }
  function leaveFullscreen(){
    if(fsElement() && fsExit){ try{ const p = fsExit.call(document); if(p && p.catch) p.catch(()=>{}); }catch(e){} }
  }

  /* ---- pointer gestures: drag / pinch / rotate ---- */
  const pointers = new Map();
  let gestureStart = null; // {dist, angle, scale, rotation}
  let lastTap = 0;

  overlayWrap.addEventListener("pointerdown", (e)=>{
    if(state.overlay.locked) return;
    overlayWrap.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pointers.size === 2) beginGesture();
    else gestureStart = null;

    // double-tap to reset
    const now = Date.now();
    if(now - lastTap < 300 && pointers.size <= 1){ resetOverlayTransform(); }
    lastTap = now;
  });

  overlayWrap.addEventListener("pointermove", (e)=>{
    if(state.overlay.locked || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

    if(pointers.size === 1){
      state.overlay.x += e.clientX - prev.x;
      state.overlay.y += e.clientY - prev.y;
      applyOverlayTransform();
    } else if(pointers.size === 2){
      updateGesture();
    }
  });

  function endPointer(e){
    pointers.delete(e.pointerId);
    if(pointers.size < 2) gestureStart = null;
  }
  overlayWrap.addEventListener("pointerup", endPointer);
  overlayWrap.addEventListener("pointercancel", endPointer);
  overlayWrap.addEventListener("pointerleave", (e)=>{ if(e.buttons===0) endPointer(e); });

  function beginGesture(){
    const [a,b] = [...pointers.values()];
    gestureStart = {
      dist: Math.hypot(b.x-a.x, b.y-a.y),
      angle: Math.atan2(b.y-a.y, b.x-a.x) * 180/Math.PI,
      scale: state.overlay.scale,
      rotation: state.overlay.rotation
    };
  }

  function updateGesture(){
    if(!gestureStart) { beginGesture(); return; }
    const [a,b] = [...pointers.values()];
    const dist = Math.hypot(b.x-a.x, b.y-a.y);
    const angle = Math.atan2(b.y-a.y, b.x-a.x) * 180/Math.PI;
    state.overlay.scale = clamp(gestureStart.scale * (dist / (gestureStart.dist || 1)), 0.2, 3.0);
    state.overlay.rotation = gestureStart.rotation + (angle - gestureStart.angle);
    applyOverlayTransform();
    syncOverlaySlidersFromState();
  }

  /* ============================= KEYBOARD SHORTCUTS ============================= */
  let spaceHiding = false;
  window.addEventListener("keydown", (e)=>{
    if(!isActive("camera") || document.body.classList.contains("sheet-open")) return;
    if(e.target && e.target.tagName === "INPUT" && e.key.startsWith("Arrow")) return; // let sliders use arrows
    const inDrawing = !drawUI.classList.contains("hidden");

    if(e.code === "Space" && !spaceHiding){
      spaceHiding = true;
      overlayWrap.style.opacity = "0";
      e.preventDefault();
    } else if(e.key === "r" || e.key === "R"){
      resetOverlayTransform();
    } else if(e.key === "f" || e.key === "F"){
      toggleFullscreen();
    } else if(e.key === "Escape"){
      if(inDrawing) exitDrawingMode();
    } else if(e.key.startsWith("Arrow") && !state.overlay.locked){
      const step = e.shiftKey ? 20 : 6;
      if(e.key==="ArrowUp") state.overlay.y -= step;
      if(e.key==="ArrowDown") state.overlay.y += step;
      if(e.key==="ArrowLeft") state.overlay.x -= step;
      if(e.key==="ArrowRight") state.overlay.x += step;
      applyOverlayTransform();
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e)=>{
    if(e.code === "Space" && spaceHiding){
      spaceHiding = false;
      overlayWrap.style.opacity = "1";
    }
  });

  /* ============================= DRAWING MODE ============================= */
  $("btnStartDrawing").addEventListener("click", enterDrawingMode);
  $("btnExitDrawing").addEventListener("click", exitDrawingMode);

  function enterDrawingMode(){
    camTop.classList.add("cam-hidden");
    camStack.classList.add("cam-hidden");
    kbdHint.classList.add("cam-hidden");
    drawUI.classList.remove("hidden");
  }
  function exitDrawingMode(){
    camTop.classList.remove("cam-hidden");
    camStack.classList.remove("cam-hidden");
    kbdHint.classList.remove("cam-hidden");
    drawUI.classList.add("hidden");
  }

  /* ============================= GUIDE (rendered into the settings sheet) ============================= */
  function renderGuideSteps(){
    const list = $("guideSteps");
    list.textContent = "";
    const steps = t("guideSteps");
    (Array.isArray(steps) ? steps : []).forEach((step, i)=>{
      const li = document.createElement("li");
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(i+1);
      const txt = document.createElement("span");
      txt.textContent = step;
      li.append(num, txt);
      list.appendChild(li);
    });
  }
  $("btnGuide").addEventListener("click", ()=>window.GiottoSettings.open("guide"));

  /* ============================= PUBLIC API (used by the router) ============================= */
  window.GiottoStudio = {
    hasImage: ()=>!!state.sourceCanvas,
    hasStream: ()=>!!state.stream,
    /* Show one studio screen. Leaving the camera always releases it. */
    show(name){
      if(name !== "camera" && state.stream){
        exitDrawingMode();
        leaveFullscreen();
        stopCamera();
      }
      setScreen(name);
      if(name === "editor") requestAnimationFrame(fitEditorCanvas);
    },
    /* Called when the studio is hidden entirely (navigating to home/privacy/terms). */
    leave(){
      exitDrawingMode();
      leaveFullscreen();
      stopCamera();
    },
    renderGuideSteps,
    toast: showToast
  };

  applyLiveCss();
})();
