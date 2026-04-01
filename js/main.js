/* ============================================================
   DEVOTIONAL PLATFORM - MAIN JAVASCRIPT
   ============================================================ */

'use strict';

// --- DOM READY ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileMenu();
  initScrollAnimations();
  initCart();
  initWishlist();
  initSearch();
  initCourseTabs();
  initStoreFilters();
  initBookingForm();
  initBookingCatalog();
  initStickyNav();
});

// --- THEME (DARK MODE) ---
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  const themeBtn = document.getElementById('theme-toggle');
  if (!themeBtn) return;

  updateThemeIcon(themeBtn, saved);

  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(themeBtn, next);
  });
}

function updateThemeIcon(btn, theme) {
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  btn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
}

// --- MOBILE MENU ---
  function initMobileMenu() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileNav = document.getElementById('mobile-nav');
    const closeBtn = document.getElementById('mobile-nav-close');
    const themeToggle = document.getElementById('theme-toggle');

    if (!menuBtn || !mobileNav) return;

    // Use the hamburger button as the single toggle (remove separate close button)
    if (closeBtn) {
      closeBtn.remove();
    }

    const openMobileNav = () => {
      mobileNav.classList.add('open');
      mobileNav.style.display = 'flex';
      menuBtn.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');
      menuBtn.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
    };

    const closeMobileNav = () => {
      mobileNav.classList.remove('open');
      mobileNav.style.display = 'none';
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
    };

  menuBtn.addEventListener('click', () => {
    if (mobileNav.classList.contains('open')) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  });

    // Close on outside click
    mobileNav.addEventListener('click', (e) => {
      if (e.target === mobileNav) closeMobileNav();
    });

  // Close nav links on click
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileNav);
  });

    // Keep theme toggle visible in the main navbar on all breakpoints
    if (themeToggle) {
      themeToggle.style.display = 'inline-flex';
    }

    // Hide mobile nav until explicitly opened
    mobileNav.classList.remove('open');
    mobileNav.style.display = 'none';

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileNav();
  });
}

// --- SCROLL ANIMATIONS ---
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.fade-up').forEach((el) => observer.observe(el));
}

// --- STICKY NAV SHADOW ---
function initStickyNav() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.1)';
    } else {
      navbar.style.boxShadow = '';
    }
  }, { passive: true });
}

// --- CART ---
let cartCount = 0;
const cartItems = [];

function initCart() {
  // Restore from sessionStorage
  const stored = sessionStorage.getItem('cartCount');
  if (stored) {
    cartCount = parseInt(stored, 10);
    updateCartBadge();
  }
}

function addToCart(name, price, emoji) {
  cartCount++;
  cartItems.push({ name, price, emoji });
  sessionStorage.setItem('cartCount', cartCount);
  updateCartBadge();
  showToast(`🛒 "${name}" added to cart!`);
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent = cartCount;
    badge.style.display = cartCount > 0 ? 'flex' : 'none';
  }
}

// --- WISHLIST ---
const wishlist = new Set();

function initWishlist() {
  document.querySelectorAll('.product-wishlist').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (wishlist.has(id)) {
        wishlist.delete(id);
        btn.textContent = '🤍';
        showToast('Removed from wishlist');
      } else {
        wishlist.add(id);
        btn.textContent = '❤️';
        showToast('Added to wishlist!');
      }
    });
  });
}

// --- SEARCH ---
function initSearch() {
  const searchInputs = document.querySelectorAll('.search-input');
  searchInputs.forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = input.value.trim();
        if (query) {
          showToast(`🔍 Searching for "${query}"...`);
        }
      }
    });
  });
}

// --- COURSE / STORE FILTERS ---
function initCourseTabs() {
  const tabs = document.querySelectorAll('.course-tab');
  const cards = document.querySelectorAll('.course-card');
  if (!tabs.length || !cards.length) return;

  const filterCourses = (filter) => {
    cards.forEach((card) => {
      const type = card.dataset.type || '';
      card.hidden = filter !== 'all' && type !== filter;
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      filterCourses(tab.dataset.filter);
    });
  });

  filterCourses('all');
}

