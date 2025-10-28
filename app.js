// app.js
(() => {
  const qs = (s) => document.querySelector(s);

  const flame = qs('.flama');
  const audio = document.getElementById('cancionCumple');

  // ===== AudioContext para controlar volumen (una sola cadena) =====
  let audioCtx, musicGain, mediaNodeCreated = false;
  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!musicGain) {
      musicGain = audioCtx.createGain();
      musicGain.gain.value = 0.18; // volumen base
      musicGain.connect(audioCtx.destination);
    }
    // MediaElementSource solo se puede crear una vez por <audio>
    if (!mediaNodeCreated) {
      const srcNode = audioCtx.createMediaElementSource(audio);
      srcNode.connect(musicGain);
      mediaNodeCreated = true;
    }
  }
  // =========== CONFETI (Canvas) ===========
let confettiCanvas, confettiCtx, confettiParts = [], confettiAnimating = false;
let confettiResizeHandlerBound = false;

function ensureConfettiCanvas() {
  if (confettiCanvas) return;
  confettiCanvas = document.createElement('canvas');
  confettiCanvas.id = 'confetti';
  confettiCtx = confettiCanvas.getContext('2d');
  document.body.appendChild(confettiCanvas);
  resizeConfetti();
  if (!confettiResizeHandlerBound) {
    window.addEventListener('resize', resizeConfetti);
    confettiResizeHandlerBound = true;
  }
}

function resizeConfetti() {
  if (!confettiCanvas) return;
  confettiCanvas.width  = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

function spawnBurst({ x, y, count = 140, spread = Math.PI, speed = 6 }) {
  const W = confettiCanvas.width, H = confettiCanvas.height;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread * 2;
    confettiParts.push({
      x: x * W,
      y: y * H,
      vx: Math.cos(angle) * (speed + Math.random() * 4),
      vy: Math.sin(angle) * (speed + Math.random() * 4),
      s: 3 + Math.random() * 6,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      h: Math.floor(Math.random() * 360),
      life: 80 + Math.random() * 40
    });
  }
}

function animateConfetti() {
  if (!confettiAnimating) return;
  const ctx = confettiCtx, W = confettiCanvas.width, H = confettiCanvas.height;
  ctx.clearRect(0, 0, W, H);

  for (let i = confettiParts.length - 1; i >= 0; i--) {
    const p = confettiParts[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;    // gravedad
    p.r += p.vr;
    p.life--;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.fillStyle = `hsl(${p.h} 90% 60%)`;
    ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6);
    ctx.restore();

    if (p.y > H + 40 || p.life <= 0) confettiParts.splice(i, 1);
  }

  if (confettiParts.length === 0) {
    // fin: desvanecer y limpiar
    confettiAnimating = false;
    if (confettiCanvas) {
      confettiCanvas.style.opacity = 0;
      setTimeout(() => {
        if (confettiCanvas && confettiCanvas.parentNode) {
          confettiCanvas.parentNode.removeChild(confettiCanvas);
        }
        confettiCanvas = null;
        confettiCtx = null;
        confettiParts = [];
      }, 420); // coincide con transition CSS
    }
    return;
  }
  requestAnimationFrame(animateConfetti);
}

// Lanza varias ráfagas y muestra el canvas (fade-in)
function confettiBurst() {
  ensureConfettiCanvas();
  confettiCanvas.style.opacity = 1;  // aparece
  confettiAnimating = true;

  spawnBurst({ x: 0.5, y: 0.25, count: 140, spread: Math.PI * 0.9, speed: 7 });
  setTimeout(() => spawnBurst({ x: 0.2, y: 0.3, count: 90, spread: Math.PI * 0.8, speed: 2 }), 180);
  setTimeout(() => spawnBurst({ x: 0.8, y: 0.3, count: 90, spread: Math.PI * 0.8, speed: 2 }), 360);

  requestAnimationFrame(animateConfetti);
}



  // ===== Micrófono y detección de soplido (RMS) =====
  let micStream, analyser, dataArray, micActive = false;
  let blowScore = 0;
  const THRESH = 28;
  const NEED = 90;
  let blowArmed = true;

  async function enableMic(statusEl) {
    try {
      ensureAudioCtx();
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true }
      });
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      dataArray = new Uint8Array(analyser.fftSize);
      micActive = true;
      if (statusEl) statusEl.textContent = 'Micrófono: activo 🎙️';
      loopAnalyse();
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Micrófono: error (' + err.message + ')';
    }
  }

  function loopAnalyse() {
    if (!micActive) return;
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const level = Math.min(100, Math.round(rms * 400));
    detectBlow(level);
    requestAnimationFrame(loopAnalyse);
  }

  function detectBlow(level) {
    blowScore = Math.max(0, blowScore + (level > THRESH ? 6 : -4));
    if (blowScore > NEED && blowArmed) {
      blowArmed = false;
      blowOut();
      setTimeout(() => { blowScore = 0; }, 220);
    }
  }

  function blowOut() {
    // SOLO apaga la llama. No tocamos la música.
    if (flame) flame.classList.add('off');
  }

  // ===== UI: botón “Cantar cumpleaños”, “Soplar” y pop-up de micro =====
  const ventana = qs('.ventana');

  const controls = document.createElement('div');
  controls.className = 'controls-bar';
  controls.innerHTML = `
    <button class="btn primary" id="btn-sing">🎵 Cantar cumpleaños</button>
    <button class="btn success" id="btn-fake">💨 Soplar</button>
    <span class="status" id="mic-status">Micrófono: pendiente</span>
  `;
  ventana.appendChild(controls);

  function showMicModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mic-title">
        <h2 id="mic-title">🎤 Activar micrófono</h2>
        <p>
 Activa el micro para <strong>soplar la vela 🎂
​</strong>.</p>
        <div class="actions">
          <button class="btn" id="modal-allow">Permitir</button>
          <button class="btn secondary" id="modal-later">Ahora no</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const micStatus = document.getElementById('mic-status');
    overlay.querySelector('#modal-allow').addEventListener('click', async () => {
      await enableMic(micStatus);
      overlay.remove();
    });
    overlay.querySelector('#modal-later').addEventListener('click', () => overlay.remove());
  }

  window.addEventListener('load', () => { setTimeout(showMicModal, 50); });

  const singBtn = document.getElementById('btn-sing');
  const fakeBtn = document.getElementById('btn-fake');

  // Reproducir SOLO una vez, independientemente de soplar
  let songPlayed = false;

  singBtn.addEventListener('click', async () => {

    
    if (songPlayed) return;
    ensureAudioCtx();
    // Aseguramos volumen normal por si en el pasado se hubiera reducido
    musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
    musicGain.gain.setValueAtTime(0.18, audioCtx.currentTime);

    try {
      await audio.play();
      confettiBurst();
      songPlayed = true;
      singBtn.disabled = true;
      singBtn.textContent = '🎶 ¡Cantando...!';
      audio.addEventListener('ended', () => {
        singBtn.textContent = '✅ Canción reproducida';
        singBtn.disabled = true;
      }, { once: true });
    } catch (e) {
      // En móviles puede necesitar un toque adicional
      singBtn.textContent = 'Toca para reproducir 🔊';
    }
  });

  fakeBtn.addEventListener('click', blowOut);
  window.addEventListener('keydown', (e) => { if (e.code === 'Space') blowOut(); });
})();
