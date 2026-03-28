const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const https = require('https');
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '..');
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'data.db');
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret';
const NODE_ENV = process.env.NODE_ENV || 'development';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLIC_KEY = process.env.STRIPE_PUBLIC_KEY || '';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const TIDIO_PUBLIC_KEY = process.env.TIDIO_PUBLIC_KEY || '';
const TIDIO_WEBHOOK_SECRET = process.env.TIDIO_WEBHOOK_SECRET || '';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const app = express();
const db = new Database(DB_PATH);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
app.use('/images', express.static(path.join(ROOT_DIR, 'images')));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    env: NODE_ENV,
    dbPath: DB_PATH,
    now: new Date().toISOString(),
  });
});

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      html TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cms_admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS astrologers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      photo_url TEXT,
      specialization TEXT,
      years_experience INTEGER,
      languages TEXT,
      rating REAL,
      price_per_minute REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      price REAL,
      image_url TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meditation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      duration_minutes INTEGER,
      level TEXT,
      price REAL,
      image_url TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      format TEXT,
      price REAL,
      image_url TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tour_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      destination TEXT,
      duration_days INTEGER,
      price REAL,
      image_url TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      preferred_date TEXT,
      platform TEXT,
      service_details TEXT,
      notes TEXT,
      total_amount REAL NOT NULL,
      payment_amount REAL NOT NULL,
      payment_option TEXT NOT NULL,
      payment_gateway TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      gateway TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      provider_order_id TEXT,
      provider_payment_id TEXT,
      emi_tenure INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );
  `);
}

function ensureColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function listHtmlFiles() {
  return fs.readdirSync(ROOT_DIR)
    .filter((file) => file.endsWith('.html'));
}

function seedPages() {
  const pageFiles = listHtmlFiles();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO pages (slug, title, html, updated_at)
     VALUES (@slug, @title, @html, @updated_at)`
  );

  pageFiles.forEach((file) => {
    const filePath = path.join(ROOT_DIR, file);
    const html = fs.readFileSync(filePath, 'utf8');
    const slug = file.replace('.html', '');
    insert.run({
      slug,
      title: slug.charAt(0).toUpperCase() + slug.slice(1),
      html,
      updated_at: new Date().toISOString(),
    });
  });
}

function hasAdmin() {
  const row = db.prepare('SELECT id FROM admins LIMIT 1').get();
  return Boolean(row);
}

function hasCmsAdmin() {
  const row = db.prepare('SELECT id FROM cms_admins LIMIT 1').get();
  return Boolean(row);
}

function requireAuth(req, res, next) {
  if (!req.session.adminId) {
    return res.redirect('/admin/login');
  }
  return next();
}

function requireCmsAuth(req, res, next) {
  if (!req.session.cmsAdminId) {
    return res.redirect('/cms/login');
  }
  return next();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (s) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
  ));
}

function escapeJsString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderAstrologerCards(astrologers) {
  return astrologers.map((astro) => {
    const name = escapeHtml(astro.name);
    const jsName = escapeJsString(astro.name);
    const spec = escapeHtml(astro.specialization || 'Astrology');
    const exp = astro.years_experience != null ? `${astro.years_experience} Years` : '—';
    const langs = escapeHtml(astro.languages || '—');
    const rating = astro.rating != null ? Number(astro.rating).toFixed(1) : '—';
    const price = astro.price_per_minute != null ? `₹${astro.price_per_minute}` : '—';
    const photo = escapeHtml(
      astro.photo_url || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=200&q=80'
    );

    return `
          <article class="astrologer-full-card fade-up" aria-label="${name}">
            <div class="card-top">
              <div class="astrologer-photo">
                <img src="${photo}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                <span class="online-dot" title="Online"></span>
              </div>
              <div class="astrologer-info">
                <h3>${name}</h3>
                <span class="spec-tag">${spec}</span>
                <div class="rating-row">
                  <span class="rating-badge">${rating}</span>
                  <span>★★★★★</span>
                  <span class="review-cnt">(— reviews)</span>
                </div>
              </div>
            </div>
            <div class="astrologer-details">
              <div class="detail-item">Experience<strong>${exp}</strong></div>
              <div class="detail-item">Languages<strong>${langs}</strong></div>
              <div class="detail-item">Sessions<strong>—</strong></div>
              <div class="detail-item">Joined<strong>—</strong></div>
            </div>
            <div class="price-per-min">${price} <span>/minute</span></div>
            <div class="consult-actions">
              <button class="consult-btn" onclick="handleBookSession('${jsName}', 'chat')">
                <span class="cb-icon">💬</span> Chat
              </button>
              <button class="consult-btn" onclick="handleBookSession('${jsName}', 'audio')">
                <span class="cb-icon">📞</span> Audio
              </button>
              <button class="consult-btn" onclick="handleBookSession('${jsName}', 'video')">
                <span class="cb-icon">📹</span> Video
              </button>
            </div>
          </article>`;
  }).join('\n');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatRupee(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return `&#8377;${amount.toLocaleString('en-IN')}`;
}

function computePaymentAmount(total, option, emiTenure) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (option === 'advance') return Math.round(total * 0.3);
  if (option === 'emi') {
    const tenure = Number.parseInt(emiTenure, 10);
    const months = Number.isFinite(tenure) && tenure > 0 ? tenure : 3;
    return Math.round(total / months);
  }
  return Math.round(total);
}

function renderStoreCards(items) {
  return items.map((item) => {
    const name = escapeHtml(item.name);
    const jsName = escapeJsString(item.name);
    const categoryLabel = escapeHtml(item.category || 'Spiritual Products');
    const categorySlug = slugify(item.category || 'all');
    const price = item.price != null ? Number(item.price) : 0;
    const priceLabel = `₹${price.toLocaleString('en-IN')}`;
    const image = escapeHtml(
      item.image_url || 'https://images.unsplash.com/photo-1616428315126-d3a8e4e0a9e9?auto=format&fit=crop&w=600&q=80'
    );

    return `
          <article class="product-card fade-up" role="listitem" data-category="${categorySlug}">
            <div class="product-image" aria-hidden="true">
              <img src="${image}" alt="${name}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
              <span class="product-badge">New</span>
              <button class="product-wishlist" aria-label="Add ${name} to wishlist" onclick="handleWishlist(this, '${jsName}')">🤍</button>
              <div class="product-overlay">
                <button class="btn btn-primary btn-sm" onclick="showToast('👁️ Quick View: ${name}')">Quick View</button>
              </div>
            </div>
            <div class="product-info">
              <div class="product-category">${categoryLabel}</div>
              <h3 class="product-name">${name}</h3>
              <div class="product-rating">
                <span>⭐⭐⭐⭐⭐</span>
                <span style="font-weight:700;">4.8</span>
                <span class="review-count">(— reviews)</span>
              </div>
              <div class="product-price">
                <span class="price-current">${priceLabel}</span>
              </div>
              <button class="btn btn-primary" style="width:100%;" onclick="handleAddToCart('${jsName}', ${price})">
                🛒 Add to Cart
              </button>
            </div>
          </article>`;
  }).join('\n');
}

