/* =========================================================
   Campaign Page — shared JS for:
   sections/campaign-banner.liquid
   sections/campaign-gallery.liquid

   - Shutter-sweep click pulse (for touch devices, since
     :hover doesn't exist there)
   - Product quick-view modal, built dynamically from each
     product's real Shopify options + variants (embedded as
     JSON by campaign-gallery.liquid), with Ajax add-to-cart
   ========================================================= */
(function () {
  'use strict';

  // sections/campaign-banner.liquid AND sections/campaign-gallery.liquid
  // both include this file. If both render on the same page, the browser
  // would otherwise execute this whole script twice, double-registering
  // every click handler (including Add to Cart). Guard against that.
  if (window.__cpCampaignPageInit) return;
  window.__cpCampaignPageInit = true;

  function initShutterButtons(root) {
    root.querySelectorAll('.cp-btn-shutter').forEach(function (btn) {
      if (btn.dataset.cpShutterBound) return;
      btn.dataset.cpShutterBound = 'true';
      btn.addEventListener('click', function () {
        btn.classList.remove('is-active');
        void btn.offsetWidth; // restart animation cleanly
        btn.classList.add('is-active');
        setTimeout(function () { btn.classList.remove('is-active'); }, 900);
      });
    });
  }

  function initHamburger(root) {
    var btn = root.querySelector ? root.querySelector('#cpHamburger') : null;
    if (!btn || btn.dataset.cpHamburgerBound) return;
    btn.dataset.cpHamburgerBound = 'true';
    btn.addEventListener('click', function () {
      // This section doesn't own site navigation. Dispatch an event so the
      // theme's real header/drawer component can open the actual menu.
      document.dispatchEvent(new CustomEvent('campaign:menu-toggle', { detail: { source: btn } }));
    });
  }

  function cartAddUrl() {
    var root = (window.Shopify && Shopify.routes && Shopify.routes.root) ? Shopify.routes.root : '/';
    return root.replace(/\/$/, '') + '/cart/add.js';
  }

  function cartJsonUrl() {
    var root = (window.Shopify && Shopify.routes && Shopify.routes.root) ? Shopify.routes.root : '/';
    return root.replace(/\/$/, '') + '/cart.js';
  }

  function getToastWrap() {
    var wrap = document.getElementById('cpToastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'cpToastWrap';
      wrap.className = 'cp-toast-wrap';
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function showToast(opts) {
    var wrap = getToastWrap();
    var toast = document.createElement('div');
    toast.className = 'cp-toast' + (opts.isError ? ' is-error' : '');

    if (opts.image) {
      var img = document.createElement('img');
      img.className = 'cp-toast-thumb';
      img.src = opts.image;
      img.alt = '';
      toast.appendChild(img);
    }

    var body = document.createElement('div');
    body.className = 'cp-toast-body';

    var title = document.createElement('div');
    title.className = 'cp-toast-title';
    title.textContent = opts.title || '';
    body.appendChild(title);

    var msg = document.createElement('div');
    msg.className = 'cp-toast-msg';
    msg.textContent = opts.message || '';
    body.appendChild(msg);

    toast.appendChild(body);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cp-toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    toast.appendChild(closeBtn);

    wrap.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('is-visible'); });

    function dismiss() {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 250);
    }
    closeBtn.addEventListener('click', dismiss);
    var timer = setTimeout(dismiss, 4000);
    toast.addEventListener('mouseenter', function () { clearTimeout(timer); });
  }

  function refreshCartCount() {
    fetch(cartJsonUrl(), { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (cart) {
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
          el.textContent = cart.item_count;
        });
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: cart } }));
      })
      .catch(function () { /* non-critical */ });
  }

  function initQuickView() {
    var overlay = document.getElementById('cpQvOverlay');
    if (!overlay) return; // gallery section not on this page

    var imgEl      = overlay.querySelector('#cpQvImg');
    var titleEl    = overlay.querySelector('#cpQvTitle');
    var priceEl    = overlay.querySelector('#cpQvPrice');
    var descEl     = overlay.querySelector('#cpQvDesc');
    var optionsEl  = overlay.querySelector('#cpQvOptions');
    var cartBtn    = overlay.querySelector('#cpQvCartBtn');
    var statusEl   = overlay.querySelector('#cpQvStatus');
    var closeBtn   = overlay.querySelector('#cpQvClose');

    var currentVariants = [];
    var selected = [];

    function money(cents) {
      // Fallback formatter; product JSON already provides pre-formatted
      // strings via Liquid's `money` filter, this is only a last resort.
      return '$' + (cents / 100).toFixed(2);
    }

    function findVariant() {
      return currentVariants.find(function (v) {
        return selected.every(function (val, i) {
          var key = 'option' + (i + 1);
          return String(v[key]) === String(val);
        });
      });
    }

    function renderOptions(optionsData) {
      optionsEl.innerHTML = '';
      optionsData.forEach(function (opt, index) {
        var wrap = document.createElement('div');
        wrap.className = 'cp-qv-section';

        var label = document.createElement('div');
        label.className = 'cp-qv-label';
        label.textContent = opt.name;
        wrap.appendChild(label);

        if (opt.name.toLowerCase() === "color") {
          // first option group renders as swatch boxes (Color-style)
          var swatchWrap = document.createElement('div');
          swatchWrap.className = 'cp-qv-swatches';
          opt.values.forEach(function (val, i) {
            var s = document.createElement('div');
            s.className = 'cp-qv-swatch' + (i === 0 ? ' is-active' : '');
            s.innerHTML =
            '<span class="cp-color-indicator" style="background:'+ val.toLowerCase() +'"></span>' +
            '<span class="cp-color-name">'+ val +'</span>';
            // s.textContent = val;
            s.setAttribute('data-value', val);
            s.addEventListener('click', function () {
              swatchWrap.querySelectorAll('.cp-qv-swatch').forEach(function (n) { n.classList.remove('is-active'); });
              s.classList.add('is-active');
              selected[index] = val;
              updateSelection();
            });
            swatchWrap.appendChild(s);
          });
          wrap.appendChild(swatchWrap);
        } else {
          // subsequent option groups render as dropdowns (Size-style)
          var selWrap = document.createElement('div');
          selWrap.className = 'cp-qv-select-wrap';
          var select = document.createElement('select');
          select.className = 'cp-qv-select';
          opt.values.forEach(function (val) {
            var o = document.createElement('option');
            o.value = val;
            o.textContent = val;
            select.appendChild(o);
          });
          select.addEventListener('change', function () {
            selected[index] = select.value;
            updateSelection();
          });
          selWrap.appendChild(select);
          wrap.appendChild(selWrap);
        }

        optionsEl.appendChild(wrap);
      });
    }

    function updateSelection() {
      var variant = findVariant();
      statusEl.textContent = '';
      statusEl.className = 'cp-qv-status';

      if (variant) {
        priceEl.textContent = variant.price_formatted;
        cartBtn.disabled = !variant.available;
        cartBtn.dataset.variantId = variant.id;
        if (!variant.available) {
          statusEl.textContent = 'Sold out';
          statusEl.className = 'cp-qv-status is-error';
        }
      } else {
        cartBtn.disabled = true;
        cartBtn.removeAttribute('data-variant-id');
        statusEl.textContent = 'This combination is unavailable';
        statusEl.className = 'cp-qv-status is-error';
      }
    }

    function open(card) {
      var dataEl = card.querySelector('.cp-product-json');
      var data = { options: [], variants: [] };
      try {
        data = JSON.parse(dataEl.textContent);
      } catch (e) {
        console.error('[campaign-page] could not parse product JSON for quick view:', e);
      }

      imgEl.src = card.getAttribute('data-img') || '';
      imgEl.alt = card.getAttribute('data-title') || '';
      titleEl.textContent = card.getAttribute('data-title') || '';
      priceEl.textContent = card.getAttribute('data-price') || '';
      descEl.textContent = card.getAttribute('data-desc') || '';

      currentVariants = data.variants || [];
      selected = (data.options || []).map(function (opt) { return opt.values[0]; });

      statusEl.textContent = '';
      statusEl.className = 'cp-qv-status';
      cartBtn.disabled = false;
      cartBtn.removeAttribute('data-variant-id');

      if (data.options && data.options.length) {
        renderOptions(data.options);
        updateSelection();
      } else {
        optionsEl.innerHTML = '';
        if (currentVariants[0]) {
          cartBtn.disabled = !currentVariants[0].available;
          cartBtn.dataset.variantId = currentVariants[0].id;
          if (!currentVariants[0].available) {
            statusEl.textContent = 'Sold out';
            statusEl.className = 'cp-qv-status is-error';
          }
        } else {
          cartBtn.disabled = true;
          statusEl.textContent = 'This product is not available right now.';
          statusEl.className = 'cp-qv-status is-error';
          console.warn('[campaign-page] no variants found for this product — check the linked product in the theme customizer.');
        }
      }

      overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-product-card]');
      if (card) open(card);
    });

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });

    cartBtn.addEventListener('click', function () {
      var variantId = cartBtn.dataset.variantId;

      if (!variantId) {
        // Never fail silently: tell the shopper (and the merchant, via
        // console) exactly why nothing is being added.
        statusEl.textContent = 'Please choose all options before adding to cart.';
        statusEl.className = 'cp-qv-status is-error';
        console.warn('[campaign-page] Add to cart clicked with no resolvable variant id.', {
          selected: selected,
          currentVariants: currentVariants
        });
        return;
      }

      cartBtn.disabled = true;
      statusEl.textContent = 'Adding…';
      statusEl.className = 'cp-qv-status';

      fetch(cartAddUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: variantId, quantity: 1 })
      })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          cartBtn.disabled = false;
          if (result.ok) {
            statusEl.textContent = 'Added to cart';
            statusEl.className = 'cp-qv-status is-success';

            showToast({
              title: titleEl.textContent,
              message: 'Added to your cart',
              image: imgEl.src,
              isError: false
            });

            refreshCartCount();
            document.dispatchEvent(new CustomEvent('campaign:added-to-cart', { detail: result.body }));
          } else {
            var errMsg = result.body && (result.body.description || result.body.message) ? (result.body.description || result.body.message) : 'Could not add to cart';
            statusEl.textContent = errMsg;
            statusEl.className = 'cp-qv-status is-error';
            showToast({ title: titleEl.textContent, message: errMsg, isError: true });
            console.error('[campaign-page] /cart/add.js rejected the request:', result.body);
          }
        })
        .catch(function (err) {
          cartBtn.disabled = false;
          var errMsg = 'Something went wrong. Please try again.';
          statusEl.textContent = errMsg;
          statusEl.className = 'cp-qv-status is-error';
          showToast({ title: titleEl.textContent, message: errMsg, isError: true });
          console.error('[campaign-page] Add to cart request failed:', err);
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initShutterButtons(document);
    initHamburger(document);
    initQuickView();
  });

  // Re-bind shutter buttons if a section is reloaded live in the
  // Theme Editor (e.g. after a settings change).
  document.addEventListener('shopify:section:load', function (e) {
    initShutterButtons(e.target);
    initHamburger(e.target);
  });
})();