(() => {
  const NOISE_APPLIED_ATTR = 'data-ani-noise-applied';
  const NOISE_WRAPPER_CLASS = 'ani-noise-wrapper';
  const NOISE_OVERLAY_CLASS = 'ani-noise-overlay';

  const createNoiseDataUrl = (size = 128) => {
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
      const shade = Math.floor(Math.random() * 256);
      data[i] = shade;
      data[i + 1] = shade;
      data[i + 2] = shade;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  const noisePattern = createNoiseDataUrl();

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

  const createOverlay = () => {
    const overlay = document.createElement('span');
    overlay.className = NOISE_OVERLAY_CLASS;
    overlay.style.backgroundImage = noisePattern ? `url(${noisePattern})` : '';
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

  const start = () => {
    scanExistingImages();
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