function renderMeditationCards(items) {
  return items.map((item) => {
    const title = escapeHtml(item.title);
    const jsTitle = escapeJsString(item.title);
    const category = escapeHtml(item.category || 'Meditation');
    const level = escapeHtml(item.level || 'Beginner');
    const duration = item.duration_minutes != null ? `${item.duration_minutes} min` : '—';
    const price = item.price != null ? Number(item.price) : 0;
    const pricing = price > 0 ? 'paid' : 'free';
    const format = 'recorded';
    const typeSlug = slugify(item.category || 'meditation');
    const image = escapeHtml(
      item.image_url || 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80'
    );
    const priceLabel = price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free';
    const priceClass = price > 0 ? 'course-price-paid' : 'course-price-free';

    return `
          <article class="course-card fade-up" data-type="${typeSlug}" data-pricing="${pricing}" data-format="${format}" aria-label="${title}">
            <div class="course-thumbnail">
              <img src="${image}" alt="${title}" loading="lazy" />
              <span class="course-level">${level}</span>
              <div class="course-play-btn" aria-hidden="true">▶</div>
            </div>
            <div class="course-info">
              <div class="course-category">${category}</div>
              <h3 class="course-title">${title}</h3>
              <div class="course-instructor">
                <div class="instructor-avatar">
                  <img src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=160&q=80" alt="Instructor" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
                </div>
                <span>Divya Darshan</span>
              </div>
              <div class="course-meta">
                <span>⭐ 4.8</span>
                <span>👥 — students</span>
                <span>⏱ ${duration}</span>
              </div>
              <div class="course-footer">
                <span class="${priceClass}">${priceLabel}</span>
                <button class="btn btn-primary btn-sm" onclick="handleEnroll('${jsTitle}')">Enroll Now</button>
              </div>
            </div>
          </article>`;
  }).join('\n');
}

