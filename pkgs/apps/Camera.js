export default {
  name: "Camera",
  description: "Camera application for Pluto",
  privileges: [
    {
      privilege: "startPkg",
      description: "Open photos in a photo viewer",
    },
  ],
  ver: "v1.6.2",
  type: "process",
  exec: async function (Root) {
    let wrapper;
    let cameraWindow;
    let onWindowClose;
    let Html = Root.Lib.html;
    let FileMappings = await Root.Lib.loadLibrary("FileMappings");

    console.log(FileMappings);

    console.log("Hello from camera package", Root.Lib);

    const Win = (await Root.Lib.loadLibrary("WindowSystem")).win;
    let vfs = await Root.Lib.loadLibrary("VirtualFS");
    await vfs.importFS();

    cameraWindow = new Win({
      title: "Camera",
      pid: Root.PID,
      minHeight: 200,
      minWidth: 200,
      width: 670,
      height: 470,
      onclose: () => {
        onWindowClose();
      },
    });

    let stream = null;
    let currentDeviceId = null;
    let lastSavedPath = null; // track last saved photo path so thumbnail can open it
    let ended = false; // guard to avoid double-stop / recursive onEnd
    Root.Lib.setOnEnd((_) => {
      // When the runtime requests end, stop camera but do NOT forcibly close the window here.
      // Closing the window triggers cameraWindow.onclose which will call Root.Lib.onEnd -> recursion.
      if (ended) return;
      ended = true;
      // Best-effort stop; do not await to avoid blocking the runtime shutdown path.
      stopStream().catch(() => {});
    });

    wrapper = cameraWindow.window.querySelector(".win-content");

    // Make wrapper a full-bleed camera stage (no internal padding), position relative for overlays
    Html.from(wrapper).style({
      display: "flex",
      "justify-content": "center",
      "align-items": "center",
      padding: "0",
      margin: "0",
      height: "100%",
      width: "100%",
      position: "relative",
      "box-sizing": "border-box",
      overflow: "hidden",
    });

    // Aspect-ratio box for video (16:9, responsive)
    let aspectBox = new Html("div")
      .style({
        position: "relative",
        width: "100%",
        height: "100%",
        "max-width": "100%",
        "max-height": "100%",
        "aspect-ratio": "16 / 9",
        display: "flex",
        "justify-content": "center",
        "align-items": "center",
        background: "#000",
      })
      .appendTo(wrapper);

    // Video element fills the aspect box, keeps aspect ratio
    let video = new Html("video")
      .attr({ autoplay: true, playsinline: true, muted: true })
      .style({
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        "object-fit": "contain",
        "background-color": "#000",
        "border-radius": "8px",
      })
      .appendTo(aspectBox);

    // Top bar controls container (camera selector + take button) - visually minimal, in design language
    let topBar = new Html("div")
      .style({
        position: "absolute",
        top: "8px",
        left: "8px",
        right: "8px",
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center",
        gap: "8px",
        "pointer-events": "none", // allow video touches except children
        "z-index": "65", // keep controls above video
      })
      .appendTo(wrapper);

    // Left side: selector (pointer events re-enabled)
    let leftControls = new Html("div")
      .style({ display: "flex", gap: "8px", "pointer-events": "auto" })
      .appendTo(topBar);

    let cameraSelect = new Html("select")
      .style({
        padding: "6px 8px",
        "border-radius": "8px",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(0,0,0,0.35)",
        color: "var(--text)",
        "font-weight": "600",
        "backdrop-filter": "blur(4px)",
      })
      .appendTo(leftControls);

    // Right side: snapshot button
    let rightControls = new Html("div")
      .style({ "pointer-events": "auto" })
      .appendTo(topBar);

    let button = new Html("button")
      .html(Root.Lib.icons.camera)
      .classOn("square")
      .style({
        padding: "10px",
        "border-radius": "999px",
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.08)",
        "backdrop-filter": "blur(6px)",
        color: "var(--text)",
      })
      .appendTo(rightControls);

    // Hidden canvas for capture
    let canvas = new Html("canvas")
      .attr({ style: "display: none;" })
      .appendTo(wrapper);

    // Flash overlay for visual cue (over aspect box)
    let flash = new Html("div")
      .style({
        position: "absolute",
        inset: "0",
        "background-color": "#fff",
        opacity: "0",
        transition: "opacity 220ms ease-out",
        "pointer-events": "none",
        "z-index": "50",
      })
      .appendTo(aspectBox);

    // Thumbnail preview (bottom-right, over aspect box)
    let thumb = new Html("img")
      .attr({ src: "", style: "display: none;" })
      .style({
        position: "absolute",
        bottom: "12px",
        right: "12px",
        width: "96px",
        height: "64px",
        "object-fit": "cover",
        "border-radius": "8px",
        border: "1px solid rgba(255,255,255,0.12)",
        "box-shadow": "0 6px 20px rgba(0,0,0,0.6)",
        "z-index": "60",
        transition: "transform 300ms ease, opacity 400ms ease",
      })
      .appendTo(aspectBox);

    // make thumbnail clickable and open the saved image in the default viewer
    thumb.style({ cursor: "pointer", "pointer-events": "auto" });
    thumb.on("click", async () => {
      if (!lastSavedPath) return;
      try {
        const mapping = await FileMappings.retrieveAllMIMEdata(lastSavedPath);
        if (mapping && typeof mapping.onClick === "function") {
          // mapping.onClick expects the Core object (same as FileManager)
          mapping.onClick(Root.Core);
        } else {
          // fallback: try to open ImageViewer directly
          try {
            const p = await Root.Core.startPkg("apps:ImageViewer", true, true);
            p.proc.send({ type: "loadFile", path: lastSavedPath });
          } catch (e) {
            console.error("Could not open image viewer:", e);
          }
        }
      } catch (e) {
        console.error("Error opening saved photo:", e);
      }
    });

    async function stopStream() {
      if (!stream) return;
      try {
        // stop each track safely
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (e) {
            /* ignore individual stop errors */
          }
        });
      } catch (e) {
        /* ignore */
      }
      try {
        // detach from video element so playback stops immediately
        if (video && video.elm) video.elm.srcObject = null;
      } catch (e) {
        /* ignore */
      }
      stream = null;
      currentDeviceId = null;
      return;
    }

    // Remove a device option from the select (used when a device errors out)
    function removeDeviceFromSelect(deviceId) {
      try {
        const opts = Array.from(cameraSelect.elm.options || []);
        for (const o of opts) {
          if (o.value === deviceId) {
            o.remove();
          }
        }
      } catch (e) {
        /* ignore */
      }
    }

    async function startStream(deviceId) {
      try {
        // ensure previous stream is stopped before requesting a new one
        await stopStream();
        const constraints = {
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
          audio: false,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        // attach and play
        video.elm.srcObject = stream;
        await video.elm.play();
      } catch (error) {
        console.error("Error accessing camera:", error);
        // If a specific device failed, remove it from the selector and try the next one.
        if (deviceId) {
          removeDeviceFromSelect(deviceId);
          const nextOpt = cameraSelect.elm.options[0];
          if (nextOpt && nextOpt.value && nextOpt.value !== deviceId) {
            // update select visually and attempt next camera
            cameraSelect.elm.value = nextOpt.value;
            currentDeviceId = nextOpt.value;
            try {
              await startStream(currentDeviceId);
              return;
            } catch (e) {
              // fall through to show error if this also fails
            }
          } else {
            // no more devices available
            wrapper.innerHTML =
              "<p style='padding:12px'>Error: Selected camera is not available and no alternative cameras remain.</p>";
            return;
          }
        } else {
          wrapper.innerHTML =
            "<p style='padding:12px'>Error: Could not access camera. Please ensure camera permissions are granted.</p>";
        }
      }
    }

    async function populateCameraList() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        cameraSelect.elm.innerHTML = "";
        cams.forEach((c, i) => {
          const opt = document.createElement("option");
          opt.value = c.deviceId;
          opt.text = c.label || `Camera ${i + 1}`;
          cameraSelect.elm.appendChild(opt);
        });
        if (cams.length > 0) {
          currentDeviceId = cameraSelect.elm.value;
          await startStream(currentDeviceId);
        } else {
          // fallback: try to start default camera
          await startStream();
        }
      } catch (err) {
        console.error("Could not populate cameras:", err);
        await startStream();
      }
    }

    cameraSelect.on("change", async (ev) => {
      try {
        await stopStream();
      } catch (e) {
        /* ignore */
      }
      currentDeviceId = ev.target.value;
      // attempt start; if it fails, startStream will remove the bad device and try next
      await startStream(currentDeviceId);
    });

    function showFlashAndThumb(dataUrl) {
      // flash
      flash.style({ opacity: "0.9" });
      setTimeout(() => flash.style({ opacity: "0" }), 160);

      // thumbnail
      thumb.attr({ src: dataUrl });
      thumb.style({ display: "block", opacity: "1", transform: "scale(1)" });
      setTimeout(() => {
        thumb.style({ opacity: "0", transform: "scale(0.85)" });
        setTimeout(() => thumb.style({ display: "none" }), 420);
      }, 1400);
    }

    async function takePhoto() {
      if (!stream) {
        console.error("Camera not initialized");
        return;
      }

      const videoEl = video.elm;
      // Capture at the camera intrinsic resolution (keeps quality).
      canvas.elm.width = videoEl.videoWidth || 1280;
      canvas.elm.height = videoEl.videoHeight || 720;
      const context = canvas.elm.getContext("2d");

      // Draw the full video frame
      context.drawImage(videoEl, 0, 0, canvas.elm.width, canvas.elm.height);

      canvas.elm.toBlob(
        async (blob) => {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            const base64String = btoa(String.fromCharCode(...uint8Array));
            const dataUrl = `data:image/jpeg;base64,${base64String}`;

            const filename = `photo_${new Date()
              .toISOString()
              .replace(/[:.]/g, "-")}.jpg`;
            const path = `Root/Pictures/${filename}`;

            await vfs.writeFile(path, dataUrl);
            console.log(`Photo saved to: ${path}`);

            // remember saved path and attach to thumbnail so clicking it opens the file
            lastSavedPath = path;
            thumb.attr({ "data-path": path });

            // Visual feedback similar to phone camera
            showFlashAndThumb(dataUrl);

            // ensure thumbnail is visible/clickable
            thumb.style({
              display: "block",
              opacity: "1",
              transform: "scale(1)",
              cursor: "pointer",
            });

            // toast placed bottom-left so it doesn't overlap the top controls
            let x = new Html("p")
              .html(`Saved photo as ${filename}`)
              .style({
                position: "absolute",
                left: "12px",
                bottom: "12px",
                "background-color": "rgba(0,0,0,0.55)",
                padding: "6px 10px",
                "border-radius": "8px",
                color: "var(--text)",
                "z-index": "80",
                "pointer-events": "none",
              })
              .appendTo(wrapper);

            setTimeout(() => x.cleanup(), 3000); // remove after 3 seconds
          } catch (error) {
            console.error("Error saving photo to VFS:", error);
            let x = new Html("p")
              .html(`Error saving photo: ${error.message}`)
              .appendTo(wrapper);
            setTimeout(() => x.cleanup(), 3000);
          }
        },
        "image/jpeg",
        0.9
      );
    }

    button.on("click", takePhoto);

    // enumerate devices. Many browsers hide labels until permission granted,
    // so attempt getUserMedia once to prompt permission so labels populate.
    (async () => {
      try {
        // quick permission to reveal labels (silently request lowest constraints)
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (e) {
        // ignore; device labels might remain empty but list will still work
      } finally {
        await populateCameraList();
      }
    })();

    onWindowClose = async () => {
      if (ended) return;
      try {
        await stopStream();
      } catch (e) {
        /* ignore */
      }
      ended = true;
      try {
        Root.Lib.onEnd();
      } catch (e) {
        /* ignore */
      }
    };

    return Root.Lib.setupReturns((m) => {
      console.log("Camera received message: " + m);
    });
  },
};
