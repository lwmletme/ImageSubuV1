(() => {
  const chromeApi = typeof chrome === 'undefined' ? null : chrome;

  const NOISE_APPLIED_ATTR = 'data-ani-noise-applied';
  const NOISE_WRAPPER_CLASS = 'ani-noise-wrapper';
  const NOISE_OVERLAY_CLASS = 'ani-noise-overlay';
  const SELECTED_CLASS = 'ani-noise-selected-image';
  const SELECTION_MODE_CLASS = 'ani-noise-select-mode';
  const DEFAULT_SETTINGS = Object.freeze({ noiseType: 'uniform', intensity: 20 });
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

  const createNoisePattern = (type = DEFAULT_SETTINGS.noiseType, size = 128) => {
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
  let noisePattern = createNoisePattern(currentSettings.noiseType);
  let selectedImage = null;
  let selectionModeEnabled = false;

  const ensureWrapper = (image) => {
    const existing = image.closest(`.${NOISE_WRAPPER_CLASS}`);
    if (existing) {
      return existing;
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

  const removeOverlay = (image) => {
    const wrapper = image.closest(`.${NOISE_WRAPPER_CLASS}`);
    if (!wrapper) {
      return;
    }
    const overlay = wrapper.querySelector(`.${NOISE_OVERLAY_CLASS}`);
    if (overlay) {
      overlay.remove();
    }
    image.removeAttribute(NOISE_APPLIED_ATTR);
  };

  const applyNoise = (image) => {
    if (!image || image.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const doApply = () => {
      const wrapper = ensureWrapper(image);
      if (!wrapper) {
        return;
      }

      const existing = wrapper.querySelector(`.${NOISE_OVERLAY_CLASS}`);
      if (existing) {
        applyOverlaySettings(existing);
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

  const refreshAllOverlays = () => {
    document.querySelectorAll(`.${NOISE_OVERLAY_CLASS}`).forEach((overlay) => {
      applyOverlaySettings(overlay);
    });
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
    noisePattern = createNoisePattern(currentSettings.noiseType);
    refreshAllOverlays();
    if (selectedImage) {
      applyNoise(selectedImage);
    }
  };

  const notifySelectionChanged = () => {
    if (!chromeApi?.runtime?.sendMessage) {
      return;
    }

    try {
      chromeApi.runtime.sendMessage({
        type: 'ANI_SELECTION_CHANGED',
        hasSelected: Boolean(selectedImage),
      });
    } catch (error) {
      // ignore
    }
  };

  const selectImage = (image) => {
    if (selectedImage === image) {
      return;
    }

    if (selectedImage) {
      selectedImage.classList.remove(SELECTED_CLASS);
      removeOverlay(selectedImage);
    }

    selectedImage = image;
    selectedImage.classList.add(SELECTED_CLASS);
    applyNoise(selectedImage);
    notifySelectionChanged();
  };

  const clearSelection = () => {
    if (!selectedImage) {
      return;
    }
    selectedImage.classList.remove(SELECTED_CLASS);
    removeOverlay(selectedImage);
    selectedImage = null;
    notifySelectionChanged();
  };

  const noiseDelta = (type, intensity) => {
    const factor = clamp(intensity / 100, 0.005, 1) * 128;
    if (type === 'gaussian') {
      return (randomGaussianUnit() - 0.5) * 2 * factor;
    }
    return (Math.random() - 0.5) * 2 * factor;
  };

  const generateNoisyDataUrl = (image, settings) =>
    new Promise((resolve, reject) => {
      if (!image) {
        reject(new Error('선택된 이미지가 없습니다.'));
        return;
      }

      const width = image.naturalWidth;
      const height = image.naturalHeight;

      if (!width || !height) {
        reject(new Error('이미지 크기를 불러올 수 없습니다.'));
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('캔버스 컨텍스트 생성에 실패했습니다.'));
        return;
      }

      canvas.width = width;
      canvas.height = height;

      const finalize = () => {
        try {
          ctx.drawImage(image, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const { data } = imageData;
          const { noiseType, intensity } = settings;

          for (let i = 0; i < data.length; i += 4) {
            const delta = noiseDelta(noiseType, intensity);
            data[i] = clamp(data[i] + delta, 0, 255);
            data[i + 1] = clamp(data[i + 1] + delta, 0, 255);
            data[i + 2] = clamp(data[i + 2] + delta, 0, 255);
          }

          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      };

      if (image.complete && image.naturalWidth > 0) {
        finalize();
      } else {
        const onLoad = () => {
          image.removeEventListener('load', onLoad);
          finalize();
        };
        image.addEventListener('load', onLoad);
      }
    });

  const listenForStorageChanges = () => {
    if (!chromeApi?.storage?.onChanged) {
      return;
    }

    chromeApi.storage.onChanged.addListener((changes, areaName) => {
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
    if (!chromeApi?.storage?.local) {
      applySettings(DEFAULT_SETTINGS);
      onReady();
      return;
    }

    chromeApi.storage.local.get(DEFAULT_SETTINGS, (items) => {
      applySettings(items);
      onReady();
    });
  };

  const selectionClickHandler = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    disableSelectionMode();
    selectImage(target);
  };

  const enableSelectionMode = () => {
    if (selectionModeEnabled) {
      return;
    }
    selectionModeEnabled = true;
    document.body.classList.add(SELECTION_MODE_CLASS);
    document.addEventListener('click', selectionClickHandler, true);
  };

  const disableSelectionMode = () => {
    if (!selectionModeEnabled) {
      return;
    }
    selectionModeEnabled = false;
    document.body.classList.remove(SELECTION_MODE_CLASS);
    document.removeEventListener('click', selectionClickHandler, true);
  };

  const handleApplyNoiseRequest = (settings, sendResponse) => {
    if (!selectedImage) {
      sendResponse({ ok: false, error: '먼저 이미지를 선택해 주세요.' });
      return;
    }

    applySettings(settings);
    sendResponse({ ok: true });

    if (chromeApi?.runtime?.sendMessage) {
      try {
        chromeApi.runtime.sendMessage({ type: 'ANI_NOISE_APPLIED_FEEDBACK', ok: true });
      } catch (error) {
        // ignore
      }
    }
  };

  if (chromeApi?.runtime?.onMessage) {
    chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) {
        return;
      }

      switch (message.type) {
        case 'ANI_START_SELECTION':
          enableSelectionMode();
          sendResponse({ ok: true });
          break;
        case 'ANI_CLEAR_SELECTION':
          disableSelectionMode();
          clearSelection();
          sendResponse({ ok: true });
          break;
        case 'ANI_GET_SELECTION_STATE':
          sendResponse({ hasSelected: Boolean(selectedImage) });
          break;
        case 'ANI_APPLY_NOISE':
          handleApplyNoiseRequest(message.payload ?? {}, sendResponse);
          break;
        case 'ANI_GENERATE_NOISY_IMAGE': {
          if (!selectedImage) {
            sendResponse({ ok: false, error: '먼저 이미지를 선택해 주세요.' });
            return true;
          }

          const settings = normalizeSettings(message.payload ?? currentSettings);

          generateNoisyDataUrl(selectedImage, settings)
            .then((dataUrl) => {
              sendResponse({ ok: true, dataUrl, fileName: `noisy-image-${Date.now()}.png` });
            })
            .catch((error) => {
              const isSecurityError = error && /tainted|cross-origin|security/i.test(error.message || '');
              sendResponse({
                ok: false,
                error: isSecurityError
                  ? '보안 제한 때문에 이미지를 저장할 수 없습니다.'
                  : error.message || '이미지 저장에 실패했습니다.',
              });
            });

          return true;
        }
        default:
          break;
      }

      return true;
    });
  }

  const start = () => {
    loadInitialSettings(() => {
      listenForStorageChanges();
    });
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