function renderBookCards(items, type) {
  return items.map((item) => {
    const title = escapeHtml(item.title);
    const jsTitle = escapeJsString(item.title);
    const author = escapeHtml(item.author || 'Divya Darshan');
    const format = escapeHtml(item.format || 'Book');
    const image = escapeHtml(
      item.image_url || (type === 'popular'
        ? 'https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=120&q=80'
        : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80')
    );

    if (type === 'popular') {
      return `
        <article class="popular-item-card fade-up" aria-label="${title}">
          <img class="popular-item-thumb" src="${image}" alt="${title}" loading="lazy" />
          <div class="popular-item-info">
            <div class="popular-item-title">${title}</div>
            <div class="popular-item-author">${author}</div>
            <div class="popular-item-duration">⏱ — · 📚 ${format}</div>
          </div>
          <button class="popular-item-play" onclick="playContent('${jsTitle}')" aria-label="Play ${title}">▶</button>
        </article>`;
    }

    return `
      <article class="content-card fade-up" aria-label="${title}">
        <div class="content-card-cover">
          <img src="${image}" alt="${title} cover" loading="lazy" />
          <span class="category-badge">${format}</span>
          <div class="content-card-play-overlay" aria-hidden="true">
            <button class="play-circle-btn" onclick="playContent('${jsTitle}')">▶</button>
          </div>
        </div>
        <div class="content-card-body">
          <div class="content-card-title">${title}</div>
          <div class="content-card-author">by ${author}</div>
          <div class="content-card-meta">
            <span class="content-card-duration">⏱ —</span>
            <button class="content-card-action" onclick="playContent('${jsTitle}')" aria-label="Play ${title}">▶</button>
          </div>
        </div>
      </article>`;
  }).join('\n');
}

function renderTourCards(items) {
  return items.map((item) => {
    const title = escapeHtml(item.title);
    const jsTitle = escapeJsString(item.title);
    const destination = escapeHtml(item.destination || 'India');
    const days = item.duration_days != null ? `${item.duration_days} Days` : '—';
    const price = item.price != null ? Number(item.price) : 0;
    const priceLabel = `₹${price.toLocaleString('en-IN')}`;
    const image = escapeHtml(
      item.image_url || 'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=600&q=80'
    );
    const desc = escapeHtml(item.description || 'Curated spiritual journey with expert guides and seamless stays.');
    const type = 'pilgrimage';

    return `
          <article class="tour-card fade-up" data-type="${type}" aria-label="${title}">
            <div class="tour-card-img">
              <img src="${image}" alt="${title}" loading="lazy" />
              <span class="dest-badge">${destination}</span>
            </div>
            <div class="tour-card-body">
              <h3>🕉️ ${title}</h3>
              <div class="tour-meta-row">
                <span>⏱️ ${days}</span>
                <span>👥 Group &amp; Private</span>
              </div>
              <div class="tour-rating">
                <span class="rating-val">★4.8</span>
                <span class="review-cnt">(— reviews)</span>
              </div>
              <div class="tour-price-row">
                <span class="tour-price">${priceLabel}</span>
                <span class="tour-price-label">per person</span>
              </div>
              <div class="tour-emi">💳 EMI from ₹${Math.max(0, Math.round(price / 12)).toLocaleString('en-IN')}/month</div>
            </div>
            <div class="itinerary-accordion">
              <button class="itinerary-toggle" onclick="toggleItinerary(this)" aria-expanded="false">📋 View Itinerary <span class="acc-icon">▾</span></button>
              <div class="itinerary-body">
                <ul><li>${desc}</li></ul>
              </div>
            </div>
            <div class="tour-card-footer">
              <button class="tour-book-btn" onclick="bookTour('${jsTitle}')">Book Now</button>
            </div>
          </article>`;
  }).join('\n');
}

function renderHomeAstrologerCards(items) {
  return items.map((astro) => {
    const name = escapeHtml(astro.name);
    const jsName = escapeJsString(astro.name);
    const spec = escapeHtml(astro.specialization || 'Astrology');
    const exp = astro.years_experience != null ? `${astro.years_experience} yrs exp` : 'N/A';
    const langs = escapeHtml(astro.languages || 'N/A');
    const rating = astro.rating != null ? Number(astro.rating).toFixed(1) : '4.8';
    const price = astro.price_per_minute != null ? formatRupee(Number(astro.price_per_minute)) : 'N/A';
    const photo = escapeHtml(
      astro.photo_url || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=200&q=80'
    );
    const statusClass = astro.is_active ? '' : ' offline';

    return `
        <div class="astrologer-card fade-up">
          <div class="astrologer-avatar">
            <img src="${photo}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />
            <div class="astrologer-status${statusClass}" title="${astro.is_active ? 'Online' : 'Offline'}"></div>
          </div>
          <h4>${name}</h4>
          <div class="astrologer-specialization">${spec}</div>
          <div class="astrologer-meta">
            <span class="exp">&#9201; ${exp}</span>
            <span>&#128483; ${langs}</span>
          </div>
          <div class="astrologer-meta" style="margin-bottom: 8px;">
            <span class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <span class="rating-value">${rating}</span>
            <span style="color: var(--color-text-light)">(0 reviews)</span>
          </div>
          <div class="astrologer-price">${price} <span>/minute</span></div>
          <div class="astrologer-actions">
            <button class="btn btn-secondary btn-sm" onclick="handleBookSession('${jsName}')">&#128172; Chat</button>
            <button class="btn btn-primary btn-sm" onclick="handleBookSession('${jsName}')">&#128222; Call</button>
          </div>
        </div>`;
  }).join('\n');
}

function renderHomeStoreCards(items) {
  return items.map((item) => {
    const name = escapeHtml(item.name);
    const jsName = escapeJsString(item.name);
    const categoryLabel = escapeHtml(item.category || 'Spiritual Products');
    const categorySlug = slugify(item.category || 'all');
    const price = Number(item.price) || 0;
    const originalPrice = price > 0 ? Math.round(price * 1.25) : 0;
    const discount = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
    const priceLabel = formatRupee(price);
    const originalLabel = formatRupee(originalPrice);
    const badge = discount > 0 ? `-${discount}% OFF` : 'NEW';
    const image = escapeHtml(
      item.image_url || 'https://images.unsplash.com/photo-1616428315126-d3a8e4e0a9e9?auto=format&fit=crop&w=600&q=80'
    );

    return `
        <div class="product-card fade-up" data-category="${categorySlug}">
          <div class="product-image">
            <img src="${image}" alt="${name}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
            <div class="product-badge">${badge}</div>
            <button class="product-wishlist" data-id="prod-${item.id || categorySlug}" onclick="handleWishlist(this, 'prod-${item.id || categorySlug}', '${jsName}')" aria-label="Add to wishlist">ðŸ¤</button>
            <div class="product-overlay">
              <button class="btn btn-primary btn-sm" onclick="handleAddToCart('${jsName}', ${price}, '&#128722;')">Enquiry Now</button>
            </div>
          </div>
          <div class="product-info">
            <div class="product-category">${categoryLabel}</div>
            <div class="product-name">${name}</div>
            <div class="product-rating">
              <span class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
              <span class="rating-value">4.8</span>
              <span class="review-count">(&mdash; reviews)</span>
            </div>
            <div class="product-price">
              <span class="price-current">${priceLabel}</span>
              ${originalPrice ? `<span class="price-original">${originalLabel}</span><span class="price-discount">-${discount}%</span>` : ''}
            </div>
            <button class="btn btn-primary" style="width:100%; justify-content:center;" onclick="document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });">
              &#128722; Enquiry Now
            </button>
          </div>
        </div>`;
  }).join('\n');
}

function renderHomeCourseCards(items) {
  return items.map((item) => {
    const title = escapeHtml(item.title);
    const jsTitle = escapeJsString(item.title);
    const category = escapeHtml(item.category || 'Meditation');
    const level = escapeHtml(item.level || 'Beginner');
    const durationMinutes = Number(item.duration_minutes);
    const durationHours = Number.isFinite(durationMinutes) ? Math.round(durationMinutes / 60) : null;
    const durationLabel = durationHours ? `${durationHours} hours` : '&mdash; hours';
    const price = Number(item.price) || 0;
    const isFree = price <= 0;
    const priceLabel = isFree ? 'FREE' : formatRupee(price);
    const priceClass = isFree ? 'course-price-free' : 'price-current';
    const image = escapeHtml(
      item.image_url || 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80'
    );

    return `
        <div class="course-card fade-up" data-type="${isFree ? 'free' : 'paid'}">
          <div class="course-thumbnail">
            <img src="${image}" alt="${title}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
            <div class="course-level">${level}</div>
            <div class="course-play-btn">â–¶</div>
          </div>
          <div class="course-info">
            <div class="course-category">${category}</div>
            <div class="course-title">${title}</div>
            <div class="course-instructor">
              <div class="instructor-avatar">DD</div>
              <span>Divya Darshan</span>
            </div>
            <div class="course-meta">
              <span>&#9201; ${durationLabel}</span>
              <span>&#128214; &mdash; lessons</span>
              <span class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
              <span>4.8</span>
            </div>
            <div class="course-footer">
              <span class="${priceClass}">${priceLabel}</span>
              <span class="course-students">&#128101; &mdash; students</span>
            </div>
            <button class="btn btn-primary" style="width:100%; justify-content:center; margin-top:12px;" onclick="handleEnrollCourse('${jsTitle}')">
              ${isFree ? 'Enroll Free' : 'Enroll Now'}
            </button>
          </div>
        </div>`;
  }).join('\n');
}

function renderHomeTourCards(items) {
  return items.map((item) => {
    const title = escapeHtml(item.title);
    const jsTitle = escapeJsString(item.title);
    const destination = escapeHtml(item.destination || 'India');
    const days = Number(item.duration_days) || 0;
    const nights = days > 0 ? Math.max(0, days - 1) : 0;
    const durationLabel = days ? `${days} Days / ${nights} Nights` : '&mdash; Days';
    const price = Number(item.price) || 0;
    const priceLabel = formatRupee(price);
    const image = escapeHtml(
      item.image_url || 'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=600&q=80'
    );
    const desc = escapeHtml(item.description || 'Curated spiritual journey with expert guides.');
    const emi = price > 0 ? formatRupee(Math.max(1, Math.round(price / 12))) : 'â€”';

    return `
        <div class="tour-card fade-up">
          <div class="tour-image">
            <img src="${image}" alt="${title}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" />
            <div class="tour-badge">âœ¨ Featured</div>
          </div>
          <div class="tour-info">
            <div class="tour-destination">${destination}</div>
            <div class="tour-title">${title}</div>
            <div class="tour-meta">
              <span>&#128197; ${durationLabel}</span>
              <span>&#128101; Group &amp; Private</span>
            </div>
            <div class="tour-meta">
              <span class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
              <span class="rating-value">4.8</span>
              <span style="color: var(--color-text-light)">(0 bookings)</span>
            </div>
            <div class="tour-footer">
              <div class="tour-price">
                ${priceLabel}
                <small>Per person (incl. GST)</small>
              </div>
              <button class="btn btn-primary btn-sm" onclick="handleBookTour('${jsTitle}')">Book Now</button>
            </div>
            <div class="tour-details-grid">
              <div>
                <strong>Duration</strong>
                <p>${durationLabel}</p>
              </div>
              <div>
                <strong>Pricing</strong>
                <p>${priceLabel} per person (includes accommodation, transfers, meals)</p>
              </div>
            </div>
            <div class="tour-itinerary">
              <strong>Itinerary</strong>
              <ul>
                <li>${desc}</li>
                <li>Day 2 &middot; Guided rituals and temple visits</li>
                <li>Day 3 &middot; Closing prayers and departure</li>
              </ul>
            </div>
            <div class="tour-gallery" aria-label="${title} gallery">
              <span class="tour-gallery-thumb" style="background-image:url('${image}')"></span>
              <span class="tour-gallery-thumb" style="background-image:url('${image}')"></span>
              <span class="tour-gallery-thumb" style="background-image:url('${image}')"></span>
            </div>
            <div class="tour-emi">EMI from ${emi}/month</div>
          </div>
        </div>`;
  }).join('\n');
}

function parsePage(query) {
  const page = Number.parseInt(query.page, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function paginate(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return { slice, total, totalPages, page: safePage };
}

function renderPagination(basePath, page, totalPages) {
  if (totalPages <= 1) return '';
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const ordered = Array.from(pages).filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const parts = [];
  const addLink = (p, label, isActive) => {
    const href = `${basePath}?page=${p}`;
    const cls = `page-btn${isActive ? ' active' : ''}`;
    const aria = isActive ? ' aria-current="page"' : '';
    return `<a class="${cls}" href="${href}"${aria}>${label}</a>`;
  };
  const prev = page > 1 ? addLink(page - 1, '‹', false) : '<span class="page-btn" style="opacity:0.4;cursor:not-allowed;">‹</span>';
  const next = page < totalPages ? addLink(page + 1, '›', false) : '<span class="page-btn" style="opacity:0.4;cursor:not-allowed;">›</span>';

  let last = 0;
  ordered.forEach((p) => {
    if (p - last > 1) {
      parts.push('<span style="padding:0 4px;color:var(--color-text-light);font-size:14px;">…</span>');
    }
    parts.push(addLink(p, String(p), p === page));
    last = p;
  });

  return `
        <nav class="pagination" aria-label="Pagination" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:40px;flex-wrap:wrap;">
          ${prev}
          ${parts.join('\n          ')}
          ${next}
        </nav>`;
}

function replaceOptionCount(html, labelText, count) {
  const escaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${escaped}\\s*<span class="option-count">)(\\d+)(</span>)`, 'g');
  return html.replace(pattern, `$1${count}$3`);
}

function injectTidio(html) {
  if (!TIDIO_PUBLIC_KEY || html.includes('tidio.co')) return html;
  const scriptTag = `<script src="https://code.tidio.co/${TIDIO_PUBLIC_KEY}.js" async></script>`;
  if (html.includes('</body>')) {
    return html.replace('</body>', `  ${scriptTag}\n</body>`);
  }
  return `${html}\n${scriptTag}`;
}

function postForm(url, formBody, authToken) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: authToken,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formBody),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode || 200, data: json });
          } catch (err) {
            reject(new Error(`Invalid JSON response (${res.statusCode}): ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(formBody);
    req.end();
  });
}