function initStoreFilters() {
  const chips = document.querySelectorAll('.category-chip');
  const products = document.querySelectorAll('.product-card[data-category]');
  if (!chips.length || !products.length) return;

  const setFilter = (filter) => {
    products.forEach((card) => {
      const category = card.dataset.category || '';
      card.hidden = filter !== 'all' && category !== filter;
    });
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((item) => item.classList.remove('active'));
      chip.classList.add('active');
      setFilter(chip.dataset.category);
    });
  });

  setFilter('all');
}

function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;
  form.addEventListener('submit', handleBookingSubmit);
}

function initBookingCatalog() {
  const form = document.getElementById('booking-form');
  if (!form) return;

  const serviceSelect = form.querySelector('.service-select');
  const serviceLabelInput = form.querySelector('input[name="serviceDetails"]');
  const amountInput = form.querySelector('input[name="amount"]');
  if (!serviceSelect || !amountInput) return;

  const platformSelect = form.querySelector('select[name="platform"]');
  const platformRadios = form.querySelectorAll('input[name="platform"]');
  const params = new URLSearchParams(window.location.search);
  const prePlatform = params.get('platform');
  const preServiceId = params.get('serviceId');
  const preAmount = params.get('amount');
  const preLabel = params.get('serviceLabel');
  const selectedNote = document.getElementById('selected-item-note');
  const optionsWrap = document.getElementById('platform-options');

  const getSelectedPlatform = () => {
    if (platformSelect) return platformSelect.value;
    const checked = Array.from(platformRadios).find((r) => r.checked);
    return checked ? checked.value : '';
  };

  const setAmount = (price) => {
    if (!amountInput) return;
    amountInput.value = price > 0 ? price : '';
  };

  const buildOptions = (catalog, platform) => {
    const opts = [];
    const pushOption = (value, label, price) => {
      opts.push({ value, label, price: Number(price || 0) });
    };

    if (platform === 'astrotalks') {
      (catalog.astrologers || []).forEach((a) => {
        const rate = Number(a.price_per_minute || 0);
        const total = rate > 0 ? rate * 10 : 0;
        const label = rate > 0 ? `${a.name} (₹${rate}/min, 10 min)` : a.name;
        pushOption(`astro:${a.id}`, label, total);
      });
    } else if (platform === 'merchandise' || platform === 'store') {
      (catalog.storeItems || []).forEach((i) => {
        const price = Number(i.price || 0);
        const label = price > 0 ? `${i.name} (₹${price})` : i.name;
        pushOption(`store:${i.id}`, label, price);
      });
    } else if (platform === 'meditation') {
      (catalog.meditationItems || []).forEach((i) => {
        const price = Number(i.price || 0);
        const label = price > 0 ? `${i.name} (₹${price})` : i.name;
        pushOption(`meditation:${i.id}`, label, price);
      });
    } else if (platform === 'content') {
      (catalog.bookItems || []).forEach((i) => {
        const price = Number(i.price || 0);
        const label = price > 0 ? `${i.name} (₹${price})` : i.name;
        pushOption(`content:${i.id}`, label, price);
      });
    } else if (platform === 'tourism') {
      (catalog.tourItems || []).forEach((i) => {
        const price = Number(i.price || 0);
        const label = price > 0 ? `${i.name} (₹${price})` : i.name;
        pushOption(`tour:${i.id}`, label, price);
      });
    }

    return opts;
  };

  const fillOptions = (options) => {
    serviceSelect.innerHTML = '<option value="">Select a service</option>';
    options.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      optionEl.dataset.price = String(opt.price || 0);
      serviceSelect.appendChild(optionEl);
    });
    setAmount(0);
    if (serviceLabelInput) serviceLabelInput.value = '';
  };

  const updateServiceLabel = () => {
    const selected = serviceSelect.selectedOptions[0];
    if (!selected) return;
    const price = Number(selected.dataset.price || 0);
    setAmount(price);
    if (serviceLabelInput) serviceLabelInput.value = selected.textContent || '';
    if (selectedNote) {
      const label = selected.textContent || '—';
      selectedNote.textContent = `Selected item: ${label}`;
      selectedNote.style.display = label ? 'block' : 'none';
    }
  };

  const setPlatform = (value) => {
    if (!value) return;
    if (platformSelect) {
      platformSelect.value = value;
    }
    platformRadios.forEach((radio) => {
      radio.checked = radio.value === value;
    });
  };

  fetch('/api/catalog')
    .then((res) => res.json())
    .then((catalog) => {
      const updateFromPlatform = () => {
        const platform = getSelectedPlatform();
        const options = buildOptions(catalog, platform);
        fillOptions(options);
        if (selectedNote) {
          if (options.length) {
            selectedNote.textContent = 'Available options:';
            selectedNote.style.display = 'block';
          } else {
            selectedNote.textContent = '';
            selectedNote.style.display = 'none';
          }
        }
        if (optionsWrap) {
          optionsWrap.innerHTML = '';
          options.forEach((opt, idx) => {
            const id = `opt-${platform}-${idx}`;
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'platform-option';
            input.id = id;
            input.value = opt.value;
            const label = document.createElement('label');
            label.setAttribute('for', id);
            label.textContent = opt.label;
            input.addEventListener('change', () => {
              serviceSelect.value = opt.value;
              updateServiceLabel();
            });
            optionsWrap.appendChild(input);
            optionsWrap.appendChild(label);
          });
        }
      };

      if (platformSelect) {
        platformSelect.addEventListener('change', updateFromPlatform);
      }
      platformRadios.forEach((radio) => {
        radio.addEventListener('change', updateFromPlatform);
      });
      serviceSelect.addEventListener('change', updateServiceLabel);

      if (prePlatform) {
        setPlatform(prePlatform);
      }
      updateFromPlatform();

      if (preServiceId) {
        serviceSelect.value = preServiceId;
        updateServiceLabel();
      } else if (preLabel) {
        if (serviceLabelInput) serviceLabelInput.value = preLabel;
        if (selectedNote) {
          selectedNote.textContent = `Selected item: ${preLabel}`;
          selectedNote.style.display = preLabel ? 'block' : 'none';
        }
      }
      if (preAmount) {
        setAmount(Number(preAmount));
      }
    })
    .catch(() => {
      // ignore catalog load failures
    });
}

