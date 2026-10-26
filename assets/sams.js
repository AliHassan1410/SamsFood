/**
 * Sam's Food - Luxury Storefront Interactions
 * City toggle, build-a-box calculator, sticky ATC, scroll animations, WhatsApp prefill
 */

(function () {
  'use strict';

  // --- 1. City Toggle Logic (Lahore | Nationwide) ---
  const CITY_STORAGE_KEY = 'sams_preferred_city';

  function getStoredCity() {
    try {
      return localStorage.getItem(CITY_STORAGE_KEY) || 'lahore';
    } catch (e) {
      return 'lahore';
    }
  }

  function setStoredCity(city) {
    try {
      localStorage.setItem(CITY_STORAGE_KEY, city);
    } catch (e) {
      // Silently catch localStorage restrictions in private browsing
    }
    applyCity(city);
    window.dispatchEvent(new CustomEvent('sams:city-changed', { detail: { city } }));
  }

  function applyCity(city) {
    document.documentElement.setAttribute('data-sams-city', city);
    document.body.setAttribute('data-sams-city', city);

    // Update toggle UI
    document.querySelectorAll('.sams-city-btn').forEach((btn) => {
      const targetCity = btn.getAttribute('data-city');
      if (targetCity === city) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });

    // Update Lahore-only products visibility/warning if user selected Nationwide
    const isNationwide = city === 'nationwide';
    document.querySelectorAll('[data-delivery-zone="lahore_only"]').forEach((el) => {
      const warningBadge = el.querySelector('.sams-zone-warning');
      const atcBtn = el.querySelector('.sams-product-atc, button[type="submit"]');

      if (isNationwide) {
        el.classList.add('sams-lahore-restricted');
        if (warningBadge) warningBadge.style.display = 'inline-flex';
        if (atcBtn && el.getAttribute('data-restrict-lahore') === 'true') {
          atcBtn.setAttribute('disabled', 'disabled');
          atcBtn.dataset.originalText = atcBtn.innerText;
          atcBtn.innerText = 'Lahore Delivery Only';
        }
      } else {
        el.classList.remove('sams-lahore-restricted');
        if (warningBadge) warningBadge.style.display = 'none';
        if (atcBtn && atcBtn.dataset.originalText) {
          atcBtn.removeAttribute('disabled');
          atcBtn.innerText = atcBtn.dataset.originalText;
        }
      }
    });
  }

  // --- 2. Scroll Fade-Up Animations ---
  function initScrollAnimations() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.sams-fade-up').forEach((el) => el.classList.add('sams-in-view'));
      return;
    }

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.sams-fade-up').forEach((el) => el.classList.add('sams-in-view'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('sams-in-view');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.1 }
    );

    document.querySelectorAll('.sams-fade-up:not(.sams-in-view)').forEach((el) => observer.observe(el));
  }

  // --- 3. Build-A-Box Dynamic Calculator ---
  function initBuildBox() {
    const boxContainer = document.querySelector('.sams-build-box');
    if (!boxContainer) return;

    const threshold = parseFloat(boxContainer.dataset.freeShippingThreshold || '3000');
    const items = boxContainer.querySelectorAll('.sams-box-item');
    const totalEl = boxContainer.querySelector('.sams-box-total');
    const progressBar = boxContainer.querySelector('.sams-free-shipping-progress');
    const meterNotice = boxContainer.querySelector('.sams-meter-notice');
    const addAllBtn = boxContainer.querySelector('.sams-box-add-btn');

    function calculateBox() {
      let total = 0;
      let count = 0;
      const payloadItems = [];

      items.forEach((item) => {
        const qtyInput = item.querySelector('.sams-box-qty');
        const price = parseFloat(item.dataset.price || '0');
        const variantId = item.dataset.variantId;
        const qty = parseInt(qtyInput ? qtyInput.value : '0', 10) || 0;

        if (qty > 0) {
          total += price * qty;
          count += qty;
          payloadItems.push({ id: variantId, quantity: qty });
        }
      });

      if (totalEl) {
        totalEl.textContent = 'Rs ' + total.toLocaleString('en-PK');
      }

      if (progressBar && meterNotice) {
        const percent = Math.min(100, Math.round((total / threshold) * 100));
        progressBar.style.width = percent + '%';

        if (total >= threshold) {
          meterNotice.innerHTML = '<strong>Congratulations!</strong> You qualify for FREE Delivery!';
          progressBar.style.background = 'var(--olive)';
        } else {
          const diff = threshold - total;
          meterNotice.innerHTML = `Add <strong>Rs ${diff.toLocaleString('en-PK')}</strong> more for <strong>FREE delivery</strong>`;
          progressBar.style.background = 'linear-gradient(90deg, var(--gold) 0%, var(--saffron) 100%)';
        }
      }

      if (addAllBtn) {
        addAllBtn.disabled = count === 0;
        addAllBtn.dataset.items = JSON.stringify(payloadItems);
      }
    }

    boxContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.sams-box-qty-btn');
      if (!btn) return;
      const isPlus = btn.classList.contains('plus');
      const row = btn.closest('.sams-box-item');
      const input = row.querySelector('.sams-box-qty');
      if (!input) return;

      let val = parseInt(input.value, 10) || 0;
      if (isPlus) val += 1;
      else if (val > 0) val -= 1;
      input.value = val;
      calculateBox();
    });

    if (addAllBtn) {
      addAllBtn.addEventListener('click', async () => {
        const itemsData = addAllBtn.dataset.items ? JSON.parse(addAllBtn.dataset.items) : [];
        if (!itemsData.length) return;

        const originalText = addAllBtn.innerText;
        addAllBtn.disabled = true;
        addAllBtn.innerText = 'Adding to Cart...';

        try {
          const res = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: itemsData }),
          });
          if (res.ok) {
            addAllBtn.innerText = 'Added! Opening cart...';
            // Open cart drawer or redirect to cart
            window.location.href = '/cart';
          } else {
            throw new Error('Could not add to cart');
          }
        } catch (err) {
          console.error(err);
          addAllBtn.disabled = false;
          addAllBtn.innerText = originalText;
          alert('Could not add items to cart. Please try again.');
        }
      });
    }

    calculateBox();
  }

  // --- 4. Mobile Sticky ATC ---
  function initStickyATC() {
    const stickyATC = document.querySelector('.sams-sticky-atc');
    const mainSubmit = document.querySelector('.sams-main-atc-submit, [name="add"]');
    if (!stickyATC || !mainSubmit) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            stickyATC.classList.add('visible');
          } else {
            stickyATC.classList.remove('visible');
          }
        });
      },
      { threshold: 0 }
    );

    observer.observe(mainSubmit);
  }

  // --- Init Everything on DOM Ready ---
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Init city toggle
    const currentCity = getStoredCity();
    applyCity(currentCity);

    document.addEventListener('click', (e) => {
      const cityBtn = e.target.closest('.sams-city-btn');
      if (cityBtn) {
        const chosenCity = cityBtn.getAttribute('data-city');
        if (chosenCity) setStoredCity(chosenCity);
      }
    });

    // 2. Scroll animations
    initScrollAnimations();

    // 3. Build-a-box
    initBuildBox();

    // 4. Sticky ATC
    initStickyATC();
  });
})();

/* "Buy now" on collection cards: adds one unit of the card variant, then goes to checkout.
   Delegated, so it works for cards rendered by sections and by section re-renders. */
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-sams-buy-now]');
  if (!button || button.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  const root = window.Shopify?.routes?.root || '/';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`${root}cart/add.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(button.dataset.variantId), quantity: 1 }] }),
    });
    if (!response.ok) throw new Error(String(response.status));
    window.location.href = `${root}checkout`;
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
});