function postJson(url, body, authToken) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: authToken,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode || 200, data: json });
          } catch (err) {
            reject(new Error(`Invalid JSON response (${res.statusCode}): ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

initDb();
ensureColumn('bookings', 'emi_tenure', 'INTEGER');
ensureColumn('bookings', 'service_id', 'TEXT');
ensureColumn('payments', 'emi_tenure', 'INTEGER');
seedPages();

app.get('/admin/setup', (req, res) => {
  if (hasAdmin()) return res.redirect('/admin/login');
  res.render('setup');
});

app.post('/admin/setup', async (req, res) => {
  if (hasAdmin()) return res.redirect('/admin/login');
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.render('setup', { error: 'Provide a username and a password (min 6 chars).' });
  }
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare(
    'INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(username, password_hash, new Date().toISOString());
  res.redirect('/admin/login');
});

app.get('/admin/login', (req, res) => {
  if (!hasAdmin()) return res.redirect('/admin/setup');
  res.render('login');
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin) return res.render('login', { error: 'Invalid credentials.' });
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.render('login', { error: 'Invalid credentials.' });
  req.session.adminId = admin.id;
  res.redirect('/admin');
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAuth, (req, res) => {
  seedPages();
  const pages = db.prepare('SELECT slug, title, updated_at FROM pages ORDER BY slug').all();
  res.render('dashboard', { pages });
});

app.get('/api/payments/config', (req, res) => {
  res.json({
    stripePublicKey: STRIPE_PUBLIC_KEY,
    razorpayKeyId: RAZORPAY_KEY_ID,
  });
});

app.get('/api/catalog', (req, res) => {
  const astrologers = db.prepare(
    'SELECT id, name, price_per_minute FROM astrologers WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  const storeItems = db.prepare(
    'SELECT id, name, price FROM store_items WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  const meditationItems = db.prepare(
    'SELECT id, title as name, price FROM meditation_items WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  const bookItems = db.prepare(
    'SELECT id, title as name, price FROM book_items WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  const tourItems = db.prepare(
    'SELECT id, title as name, price FROM tour_packages WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();

  res.json({
    astrologers,
    storeItems,
    meditationItems,
    bookItems,
    tourItems,
  });
});

app.post('/api/bookings', async (req, res) => {
  const payload = req.body || {};
  const fullName = String(payload.fullName || '').trim();
  const email = String(payload.email || '').trim();
  const phone = String(payload.phone || '').trim();
  const preferredDate = String(payload.preferredDate || '').trim();
  const platform = String(payload.platform || '').trim();
  const serviceId = String(payload.serviceId || '').trim();
  const serviceDetails = String(payload.serviceDetails || '').trim();
  const notes = String(payload.notes || '').trim();
  const paymentOption = String(payload.paymentOption || 'full');
  const paymentGateway = String(payload.paymentGateway || '').trim() || 'stripe';
  const totalAmount = Number(payload.amount || 0);
  const emiTenure = payload.emiTenure != null ? Number.parseInt(payload.emiTenure, 10) : null;
  const paymentAmount = computePaymentAmount(totalAmount, paymentOption, emiTenure);

  if (!fullName || !email || !phone) {
    return res.status(400).json({ error: 'Name, email, and phone are required.' });
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0.' });
  }
  if (!paymentAmount || paymentAmount <= 0) {
    return res.status(400).json({ error: 'Payment amount is invalid.' });
  }

  if (paymentGateway === 'stripe' && !STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe is not configured.' });
  }
  if (paymentGateway === 'razorpay' && (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET)) {
    return res.status(400).json({ error: 'Razorpay is not configured.' });
  }

  const now = new Date().toISOString();
  const bookingStmt = db.prepare(`
    INSERT INTO bookings (
      full_name, email, phone, preferred_date, platform, service_id, service_details, notes,
      total_amount, payment_amount, payment_option, payment_gateway, status, emi_tenure, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const bookingInfo = bookingStmt.run(
    fullName,
    email,
    phone,
    preferredDate,
    platform,
    serviceId,
    serviceDetails,
    notes,
    totalAmount,
    paymentAmount,
    paymentOption,
    paymentGateway,
    'pending',
    emiTenure,
    now,
    now
  );
  const bookingId = bookingInfo.lastInsertRowid;

  const paymentStmt = db.prepare(`
    INSERT INTO payments (booking_id, gateway, amount, status, emi_tenure, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const paymentInfo = paymentStmt.run(
    bookingId,
    paymentGateway,
    paymentAmount,
    'pending',
    emiTenure,
    now,
    now
  );
  const paymentId = paymentInfo.lastInsertRowid;

  const returnUrl = String(payload.returnUrl || `${req.protocol}://${req.get('host')}/index.html`);

  if (paymentGateway === 'stripe') {
    const formBody = new URLSearchParams({
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/payments/stripe/success?booking_id=${bookingId}&payment_id=${paymentId}&return=${encodeURIComponent(returnUrl)}`,
      cancel_url: `${req.protocol}://${req.get('host')}/payments/stripe/cancel?booking_id=${bookingId}&payment_id=${paymentId}&return=${encodeURIComponent(returnUrl)}`,
      'line_items[0][price_data][currency]': 'inr',
      'line_items[0][price_data][product_data][name]': `Divya Darshan Booking #${bookingId}`,
      'line_items[0][price_data][unit_amount]': String(Math.round(paymentAmount * 100)),
      'line_items[0][quantity]': '1',
    }).toString();

    try {
      const auth = `Bearer ${STRIPE_SECRET_KEY}`;
      const result = await postForm('https://api.stripe.com/v1/checkout/sessions', formBody, auth);
      if (result.status >= 400 || !result.data.url) {
        return res.status(400).json({ error: result.data.error || 'Stripe request failed.' });
      }
      return res.json({
        bookingId,
        paymentId,
        gateway: 'stripe',
        checkoutUrl: result.data.url,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const auth = `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`;
    const result = await postJson('https://api.razorpay.com/v1/orders', {
      amount: Math.round(paymentAmount * 100),
      currency: 'INR',
      receipt: `dd_${bookingId}_${paymentId}`,
      payment_capture: 1,
      notes: { bookingId: String(bookingId), paymentId: String(paymentId) },
    }, auth);
    if (result.status >= 400 || !result.data.id) {
      return res.status(400).json({ error: result.data.error || 'Razorpay request failed.' });
    }
    db.prepare('UPDATE payments SET provider_order_id = ?, updated_at = ? WHERE id = ?')
      .run(result.data.id, new Date().toISOString(), paymentId);
    return res.json({
      bookingId,
      paymentId,
      gateway: 'razorpay',
      order: result.data,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/stripe/checkout', async (req, res) => {
  if (!STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe is not configured.' });
  }
  const amount = Number(req.body.amount || 0);
  const currency = String(req.body.currency || 'INR').toLowerCase();
  const description = String(req.body.description || 'Divya Darshan Booking');
  const successUrl = String(req.body.success_url || `${req.protocol}://${req.get('host')}/index.html?payment=success`);
  const cancelUrl = String(req.body.cancel_url || `${req.protocol}://${req.get('host')}/index.html?payment=cancelled`);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0.' });
  }

  const formBody = new URLSearchParams({
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][price_data][currency]': currency,
    'line_items[0][price_data][product_data][name]': description,
    'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
    'line_items[0][quantity]': '1',
  }).toString();

  try {
    const auth = `Bearer ${STRIPE_SECRET_KEY}`;
    const result = await postForm('https://api.stripe.com/v1/checkout/sessions', formBody, auth);
    if (result.status >= 400) {
      return res.status(400).json({ error: result.data.error || 'Stripe request failed.' });
    }
    return res.json({ checkoutUrl: result.data.url || '' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments/razorpay/order', async (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(400).json({ error: 'Razorpay is not configured.' });
  }
  const amount = Number(req.body.amount || 0);
  const currency = String(req.body.currency || 'INR');
  const receipt = String(req.body.receipt || `dd_${Date.now()}`);
  const notes = req.body.notes || {};

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0.' });
  }

  const auth = `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`;
  try {
    const result = await postJson('https://api.razorpay.com/v1/orders', {
      amount: Math.round(amount * 100),
      currency,
      receipt,
      payment_capture: 1,
      notes,
    }, auth);
    if (result.status >= 400) {
      return res.status(400).json({ error: result.data.error || 'Razorpay request failed.' });
    }
    return res.json({ order: result.data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/tidio/webhook', (req, res) => {
  const signature = req.headers['x-tidio-signature'];
  if (TIDIO_WEBHOOK_SECRET && signature !== TIDIO_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  console.log('Tidio webhook payload:', req.body);
  return res.json({ ok: true });
});

app.get('/payments/stripe/success', (req, res) => {
  const bookingId = Number(req.query.booking_id || 0);
  const paymentId = Number(req.query.payment_id || 0);
  const returnUrl = req.query.return ? decodeURIComponent(String(req.query.return)) : '/index.html';
  if (bookingId && paymentId) {
    const now = new Date().toISOString();
    db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?')
      .run('paid', now, bookingId);
    db.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?')
      .run('paid', now, paymentId);
  }
  return res.redirect(returnUrl + '?payment=success');
});

app.get('/payments/stripe/cancel', (req, res) => {
  const bookingId = Number(req.query.booking_id || 0);
  const paymentId = Number(req.query.payment_id || 0);
  const returnUrl = req.query.return ? decodeURIComponent(String(req.query.return)) : '/index.html';
  if (bookingId && paymentId) {
    const now = new Date().toISOString();
    db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?')
      .run('cancelled', now, bookingId);
    db.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?')
      .run('cancelled', now, paymentId);
  }
  return res.redirect(returnUrl + '?payment=cancelled');
});

app.post('/api/payments/razorpay/complete', (req, res) => {
  const bookingId = Number(req.body.bookingId || 0);
  const paymentId = Number(req.body.paymentId || 0);
  const providerPaymentId = String(req.body.providerPaymentId || '');
  if (!bookingId || !paymentId) {
    return res.status(400).json({ error: 'Missing booking/payment id.' });
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?')
    .run('paid', now, bookingId);
  db.prepare('UPDATE payments SET status = ?, provider_payment_id = ?, updated_at = ? WHERE id = ?')
    .run('paid', providerPaymentId, now, paymentId);
  return res.json({ ok: true });
});

app.get('/admin/pages/:slug', requireAuth, (req, res) => {
  const slug = req.params.slug;
  const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug);
  if (!page) return res.status(404).send('Page not found');
  res.render('edit', { page });
});

app.post('/admin/pages/:slug', requireAuth, (req, res) => {
  const slug = req.params.slug;
  const page = db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug);
  if (!page) return res.status(404).send('Page not found');
  const html = req.body.html || '';
  const title = req.body.title || page.title;
  const now = new Date().toISOString();
  db.prepare('UPDATE pages SET title = ?, html = ?, updated_at = ? WHERE slug = ?')
    .run(title, html, now, slug);
  res.redirect('/admin');
});

app.get('/admin/astrologers', requireAuth, (req, res) => {
  const astrologers = db.prepare(
    'SELECT * FROM astrologers ORDER BY created_at DESC'
  ).all();
  res.render('astrologers_list', { astrologers });
});

app.get('/admin/astrologers/new', requireAuth, (req, res) => {
  res.render('astrologers_form', {
    astrologer: null,
    action: '/admin/astrologers/new',
    title: 'Add Astrologer',
  });
});

app.post('/admin/astrologers/new', requireAuth, (req, res) => {
  const {
    name,
    photo_url,
    specialization,
    years_experience,
    languages,
    rating,
    price_per_minute,
    is_active,
  } = req.body;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO astrologers
     (name, photo_url, specialization, years_experience, languages, rating, price_per_minute, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name,
    photo_url || '',
    specialization || '',
    Number.isFinite(Number(years_experience)) ? Number(years_experience) : null,
    languages || '',
    Number.isFinite(Number(rating)) ? Number(rating) : null,
    Number.isFinite(Number(price_per_minute)) ? Number(price_per_minute) : null,
    is_active ? 1 : 0,
    now,
    now
  );
  res.redirect('/admin/astrologers');
});

app.get('/admin/astrologers/:id/edit', requireAuth, (req, res) => {
  const astrologer = db.prepare('SELECT * FROM astrologers WHERE id = ?')
    .get(req.params.id);
  if (!astrologer) return res.status(404).send('Astrologer not found');
  res.render('astrologers_form', {
    astrologer,
    action: `/admin/astrologers/${astrologer.id}/edit`,
    title: `Edit ${astrologer.name}`,
  });
});

app.post('/admin/astrologers/:id/edit', requireAuth, (req, res) => {
  const astrologer = db.prepare('SELECT * FROM astrologers WHERE id = ?')
    .get(req.params.id);
  if (!astrologer) return res.status(404).send('Astrologer not found');
  const {
    name,
    photo_url,
    specialization,
    years_experience,
    languages,
    rating,
    price_per_minute,
    is_active,
  } = req.body;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE astrologers
     SET name = ?, photo_url = ?, specialization = ?, years_experience = ?, languages = ?,
         rating = ?, price_per_minute = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name,
    photo_url || '',
    specialization || '',
    Number.isFinite(Number(years_experience)) ? Number(years_experience) : null,
    languages || '',
    Number.isFinite(Number(rating)) ? Number(rating) : null,
    Number.isFinite(Number(price_per_minute)) ? Number(price_per_minute) : null,
    is_active ? 1 : 0,
    now,
    astrologer.id
  );
  res.redirect('/admin/astrologers');
});

app.post('/admin/astrologers/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM astrologers WHERE id = ?').run(req.params.id);
  res.redirect('/admin/astrologers');
});

// CMS Admin (separate access)
app.get('/cms/setup', (req, res) => {
  if (hasCmsAdmin()) return res.redirect('/cms/login');
  res.render('cms/setup');
});

app.post('/cms/setup', async (req, res) => {
  if (hasCmsAdmin()) return res.redirect('/cms/login');
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.render('cms/setup', { error: 'Provide a username and a password (min 6 chars).' });
  }
  const password_hash = await bcrypt.hash(password, 10);
  db.prepare(
    'INSERT INTO cms_admins (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(username, password_hash, new Date().toISOString());
  res.redirect('/cms/login');
});

app.get('/cms/login', (req, res) => {
  if (!hasCmsAdmin()) return res.redirect('/cms/setup');
  res.render('cms/login');
});

app.post('/cms/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM cms_admins WHERE username = ?').get(username);
  if (!admin) return res.render('cms/login', { error: 'Invalid credentials.' });
  const ok = await bcrypt.compare(password, admin.password_hash);
  if (!ok) return res.render('cms/login', { error: 'Invalid credentials.' });
  req.session.cmsAdminId = admin.id;
  res.redirect('/cms');
});

app.get('/cms/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/cms/login'));
});

app.get('/cms', requireCmsAuth, (req, res) => {
  const counts = {
    astrologers: db.prepare('SELECT COUNT(*) as c FROM astrologers').get().c,
    store_items: db.prepare('SELECT COUNT(*) as c FROM store_items').get().c,
    meditation_items: db.prepare('SELECT COUNT(*) as c FROM meditation_items').get().c,
    book_items: db.prepare('SELECT COUNT(*) as c FROM book_items').get().c,
    tour_packages: db.prepare('SELECT COUNT(*) as c FROM tour_packages').get().c,
    bookings: db.prepare('SELECT COUNT(*) as c FROM bookings').get().c,
    payments: db.prepare('SELECT COUNT(*) as c FROM payments').get().c,
  };
  res.render('cms/dashboard', { counts });
});

app.get('/cms/bookings', requireCmsAuth, (req, res) => {
  const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  res.render('cms/bookings_list', { bookings });
});

app.get('/cms/payments', requireCmsAuth, (req, res) => {
  const payments = db.prepare(`
    SELECT payments.*, bookings.full_name, bookings.platform
    FROM payments
    LEFT JOIN bookings ON bookings.id = payments.booking_id
    ORDER BY payments.created_at DESC
  `).all();
  res.render('cms/payments_list', { payments });
});

// CMS Astrologers
app.get('/cms/astrologers', requireCmsAuth, (req, res) => {
  const astrologers = db.prepare('SELECT * FROM astrologers ORDER BY created_at DESC').all();
  res.render('cms/astrologers_list', { astrologers });
});

app.get('/cms/astrologers/new', requireCmsAuth, (req, res) => {
  res.render('cms/astrologers_form', {
    astrologer: null,
    action: '/cms/astrologers/new',
    title: 'Add Astrologer',
  });
});

app.post('/cms/astrologers/new', requireCmsAuth, (req, res) => {
  const {
    name,
    photo_url,
    specialization,
    years_experience,
    languages,
    rating,
    price_per_minute,
    is_active,
  } = req.body;
  if (!name || !name.trim()) return res.status(400).send('Name is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `INSERT INTO astrologers
     (name, photo_url, specialization, years_experience, languages, rating, price_per_minute, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name,
    photo_url || '',
    specialization || '',
    Number.isFinite(Number(years_experience)) ? Number(years_experience) : null,
    languages || '',
    Number.isFinite(Number(rating)) ? Number(rating) : null,
    Number.isFinite(Number(price_per_minute)) ? Number(price_per_minute) : null,
    active ? 1 : 0,
    now,
    now
  );
  res.redirect('/cms/astrologers');
});

app.get('/cms/astrologers/:id/edit', requireCmsAuth, (req, res) => {
  const astrologer = db.prepare('SELECT * FROM astrologers WHERE id = ?').get(req.params.id);
  if (!astrologer) return res.status(404).send('Astrologer not found');
  res.render('cms/astrologers_form', {
    astrologer,
    action: `/cms/astrologers/${astrologer.id}/edit`,
    title: `Edit ${astrologer.name}`,
  });
});

app.post('/cms/astrologers/:id/edit', requireCmsAuth, (req, res) => {
  const astrologer = db.prepare('SELECT * FROM astrologers WHERE id = ?').get(req.params.id);
  if (!astrologer) return res.status(404).send('Astrologer not found');
  const {
    name,
    photo_url,
    specialization,
    years_experience,
    languages,
    rating,
    price_per_minute,
    is_active,
  } = req.body;
  if (!name || !name.trim()) return res.status(400).send('Name is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `UPDATE astrologers
     SET name = ?, photo_url = ?, specialization = ?, years_experience = ?, languages = ?,
         rating = ?, price_per_minute = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name,
    photo_url || '',
    specialization || '',
    Number.isFinite(Number(years_experience)) ? Number(years_experience) : null,
    languages || '',
    Number.isFinite(Number(rating)) ? Number(rating) : null,
    Number.isFinite(Number(price_per_minute)) ? Number(price_per_minute) : null,
    active ? 1 : 0,
    now,
    astrologer.id
  );
  res.redirect('/cms/astrologers');
});

app.post('/cms/astrologers/:id/delete', requireCmsAuth, (req, res) => {
  db.prepare('DELETE FROM astrologers WHERE id = ?').run(req.params.id);
  res.redirect('/cms/astrologers');
});

// Store Items
app.get('/cms/store-items', requireCmsAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM store_items ORDER BY created_at DESC').all();
  res.render('cms/store_items_list', { items });
});

app.get('/cms/store-items/new', requireCmsAuth, (req, res) => {
  res.render('cms/store_items_form', { item: null, action: '/cms/store-items/new', title: 'Add Store Item' });
});

app.post('/cms/store-items/new', requireCmsAuth, (req, res) => {
  const { name, category, price, image_url, description, is_active } = req.body;
  if (!name || !name.trim()) return res.status(400).send('Name is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `INSERT INTO store_items
     (name, category, price, image_url, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    name,
    category || '',
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    now
  );
  res.redirect('/cms/store-items');
});

app.get('/cms/store-items/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM store_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  res.render('cms/store_items_form', { item, action: `/cms/store-items/${item.id}/edit`, title: `Edit ${item.name}` });
});

app.post('/cms/store-items/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM store_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  const { name, category, price, image_url, description, is_active } = req.body;
  if (!name || !name.trim()) return res.status(400).send('Name is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `UPDATE store_items
     SET name = ?, category = ?, price = ?, image_url = ?, description = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    name,
    category || '',
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    item.id
  );
  res.redirect('/cms/store-items');
});

app.post('/cms/store-items/:id/delete', requireCmsAuth, (req, res) => {
  db.prepare('DELETE FROM store_items WHERE id = ?').run(req.params.id);
  res.redirect('/cms/store-items');
});

// Meditation Items
app.get('/cms/meditation-items', requireCmsAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM meditation_items ORDER BY created_at DESC').all();
  res.render('cms/meditation_items_list', { items });
});

app.get('/cms/meditation-items/new', requireCmsAuth, (req, res) => {
  res.render('cms/meditation_items_form', { item: null, action: '/cms/meditation-items/new', title: 'Add Meditation Item' });
});

app.post('/cms/meditation-items/new', requireCmsAuth, (req, res) => {
  const { title, category, duration_minutes, level, price, image_url, description, is_active } = req.body;
  if (!title || !title.trim()) return res.status(400).send('Title is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `INSERT INTO meditation_items
     (title, category, duration_minutes, level, price, image_url, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    title,
    category || '',
    Number.isFinite(Number(duration_minutes)) ? Number(duration_minutes) : null,
    level || '',
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    now
  );
  res.redirect('/cms/meditation-items');
});

app.get('/cms/meditation-items/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM meditation_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  res.render('cms/meditation_items_form', { item, action: `/cms/meditation-items/${item.id}/edit`, title: `Edit ${item.title}` });
});

app.post('/cms/meditation-items/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM meditation_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  const { title, category, duration_minutes, level, price, image_url, description, is_active } = req.body;
  if (!title || !title.trim()) return res.status(400).send('Title is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `UPDATE meditation_items
     SET title = ?, category = ?, duration_minutes = ?, level = ?, price = ?, image_url = ?, description = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    title,
    category || '',
    Number.isFinite(Number(duration_minutes)) ? Number(duration_minutes) : null,
    level || '',
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    item.id
  );
  res.redirect('/cms/meditation-items');
});

