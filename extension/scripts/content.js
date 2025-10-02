(() => {
  const NOISE_APPLIED_ATTR = 'data-ani-noise-applied';
  const NOISE_WRAPPER_CLASS = 'ani-noise-wrapper';
  const NOISE_OVERLAY_CLASS = 'ani-noise-overlay';
  const DEFAULT_SETTINGS = Object.freeze({
    noiseType: 'uniform',
    intensity: 20,
  });

  const SUPPORTED_NOISE_TYPES = new Set(['uniform', 'gaussian']);

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const randomGaussianUnit = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const standardNormal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const normalized = (standardNormal + 3) / 6; // approx clamp to [0,1]
    return clamp(normalized, 0, 1);
  };

  const createNoiseDataUrl = (type = DEFAULT_SETTINGS.noiseType, size = 128) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }

    const imageData = ctx.createImageData(size, size);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      let shadeValue = Math.random();
      if (type === 'gaussian') {
        shadeValue = randomGaussianUnit();
      }
      const shade = Math.floor(shadeValue * 255);
      data[i] = shade;
      data[i + 1] = shade;
      data[i + 2] = shade;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let noisePattern = createNoiseDataUrl(currentSettings.noiseType);

  const ensureWrapper = (image) => {
    if (image.closest(`.${NOISE_WRAPPER_CLASS}`)) {
      return image.closest(`.${NOISE_WRAPPER_CLASS}`);
    }

    const wrapper = document.createElement('span');
    wrapper.className = NOISE_WRAPPER_CLASS;

    const parent = image.parentNode;
    if (!parent) {
      return null;
    }

    parent.insertBefore(wrapper, image);
    wrapper.appendChild(image);
    return wrapper;
  };

  const overlayOpacityFromIntensity = (intensity) => {
    const normalized = clamp(intensity / 100, 0.005, 1);
    return normalized.toString();
  };

  const applyOverlaySettings = (overlay) => {
    overlay.style.backgroundImage = noisePattern ? `url(${noisePattern})` : '';
    overlay.style.opacity = overlayOpacityFromIntensity(currentSettings.intensity);
  };

  const createOverlay = () => {
    const overlay = document.createElement('span');
    overlay.className = NOISE_OVERLAY_CLASS;
    applyOverlaySettings(overlay);
    return overlay;
  };

  const applyNoise = (image) => {
    if (!image || image.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (image.getAttribute(NOISE_APPLIED_ATTR) === 'true') {
      return;
    }

    const doApply = () => {
      const wrapper = ensureWrapper(image);
      if (!wrapper) {
        return;
      }
      if (wrapper.querySelector(`.${NOISE_OVERLAY_CLASS}`)) {
        image.setAttribute(NOISE_APPLIED_ATTR, 'true');
        return;
      }

      const overlay = createOverlay();
      wrapper.appendChild(overlay);
      image.setAttribute(NOISE_APPLIED_ATTR, 'true');
    };

    if (image.complete && image.naturalWidth > 0) {
      doApply();
    } else {
      image.addEventListener('load', doApply, { once: true });
    }
  };

  const scanExistingImages = () => {
    document.querySelectorAll('img').forEach(applyNoise);
  };

  const refreshAllOverlays = () => {
    document
      .querySelectorAll(`.${NOISE_OVERLAY_CLASS}`)
      .forEach((overlay) => applyOverlaySettings(overlay));
  };

  const normalizeSettings = (settings) => {
    const merged = { ...DEFAULT_SETTINGS };
    if (settings && SUPPORTED_NOISE_TYPES.has(settings.noiseType)) {
      merged.noiseType = settings.noiseType;
    }
    const parsedIntensity = Number(settings?.intensity);
    if (!Number.isNaN(parsedIntensity)) {
      merged.intensity = clamp(parsedIntensity, 0.5, 100);
    }
    return merged;
  };

  const applySettings = (settings) => {
    currentSettings = normalizeSettings(settings);
    noisePattern = createNoiseDataUrl(currentSettings.noiseType);
    refreshAllOverlays();
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) {
          applyNoise(node);
          return;
        }

        if (node instanceof Element) {
          node.querySelectorAll('img').forEach(applyNoise);
        }
      });
    });
  });

  const listenForStorageChanges = () => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      const updated = { ...currentSettings };
      let hasChanges = false;

      if (changes.noiseType && SUPPORTED_NOISE_TYPES.has(changes.noiseType.newValue)) {
        updated.noiseType = changes.noiseType.newValue;
        hasChanges = true;
      }

      if (changes.intensity && typeof changes.intensity.newValue !== 'undefined') {
        const candidate = Number(changes.intensity.newValue);
        if (!Number.isNaN(candidate)) {
          updated.intensity = clamp(candidate, 0.5, 100);
          hasChanges = true;
        }
      }

      if (hasChanges) {
        applySettings(updated);
      }
    });
  };

  const loadInitialSettings = (onReady = () => {}) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      applySettings(DEFAULT_SETTINGS);
      onReady();
      return;
    }

    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
      applySettings(items);
      onReady();
    });
  };

  const start = () => {
    loadInitialSettings(() => {
      scanExistingImages();
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
      });
      listenForStorageChanges();
    });
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