// --- PAYMENTS (STRIPE + RAZORPAY) ---
let paymentConfigCache = null;

async function getPaymentConfig() {
  if (paymentConfigCache) return paymentConfigCache;
  try {
    const res = await fetch('/api/payments/config');
    if (!res.ok) return {};
    paymentConfigCache = await res.json();
    return paymentConfigCache || {};
  } catch (err) {
    return {};
  }
}

async function startStripeCheckout(amount) {
  const payload = {
    amount,
    currency: 'INR',
    description: 'Divya Darshan Booking',
    success_url: window.location.href.split('#')[0] + '?payment=success',
    cancel_url: window.location.href.split('#')[0] + '?payment=cancelled',
  };

  try {
    const res = await fetch('/api/payments/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Stripe checkout failed.');
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    } else {
      showToast('Stripe checkout URL not available.');
    }
  } catch (err) {
    showToast('Stripe checkout failed.');
  }
}

async function startRazorpayCheckout(amount) {
  const config = await getPaymentConfig();
  if (!config.razorpayKeyId) {
    showToast('Razorpay is not configured.');
    return;
  }

  if (typeof Razorpay === 'undefined') {
    showToast('Razorpay SDK not loaded.');
    return;
  }

  try {
    const res = await fetch('/api/payments/razorpay/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: `dd_${Date.now()}`,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.order) {
      showToast(data.error || 'Razorpay order failed.');
      return;
    }

    const options = {
      key: config.razorpayKeyId,
      amount: data.order.amount,
      currency: data.order.currency,
      name: 'Divya Darshan',
      description: 'Booking payment',
      order_id: data.order.id,
      handler: function () {
        showToast('Payment successful!');
      },
      theme: { color: '#D4AF37' },
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (err) {
    showToast('Razorpay payment failed.');
  }
}

// --- TOAST NOTIFICATION ---
function showToast(message, type = 'default') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// --- GLOBAL HANDLERS (called from HTML) ---
window.handleAddToCart = function (name, price, emoji) {
  addToCart(name, price, emoji);
};

window.handleWishlist = function (btn, id, name) {
  if (wishlist.has(id)) {
    wishlist.delete(id);
    btn.textContent = '🤍';
    showToast(`Removed "${name}" from wishlist`);
  } else {
    wishlist.add(id);
    btn.textContent = '❤️';
    showToast(`Added "${name}" to wishlist!`);
  }
};

window.handleBookSession = function (name) {
  showToast(`✨ Booking session with ${name}...`);
};

window.handleEnrollCourse = function (name) {
  showToast(`📚 Enrolling in "${name}"...`);
};

window.handleBookTour = function (name) {
  showToast(`✈️ Booking "${name}" tour...`);
};

window.selectConsultOption = function (btn) {
  const wrap = btn.closest('.consult-actions');
  if (!wrap) return;
  wrap.querySelectorAll('.consult-option').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  wrap.dataset.selectedMethod = btn.dataset.method || 'chat';
};

window.bookAstrologer = function (astroId, name) {
  const wrap = document.querySelector(`.consult-actions[data-astro="${astroId}"]`);
  const method = wrap?.dataset.selectedMethod || 'chat';
  const label = `${name} (${method})`;
  const url = `/booking.html?platform=astrotalks&serviceId=astro:${astroId}&serviceLabel=${encodeURIComponent(label)}`;
  window.location.href = url;
};

async function handleBookingSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const data = new FormData(form);
  const name = data.get('fullName') || 'Seeker';
  const platformLabels = {
    astrotalks: 'Astrotalks Platform',
    merchandise: 'Spiritual Merchandise Store',
    meditation: 'Meditation / Yoga Platform',
    content: 'Devotional Books & Podcasts',
    tourism: 'Devotional Tourism',
    store: 'Spiritual Merchandise Store',
  };

  const platform = platformLabels[data.get('platform')] || data.get('platform') || 'Divya Darshan platform';
  const service = data.get('serviceDetails');
  const serviceText = service ? ` (${service})` : '';
  const amount = Number(data.get('amount') || 0);
  const emiTenure = data.get('emiTenure') || null;
  const paymentGateway = data.get('paymentGateway') || 'stripe';

  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Please enter a valid amount.');
    return;
  }

  const payload = {
    fullName: data.get('fullName'),
    email: data.get('email'),
    phone: data.get('phone'),
    preferredDate: data.get('preferredDate'),
    platform: data.get('platform'),
    serviceId: data.get('serviceId'),
    serviceDetails: data.get('serviceDetails'),
    notes: data.get('notes'),
    paymentOption: data.get('paymentOption'),
    paymentGateway,
    amount,
    emiTenure,
    returnUrl: window.location.href.split('#')[0],
  };

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) {
      showToast(result.error || 'Unable to start payment.');
      return;
    }

    if (result.gateway === 'stripe' && result.checkoutUrl) {
      showToast(`Redirecting to Stripe for ${platform}${serviceText}...`);
      window.location.href = result.checkoutUrl;
      return;
    }

    if (result.gateway === 'razorpay' && result.order) {
      if (typeof Razorpay === 'undefined') {
        showToast('Razorpay SDK not loaded.');
        return;
      }

      const config = await getPaymentConfig();
      if (!config.razorpayKeyId) {
        showToast('Razorpay is not configured.');
        return;
      }

      const options = {
        key: config.razorpayKeyId,
        amount: result.order.amount,
        currency: result.order.currency,
        name: 'Divya Darshan',
        description: `Booking #${result.bookingId}`,
        order_id: result.order.id,
        handler: async function (response) {
          try {
            await fetch('/api/payments/razorpay/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                bookingId: result.bookingId,
                paymentId: result.paymentId,
                providerPaymentId: response.razorpay_payment_id,
              }),
            });
          } catch (err) {
            // ignore
          }
          showToast('Payment successful!');
          form.reset();
        },
        theme: { color: '#D4AF37' },
      };

      const rzp = new Razorpay(options);
      rzp.open();
      return;
    }

    showToast(`?? ${name}, we received your ${platform}${serviceText} booking request.`);
    form.reset();
  } catch (err) {
    showToast('Unable to start payment.');
  }
}

window.handleBookingSubmit = handleBookingSubmit;

window.handleNewsletterSubmit = function (e) {
  e.preventDefault();
  const input = e.target.querySelector('input[type="email"]');
  if (input && input.value) {
    showToast('🙏 Thank you for subscribing!');
    input.value = '';
  } else {
    showToast('Please enter a valid email address');
  }
};