app.post('/cms/meditation-items/:id/delete', requireCmsAuth, (req, res) => {
  db.prepare('DELETE FROM meditation_items WHERE id = ?').run(req.params.id);
  res.redirect('/cms/meditation-items');
});

// Book Items
app.get('/cms/book-items', requireCmsAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM book_items ORDER BY created_at DESC').all();
  res.render('cms/book_items_list', { items });
});

app.get('/cms/book-items/new', requireCmsAuth, (req, res) => {
  res.render('cms/book_items_form', { item: null, action: '/cms/book-items/new', title: 'Add Book Item' });
});

app.post('/cms/book-items/new', requireCmsAuth, (req, res) => {
  const { title, author, format, price, image_url, description, is_active } = req.body;
  if (!title || !title.trim()) return res.status(400).send('Title is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `INSERT INTO book_items
     (title, author, format, price, image_url, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    title,
    author || '',
    format || '',
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    now
  );
  res.redirect('/cms/book-items');
});

app.get('/cms/book-items/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM book_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  res.render('cms/book_items_form', { item, action: `/cms/book-items/${item.id}/edit`, title: `Edit ${item.title}` });
});

app.post('/cms/book-items/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM book_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  const { title, author, format, price, image_url, description, is_active } = req.body;
  if (!title || !title.trim()) return res.status(400).send('Title is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `UPDATE book_items
     SET title = ?, author = ?, format = ?, price = ?, image_url = ?, description = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    title,
    author || '',
    format || '',
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    item.id
  );
  res.redirect('/cms/book-items');
});

