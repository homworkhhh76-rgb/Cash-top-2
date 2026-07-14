(function () {
  'use strict';

  const DEFAULT_FORMATS = [
    'aztec', 'code_128', 'code_39', 'code_93', 'codabar', 'data_matrix',
    'ean_13', 'ean_8', 'itf', 'pdf417', 'qr_code', 'upc_a', 'upc_e'
  ];

  function getErrorMessage(error) {
    const name = String(error?.name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'تم رفض صلاحية الكاميرا. اسمح للكاميرا من إعدادات الموقع ثم أعد المحاولة.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'لم يتم العثور على كاميرا في هذا الجهاز.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'الكاميرا مستخدمة في تطبيق آخر أو تعذر تشغيلها.';
    if (name === 'OverconstrainedError') return 'إعدادات الكاميرا الخلفية غير متاحة على هذا الجهاز.';
    if (!window.isSecureContext) return 'تشغيل الكاميرا يحتاج فتح النظام عبر HTTPS أو localhost.';
    return 'تعذر تشغيل كاميرا الباركود. تحقق من الصلاحية ثم أعد المحاولة.';
  }

  async function requestPermission() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('CAMERA_UNSUPPORTED');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    stream.getTracks().forEach(track => track.stop());
    return true;
  }

  function playCameraSound(url = 'qr.mp3') {
    try {
      const sound = new Audio(url);
      sound.preload = 'auto';
      sound.volume = 1;
      const promise = sound.play();
      if (promise?.catch) promise.catch(() => null);
    } catch (_) {}
  }

  function clearContainer(container) {
    if (!container) return;
    container.querySelectorAll('video').forEach(video => {
      try { video.pause(); } catch (_) {}
      video.srcObject = null;
    });
    container.innerHTML = '';
  }

  async function startNativeScanner(container, onDetected, onError) {
    const formats = typeof BarcodeDetector.getSupportedFormats === 'function'
      ? await BarcodeDetector.getSupportedFormats().catch(() => DEFAULT_FORMATS)
      : DEFAULT_FORMATS;
    const detector = new BarcodeDetector({ formats: formats.length ? formats : DEFAULT_FORMATS });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.muted = true;
    video.style.width = '100%';
    video.style.maxHeight = '55vh';
    video.style.objectFit = 'cover';
    video.style.background = '#000';
    container.innerHTML = '';
    container.appendChild(video);
    video.srcObject = stream;
    await video.play();

    let stopped = false;
    let lastScanAt = 0;
    let animationFrame = 0;
    let busy = false;

    const stop = async () => {
      if (stopped) return;
      stopped = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      stream.getTracks().forEach(track => track.stop());
      try { video.pause(); } catch (_) {}
      video.srcObject = null;
      clearContainer(container);
    };

    const loop = async timestamp => {
      if (stopped) return;
      animationFrame = requestAnimationFrame(loop);
      if (busy || video.readyState < 2 || timestamp - lastScanAt < 110) return;
      lastScanAt = timestamp;
      busy = true;
      try {
        const results = await detector.detect(video);
        const value = String(results?.[0]?.rawValue || '').trim();
        if (value) {
          await stop();
          onDetected(value);
        }
      } catch (error) {
        if (!stopped && String(error?.name || '') !== 'InvalidStateError') onError?.(error);
      } finally {
        busy = false;
      }
    };
    animationFrame = requestAnimationFrame(loop);
    return { stop };
  }

  async function startHtml5Scanner(container, onDetected, onError) {
    if (typeof window.Html5Qrcode !== 'function') throw new Error('NO_BARCODE_ENGINE');
    if (!container.id) container.id = `ct_barcode_reader_${Date.now()}`;
    clearContainer(container);
    const instance = new window.Html5Qrcode(container.id);
    let stopped = false;
    let detected = false;

    const stop = async () => {
      if (stopped) return;
      stopped = true;
      try {
        if (instance.isScanning) await instance.stop();
      } catch (_) {}
      try { instance.clear(); } catch (_) {}
      clearContainer(container);
    };

    await instance.start(
      { facingMode: 'environment' },
      {
        fps: 18,
        qrbox: { width: Math.min(300, Math.max(220, container.clientWidth - 36)), height: 160 },
        aspectRatio: 1.777778,
        disableFlip: false
      },
      async decodedText => {
        if (detected) return;
        detected = true;
        await stop();
        onDetected(String(decodedText || '').trim());
      },
      () => {}
    ).catch(error => {
      onError?.(error);
      throw error;
    });
    return { stop };
  }

  async function startCameraScanner(options = {}) {
    const container = typeof options.container === 'string'
      ? document.getElementById(options.container)
      : options.container;
    if (!container) throw new Error('SCANNER_CONTAINER_NOT_FOUND');
    const onDetected = typeof options.onDetected === 'function' ? options.onDetected : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};

    let controller = null;
    let cancelled = false;
    const pendingController = {
      async stop() {
        cancelled = true;
        if (controller?.stop) await controller.stop();
        clearContainer(container);
      }
    };

    try {
      if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw Object.assign(new Error('INSECURE_CONTEXT'), { name: 'SecurityError' });
      }
      await requestPermission();
      if (cancelled) return pendingController;
      const detected = value => {
        if (!value) return;
        if (options.sound !== false) playCameraSound(options.soundUrl || 'qr.mp3');
        onDetected(value);
      };
      if ('BarcodeDetector' in window) {
        controller = await startNativeScanner(container, detected, onError);
      } else {
        controller = await startHtml5Scanner(container, detected, onError);
      }
      if (cancelled) await controller.stop();
      return pendingController;
    } catch (error) {
      clearContainer(container);
      onError(error, getErrorMessage(error));
      throw error;
    }
  }

  function isEditable(element) {
    return Boolean(element && (element.matches?.('input, textarea, select') || element.isContentEditable));
  }

  function bindHardwareScanner(options = {}) {
    const onScan = typeof options.onScan === 'function' ? options.onScan : () => {};
    const minLength = Math.max(2, Number(options.minLength || 3));
    const maxGap = Math.max(25, Number(options.maxGap || 95));
    const resetAfter = Math.max(maxGap + 20, Number(options.resetAfter || 180));
    let buffer = '';
    let firstAt = 0;
    let lastAt = 0;
    let timer = 0;

    const reset = () => {
      buffer = '';
      firstAt = 0;
      lastAt = 0;
      if (timer) clearTimeout(timer);
      timer = 0;
    };

    const listener = event => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      const now = performance.now();
      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = buffer.trim();
        const duration = firstAt ? now - firstAt : Number.POSITIVE_INFINITY;
        const avgGap = code.length > 1 ? duration / (code.length - 1) : duration;
        const rapid = code.length >= minLength && avgGap <= maxGap;
        const active = document.activeElement;
        const direct = typeof options.isDirectField === 'function' && options.isDirectField(active);
        if (rapid && !direct) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (isEditable(active) && typeof active.value === 'string') {
            const current = String(active.value);
            if (current === code || current.endsWith(code)) active.value = current.slice(0, Math.max(0, current.length - code.length));
          }
          onScan(code, { source: 'hardware', activeElement: active });
        }
        reset();
        return;
      }
      if (event.key.length !== 1) return;
      if (!buffer || now - lastAt > resetAfter) {
        buffer = '';
        firstAt = now;
      }
      buffer += event.key;
      lastAt = now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, resetAfter);
    };

    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }

  function bindBarcodeFieldEnter(selector, callback) {
    const listener = event => {
      const target = event.target;
      if (event.key !== 'Enter' || !target?.matches?.(selector)) return;
      event.preventDefault();
      event.stopPropagation();
      const value = String(target.value || '').trim();
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      callback?.(value, target);
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }

  window.CashtopBarcode = {
    requestPermission,
    startCameraScanner,
    bindHardwareScanner,
    bindBarcodeFieldEnter,
    playCameraSound,
    getErrorMessage
  };
})();
