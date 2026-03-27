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

  if (!menuBtn || !mobileNav) return;

  menuBtn.addEventListener('click', () => {
    mobileNav.classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  const closeMobileNav = () => {
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
  };

  if (closeBtn) closeBtn.addEventListener('click', closeMobileNav);

  // Close on outside click
  mobileNav.addEventListener('click', (e) => {
    if (e.target === mobileNav) closeMobileNav();
  });

  // Close nav links on click
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileNav);
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

function handleBookingSubmit(event) {
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
  };
  const payments = {
    full: 'Pay full amount',
    advance: 'Pay advance',
    emi: 'EMI option',
  };

  const platform = platformLabels[data.get('platform')] || 'Divya Darshan platform';
  const payment = payments[data.get('paymentOption')] || 'Pay full amount';
  const service = data.get('serviceDetails');
  const serviceText = service ? ` (${service})` : '';
  showToast(`🙏 ${name}, we received your ${platform}${serviceText} booking request with ${payment}.`);
  form.reset();
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