app.post('/cms/book-items/:id/delete', requireCmsAuth, (req, res) => {
  db.prepare('DELETE FROM book_items WHERE id = ?').run(req.params.id);
  res.redirect('/cms/book-items');
});

// Tour Packages
app.get('/cms/tour-packages', requireCmsAuth, (req, res) => {
  const items = db.prepare('SELECT * FROM tour_packages ORDER BY created_at DESC').all();
  res.render('cms/tour_packages_list', { items });
});

app.get('/cms/tour-packages/new', requireCmsAuth, (req, res) => {
  res.render('cms/tour_packages_form', { item: null, action: '/cms/tour-packages/new', title: 'Add Tour Package' });
});

app.post('/cms/tour-packages/new', requireCmsAuth, (req, res) => {
  const { title, destination, duration_days, price, image_url, description, is_active } = req.body;
  if (!title || !title.trim()) return res.status(400).send('Title is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `INSERT INTO tour_packages
     (title, destination, duration_days, price, image_url, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    title,
    destination || '',
    Number.isFinite(Number(duration_days)) ? Number(duration_days) : null,
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    now
  );
  res.redirect('/cms/tour-packages');
});

app.get('/cms/tour-packages/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM tour_packages WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  res.render('cms/tour_packages_form', { item, action: `/cms/tour-packages/${item.id}/edit`, title: `Edit ${item.title}` });
});

app.post('/cms/tour-packages/:id/edit', requireCmsAuth, (req, res) => {
  const item = db.prepare('SELECT * FROM tour_packages WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).send('Item not found');
  const { title, destination, duration_days, price, image_url, description, is_active } = req.body;
  if (!title || !title.trim()) return res.status(400).send('Title is required');
  const now = new Date().toISOString();
  const active = String(is_active) === '1' || is_active === 'on';
  db.prepare(
    `UPDATE tour_packages
     SET title = ?, destination = ?, duration_days = ?, price = ?, image_url = ?, description = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    title,
    destination || '',
    Number.isFinite(Number(duration_days)) ? Number(duration_days) : null,
    Number.isFinite(Number(price)) ? Number(price) : null,
    image_url || '',
    description || '',
    active ? 1 : 0,
    now,
    item.id
  );
  res.redirect('/cms/tour-packages');
});

app.post('/cms/tour-packages/:id/delete', requireCmsAuth, (req, res) => {
  db.prepare('DELETE FROM tour_packages WHERE id = ?').run(req.params.id);
  res.redirect('/cms/tour-packages');
});

// Public API for frontend
app.get('/api/astrologers', (req, res) => {
  const astrologers = db.prepare(
    'SELECT * FROM astrologers WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  res.json(astrologers);
});

app.get('/api/store-items', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM store_items WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  res.json(items);
});

app.get('/api/meditation-items', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM meditation_items WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  res.json(items);
});

app.get('/api/book-items', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM book_items WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  res.json(items);
});

app.get('/api/tour-packages', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM tour_packages WHERE is_active = 1 ORDER BY created_at DESC'
  ).all();
  res.json(items);
});

app.get('/', (req, res) => {
  const page = db.prepare('SELECT html FROM pages WHERE slug = ?').get('index');
  if (!page) return res.status(404).send('Page not found');
  res.type('html').send(page.html);
});

app.get('/:slug.html', (req, res) => {
  const page = db.prepare('SELECT html FROM pages WHERE slug = ?').get(req.params.slug);
  if (!page) return res.status(404).send('Page not found');
  let html = page.html;
  const pageNum = parsePage(req.query);
  if (req.params.slug === 'index') {
    const astrologers = db.prepare(
      'SELECT * FROM astrologers WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (astrologers.length) {
      const cards = renderHomeAstrologerCards(astrologers.slice(0, 4));
      const start = '    <div class="astrologers-grid">';
      const end = '<!-- =================== SPIRITUAL MERCHANDISE STORE =================== -->';
      if (html.includes(start) && html.includes(end)) {
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        html = html.replace(
          pattern,
          `${start}\n${cards}\n      </div>\n    </div>\n  </section>\n\n  ${end}`
        );
      }
    }

    const storeItems = db.prepare(
      'SELECT * FROM store_items WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (storeItems.length) {
      const cards = renderHomeStoreCards(storeItems.slice(0, 4));
      const start = '    <div class="products-grid">';
      const end = '<!-- =================== MEDITATION / YOGA PLATFORM =================== -->';
      if (html.includes(start) && html.includes(end)) {
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        html = html.replace(
          pattern,
          `${start}\n${cards}\n      </div>\n    </div>\n  </section>\n\n  ${end}`
        );
      }
    }

    const meditationItems = db.prepare(
      'SELECT * FROM meditation_items WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (meditationItems.length) {
      const cards = renderHomeCourseCards(meditationItems.slice(0, 3));
      const start = '    <div class="courses-grid">';
      const end = '<!-- =================== CONTENT LIBRARY =================== -->';
      if (html.includes(start) && html.includes(end)) {
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        html = html.replace(
          pattern,
          `${start}\n${cards}\n      </div>\n    </div>\n  </section>\n\n  ${end}`
        );
      }
    }

    const tourItems = db.prepare(
      'SELECT * FROM tour_packages WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (tourItems.length) {
      const cards = renderHomeTourCards(tourItems.slice(0, 3));
      const start = '    <div class="tours-grid">';
      const end = '<!-- =================== CONTACT BOOKING FORM =================== -->';
      if (html.includes(start) && html.includes(end)) {
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        html = html.replace(
          pattern,
          `${start}\n${cards}\n      </div>\n    </div>\n  </section>\n\n  ${end}`
        );
      }
    }
  }
  if (req.params.slug === 'astrotalks') {
    const astrologers = db.prepare(
      'SELECT * FROM astrologers WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (astrologers.length) {
      const specCounts = {
        'Vedic Astrology': 0,
        'Tarot Reading': 0,
        'Numerology': 0,
        'Palmistry': 0,
        'KP Astrology': 0,
        'Vastu Shastra': 0,
      };
      const langCounts = {
        Hindi: 0,
        English: 0,
        Tamil: 0,
        Telugu: 0,
        Marathi: 0,
        Bengali: 0,
      };
      const expCounts = { '0–2 Years': 0, '2–5 Years': 0, '5–10 Years': 0, '10+ Years': 0 };
      const ratingCounts = { '4.5+ ⭐': 0, '4.0+ ⭐': 0, '3.5+ ⭐': 0 };
      const priceCounts = { '₹0 – ₹200': 0, '₹200 – ₹500': 0, '₹500+': 0 };

      astrologers.forEach((astro) => {
        const spec = (astro.specialization || '').trim();
        if (spec && specCounts[spec] != null) specCounts[spec] += 1;

        const langs = (astro.languages || '').split(',').map((l) => l.trim()).filter(Boolean);
        langs.forEach((l) => {
          if (langCounts[l] != null) langCounts[l] += 1;
        });

        const years = Number(astro.years_experience);
        if (Number.isFinite(years)) {
          if (years <= 2) expCounts['0–2 Years'] += 1;
          else if (years <= 5) expCounts['2–5 Years'] += 1;
          else if (years <= 10) expCounts['5–10 Years'] += 1;
          else expCounts['10+ Years'] += 1;
        }

        const rating = Number(astro.rating);
        if (Number.isFinite(rating)) {
          if (rating >= 4.5) ratingCounts['4.5+ ⭐'] += 1;
          if (rating >= 4.0) ratingCounts['4.0+ ⭐'] += 1;
          if (rating >= 3.5) ratingCounts['3.5+ ⭐'] += 1;
        }

        const price = Number(astro.price_per_minute);
        if (Number.isFinite(price)) {
          if (price <= 200) priceCounts['₹0 – ₹200'] += 1;
          else if (price <= 500) priceCounts['₹200 – ₹500'] += 1;
          else priceCounts['₹500+'] += 1;
        }
      });

      Object.entries(specCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      Object.entries(langCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      Object.entries(expCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      Object.entries(ratingCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      Object.entries(priceCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      html = replaceOptionCount(html, '🟢 Online Now', 0);
      html = replaceOptionCount(html, '📅 Accepting Bookings', 0);

      const { slice, total, totalPages, page: current } = paginate(astrologers, pageNum, 9);
      const start = '<div class="astrologers-full-grid" id="astrologers-grid">';
      const end = '</div><!-- /astrologers-full-grid -->';
      if (html.includes(start) && html.includes(end)) {
        const cards = renderAstrologerCards(slice);
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        html = html.replace(pattern, `${start}\n${cards}\n        ${end}`);
      }
      html = html.replace(
        /<p class="results-count">[\s\S]*?<\/p>/,
        `<p class="results-count">Showing <strong>${slice.length}</strong> of <strong>${total}</strong> astrologers</p>`
      );
      const pager = renderPagination('/astrotalks.html', current, totalPages);
      if (pager) {
        html = html.replace(/<nav class="pagination"[\s\S]*?<\/nav>/, pager);
      }
    }
  }
  if (req.params.slug === 'store') {
    const items = db.prepare(
      'SELECT * FROM store_items WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (items.length) {
      const categoryCounts = {
        'Brass Idols': 0,
        'Pooja Items': 0,
        Rudraksha: 0,
        'Incense & Dhoop': 0,
        'Spiritual Clothing': 0,
        'Copper Items': 0,
        'Spiritual Jewelry': 0,
      };
      items.forEach((item) => {
        const cat = (item.category || '').trim();
        if (categoryCounts[cat] != null) categoryCounts[cat] += 1;
      });
      Object.entries(categoryCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });

      const { slice, total, totalPages, page: current } = paginate(items, pageNum, 12);
      const start = '<div class="store-products-grid" id="products-grid" role="list" aria-label="Spiritual products">';
      const end = '</div><!-- /#products-grid -->';
      if (html.includes(start) && html.includes(end)) {
        const cards = renderStoreCards(slice);
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        html = html.replace(pattern, `${start}\n${cards}\n        ${end}`);
      }
      html = html.replace(
        /<p class="results-count">[\s\S]*?<\/p>/,
        `<p class="results-count">Showing <strong>${slice.length}</strong> of <strong>${total}</strong> products</p>`
      );
      const pager = renderPagination('/store.html', current, totalPages);
      if (pager) {
        html = html.replace(/<nav class="pagination"[\s\S]*?<\/nav>/, pager);
      }
    }
  }
  if (req.params.slug === 'meditation') {
    const items = db.prepare(
      'SELECT * FROM meditation_items WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (items.length) {
      const categoryCounts = {
        Yoga: 0,
        Meditation: 0,
        Pranayama: 0,
        'Vedic Studies': 0,
        Spirituality: 0,
      };
      const levelCounts = { Beginner: 0, Intermediate: 0, Advanced: 0 };
      const durationCounts = {
        'Under 1 hour': 0,
        '1–5 hours': 0,
        '5–20 hours': 0,
        '20+ hours': 0,
      };
      const priceCounts = {
        Free: 0,
        'Under ₹999': 0,
        '₹999–₹4,999': 0,
        '₹5,000+': 0,
      };

      items.forEach((item) => {
        const cat = (item.category || '').trim();
        if (categoryCounts[cat] != null) categoryCounts[cat] += 1;

        const level = (item.level || '').trim();
        if (levelCounts[level] != null) levelCounts[level] += 1;

        const minutes = Number(item.duration_minutes);
        if (Number.isFinite(minutes)) {
          const hours = minutes / 60;
          if (hours < 1) durationCounts['Under 1 hour'] += 1;
          else if (hours <= 5) durationCounts['1–5 hours'] += 1;
          else if (hours <= 20) durationCounts['5–20 hours'] += 1;
          else durationCounts['20+ hours'] += 1;
        }

        const price = Number(item.price);
        if (!Number.isFinite(price) || price <= 0) priceCounts['Free'] += 1;
        else if (price < 999) priceCounts['Under ₹999'] += 1;
        else if (price <= 4999) priceCounts['₹999–₹4,999'] += 1;
        else priceCounts['₹5,000+'] += 1;
      });

      Object.entries(categoryCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      Object.entries(levelCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      Object.entries(durationCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      Object.entries(priceCounts).forEach(([label, count]) => {
        html = replaceOptionCount(html, label, count);
      });
      html = replaceOptionCount(html, 'Hindi', 0);
      html = replaceOptionCount(html, 'English', 0);
      html = replaceOptionCount(html, 'Sanskrit', 0);
      html = replaceOptionCount(html, 'Tamil', 0);

      const { slice, total, totalPages, page: current } = paginate(items, pageNum, 9);
      const start = '<div class="courses-grid" id="courses-grid">';
      const end = '</div><!-- /courses-grid -->';
      if (html.includes(start) && html.includes(end)) {
        const cards = renderMeditationCards(slice);
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        const pager = renderPagination('/meditation.html', current, totalPages);
        html = html.replace(pattern, `${start}\n${cards}\n        ${end}\n${pager}`);
      }
      html = html.replace(
        /<p class="results-count">[\s\S]*?<\/p>/,
        `<p class="results-count">Showing <strong>${slice.length}</strong> of <strong>${total}</strong> courses</p>`
      );
    }
  }
  if (req.params.slug === 'content') {
    const items = db.prepare(
      'SELECT * FROM book_items WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (items.length) {
      const { slice, total, totalPages, page: current } = paginate(items, pageNum, 8);
      const start = '<div class="new-releases-grid" id="new-releases-grid">';
      const end = '\n    </div>\n  </section>\n\n  <!-- =================== BROWSE BY CATEGORY =================== -->';
      if (html.includes(start) && html.includes(end)) {
        const cards = renderBookCards(slice, 'releases');
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        html = html.replace(
          pattern,
          `${start}\n${cards}\n      </div>\n      <p class="muted" style="margin:6px 0 14px;">Showing <strong>${slice.length}</strong> of <strong>${total}</strong> items</p>${end}`
        );
      }
      const popStart = '<div class="popular-grid" id="popular-grid">';
      const popEnd = '\n    </div>\n  </section>\n\n</main>\n\n<!-- =================== NEWSLETTER =================== -->';
      if (html.includes(popStart) && html.includes(popEnd)) {
        const popCards = renderBookCards(slice, 'popular');
        const popPattern = new RegExp(
          `${popStart.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${popEnd.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        const pager = renderPagination('/content.html', current, totalPages);
        html = html.replace(popPattern, `${popStart}\n${popCards}\n      </div>${pager}${popEnd}`);
      }
    }
  }
  if (req.params.slug === 'tourism') {
    const items = db.prepare(
      'SELECT * FROM tour_packages WHERE is_active = 1 ORDER BY created_at DESC'
    ).all();
    if (items.length) {
      const { slice, total, totalPages, page: current } = paginate(items, pageNum, 8);
      const start = '<div class="tour-cards-grid" id="tours-grid">';
      const end = '</div><!-- /grid panel -->';
      if (html.includes(start) && html.includes(end)) {
        const cards = renderTourCards(slice);
        const pattern = new RegExp(
          `${start.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`
        );
        const pager = renderPagination('/tourism.html', current, totalPages);
        html = html.replace(pattern, `${start}\n${cards}\n        ${end}\n${pager}`);
      }
      html = html.replace(
        /Showing <strong id="visible-count"[^>]*>[\s\S]*?<\/strong> of <strong[^>]*>[\s\S]*?<\/strong> packages/,
        `Showing <strong id="visible-count" style="color:var(--color-text-dark);">${slice.length}</strong> of <strong style="color:var(--color-text-dark);">${total}</strong> packages`
      );
    }
  }
  html = injectTidio(html);
  res.type('html').send(html);
});

app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
  console.log(`Database path: ${DB_PATH}`);
});
