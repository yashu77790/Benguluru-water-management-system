import '../styles.css';
import 'leaflet/dist/leaflet.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import L from 'leaflet';
import { Chart } from 'chart.js/auto';
import {
  createUser,
  loginUser,
  getUserById,
  updateUser,
  banUser,
  createSpot,
  updateSpot,
  resetMapData,
  upgradeToPremium,
  recordCleanup,
  getLeaderboard,
  getStats,
  getAllSpots,
  getSettings,
  updateThemeSetting,
  simulateNow,
  setAiApprovalRate,
  getSessionInfo,
  logout,
  resetAllData
} from './db.js';

const app = document.querySelector('#app');
const MAX_THUMBNAIL_BYTES = 200 * 1024;
const PAGE_SIZE = 5;

const state = {
  user: null,
  session: null,
  spots: [],
  leaderboard: [],
  stats: null,
  settings: { theme: 'system', aiApprovalRate: 0.7, nowOffsetDays: 0 },
  devVisible: false,
  selectedSpot: null,
  map: null,
  mapClickHandler: null,
  markerLayer: null,
  tiles: {
    light: null,
    dark: null,
    active: null
  },
  charts: {}
};

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

const toast = (message, type = 'info') => {
  const container = document.querySelector('#toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast flex items-center gap-2';
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';
  el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
};

const applyTheme = (theme) => {
  const preferred = theme === 'system' ? (systemQuery.matches ? 'dark' : 'light') : theme;
  document.documentElement.classList.toggle('dark', preferred === 'dark');
  updateMapTiles();
  updateChartTheme();
};

const updateMapTiles = () => {
  if (!state.map || !state.tiles.light || !state.tiles.dark) return;
  const darkMode = document.documentElement.classList.contains('dark');
  const next = darkMode ? state.tiles.dark : state.tiles.light;
  if (state.tiles.active === next) return;
  if (state.tiles.active) state.map.removeLayer(state.tiles.active);
  next.addTo(state.map);
  state.tiles.active = next;
};

const createMarkerIcon = (status) => {
  const colorVar =
    status === 'verified'
      ? 'var(--marker-verified)'
      : status === 'premium'
        ? 'var(--marker-premium)'
        : 'var(--marker-unverified)';
  const svg = `
    <svg width="32" height="40" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.9 0 1 4.9 1 11c0 7.9 9.6 17.7 10.1 18.2.5.5 1.3.5 1.8 0 .5-.5 10.1-10.3 10.1-18.2C23 4.9 18.1 0 12 0z" fill="${colorVar}"/>
      <circle cx="12" cy="11" r="4" fill="white"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'greengrid-marker',
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -36]
  });
};

const renderBaseLayout = () => {
  app.innerHTML = `
    <div class="min-h-screen">
      <header class="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/80">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 class="text-2xl font-bold">GreenGrid India</h1>
            <p class="text-sm text-slate-500 dark:text-slate-300">Community-led cleanup intelligence for a greener grid.</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button id="theme-toggle" class="btn btn-outline focus-ring" aria-label="Toggle theme">
              <i class="fa-solid fa-circle-half-stroke"></i>
              <span>Theme</span>
            </button>
            <button id="premium-btn" class="btn btn-secondary focus-ring" aria-label="Upgrade to premium">Upgrade</button>
            <button id="auth-btn" class="btn btn-primary focus-ring" aria-label="Login or signup">Login</button>
            <button id="logout-btn" class="btn btn-outline focus-ring hidden" aria-label="Logout">Logout</button>
          </div>
        </div>
      </header>

      <main class="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <section class="card grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 class="text-2xl font-semibold">Live Cleanup Map</h2>
            <p class="text-sm text-slate-500 dark:text-slate-300">Click any location to claim a cleanup spot. Markers update in real-time and respect theme colors.</p>
            <div id="map" class="mt-4 h-[600px] w-full"></div>
          </div>
          <div class="space-y-4">
            <div class="card p-4">
              <h3 class="text-lg font-semibold">Quick Actions</h3>
              <div class="mt-3 grid gap-2">
                <button id="share-btn" class="btn btn-outline focus-ring">
                  <i class="fa-brands fa-whatsapp"></i>
                  Share to WhatsApp
                </button>
                <button id="export-btn" class="btn btn-outline focus-ring">
                  <i class="fa-solid fa-file-export"></i>
                  Export My Data
                </button>
              </div>
            </div>
            <div class="card p-4" id="profile-card"></div>
            <div class="card p-4" id="leaderboard-card"></div>
          </div>
        </section>

        <section class="card p-6" id="admin-panel"></section>

        <section class="card p-6">
          <h3 class="text-lg font-semibold">Advanced Feature Scaffolding</h3>
          <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-500 dark:text-slate-300">
            <li>Waste Exchange (barter) module — TODO: build barter listings and escrow flow.</li>
            <li>Sponsor-a-Bin IoT simulation — TODO: wire sensor telemetry feed and alerts.</li>
            <li>Corporate Clash — TODO: company leaderboards, team onboarding.</li>
            <li>Time-Lapse Gallery — TODO: capture repeated cleanups per spot.</li>
            <li>PWA manifest + service worker — TODO: offline support and install prompts.</li>
          </ul>
        </section>

        <section id="dev-panel" class="card hidden p-6"></section>
      </main>

      <div id="toast-container" class="fixed bottom-6 right-6 flex flex-col gap-3"></div>

      <div id="auth-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/60 p-4">
        <div class="card w-full max-w-md p-6">
          <h3 class="text-xl font-semibold">Welcome to GreenGrid</h3>
          <p class="text-sm text-slate-500 dark:text-slate-300">Sign up or log in to start cleaning.</p>
          <form id="auth-form" class="mt-4 space-y-3">
            <div>
              <label class="text-sm font-semibold">Name</label>
              <input name="name" type="text" class="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" placeholder="Your name" />
              <p class="text-xs text-slate-500">Required for signup only.</p>
            </div>
            <div>
              <label class="text-sm font-semibold">Email</label>
              <input name="email" type="email" required class="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" placeholder="you@example.com" />
            </div>
            <div>
              <label class="text-sm font-semibold">Password</label>
              <input name="password" type="password" required minlength="6" class="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" placeholder="Minimum 6 characters" />
            </div>
            <div class="flex items-center justify-between gap-2">
              <button type="submit" class="btn btn-primary focus-ring">Login</button>
              <button type="button" id="signup-btn" class="btn btn-outline focus-ring">Sign up</button>
            </div>
            <button type="button" id="auth-close" class="btn btn-outline w-full focus-ring">Close</button>
          </form>
        </div>
      </div>

      <div id="claim-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/60 p-4">
        <div class="card w-full max-w-md p-6">
          <h3 class="text-xl font-semibold">Claim Cleanup Spot</h3>
          <form id="claim-form" class="mt-4 space-y-3">
            <div>
              <label class="text-sm font-semibold">Latitude</label>
              <input name="lat" type="text" readonly class="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" />
            </div>
            <div>
              <label class="text-sm font-semibold">Longitude</label>
              <input name="lng" type="text" readonly class="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" />
            </div>
            <button type="submit" class="btn btn-primary w-full focus-ring">Confirm Spot</button>
            <button type="button" id="claim-close" class="btn btn-outline w-full focus-ring">Cancel</button>
          </form>
        </div>
      </div>

      <div id="cleanup-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-900/60 p-4">
        <div class="card w-full max-w-xl p-6">
          <h3 class="text-xl font-semibold">Submit Cleanup</h3>
          <p id="cleanup-meta" class="text-sm text-slate-500 dark:text-slate-300"></p>
          <form id="cleanup-form" class="mt-4 space-y-3">
            <div>
              <label class="text-sm font-semibold">Before Photo</label>
              <input name="before" type="file" accept="image/*" class="mt-1 w-full" />
            </div>
            <div>
              <label class="text-sm font-semibold">After Photo</label>
              <input name="after" type="file" accept="image/*" class="mt-1 w-full" />
            </div>
            <button type="submit" class="btn btn-primary w-full focus-ring">Submit for AI Review</button>
            <button type="button" id="cleanup-close" class="btn btn-outline w-full focus-ring">Close</button>
          </form>
        </div>
      </div>

      <div id="scanning" class="scanning-overlay hidden">
        <div class="scanning-card">
          <h4 class="text-lg font-semibold">Scanning...</h4>
          <p class="text-sm text-slate-500 dark:text-slate-300">AI is verifying your cleanup.</p>
          <div class="mt-4 scanning-bar"></div>
        </div>
      </div>
    </div>
  `;
};

const renderProfile = () => {
  const profile = document.querySelector('#profile-card');
  if (!profile) return;
  if (!state.user) {
    profile.innerHTML = `
      <h3 class="text-lg font-semibold">Your Profile</h3>
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-300">Log in to track your streaks, points, and cleanup history.</p>
    `;
    return;
  }
  const rank = state.leaderboard.findIndex((user) => user.id === state.user.id) + 1;
  profile.innerHTML = `
    <h3 class="text-lg font-semibold">Welcome, ${state.user.name}</h3>
    <p class="text-sm text-slate-500 dark:text-slate-300">${state.user.email}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <span class="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Points: ${state.user.points}</span>
      <span class="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Streak: ${state.user.streak} days</span>
      <span class="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">Rank: #${rank || '—'}</span>
      ${state.user.isPremium ? '<span class="badge badge-premium"><i class="fa-solid fa-crown"></i> Premium</span>' : ''}
    </div>
    <div class="mt-4">
      <h4 class="text-sm font-semibold">Recent Cleanups</h4>
      <ul class="mt-2 space-y-1 text-sm text-slate-500 dark:text-slate-300">
        ${(state.user.cleanups || []).slice(-3).reverse().map((cleanup) => `<li>Spot ${cleanup.spotId.slice(0, 6)} · +${cleanup.points} pts</li>`).join('') || '<li>No cleanups yet.</li>'}
      </ul>
    </div>
  `;
};

const renderLeaderboard = (page = 1) => {
  const card = document.querySelector('#leaderboard-card');
  if (!card) return;
  const totalPages = Math.max(1, Math.ceil(state.leaderboard.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const items = state.leaderboard.slice(start, start + PAGE_SIZE);
  card.innerHTML = `
    <h3 class="text-lg font-semibold">Leaderboard</h3>
    <ul class="mt-3 space-y-2 text-sm">
      ${items.map((user, idx) => `
        <li class="flex items-center justify-between">
          <span>#${start + idx + 1} ${user.name}</span>
          <span class="font-semibold">${user.points} pts</span>
        </li>
      `).join('')}
    </ul>
    <div class="mt-3 flex items-center justify-between">
      <button id="leader-prev" class="btn btn-outline focus-ring" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="text-xs text-slate-500 dark:text-slate-300">Page ${page} / ${totalPages}</span>
      <button id="leader-next" class="btn btn-outline focus-ring" ${page >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
  document.querySelector('#leader-prev')?.addEventListener('click', () => renderLeaderboard(page - 1));
  document.querySelector('#leader-next')?.addEventListener('click', () => renderLeaderboard(page + 1));
};

const renderAdminPanel = () => {
  const panel = document.querySelector('#admin-panel');
  if (!panel) return;
  if (!state.user || state.user.role !== 'admin') {
    panel.innerHTML = `
      <h3 class="text-lg font-semibold">Admin Dashboard</h3>
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-300">Admin access required.</p>
    `;
    return;
  }
  panel.innerHTML = `
    <div class="flex items-start justify-between gap-4">
      <div>
        <h3 class="text-lg font-semibold">Admin Dashboard</h3>
        <p class="text-sm text-slate-500 dark:text-slate-300">Monitor impact and manage users.</p>
      </div>
      <button id="reset-map" class="btn btn-outline focus-ring">Reset All Map Data</button>
    </div>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <div class="card p-4">
        <h4 class="text-sm font-semibold">Impact</h4>
        <canvas id="impact-chart" height="180"></canvas>
      </div>
      <div class="card p-4">
        <h4 class="text-sm font-semibold">New Users</h4>
        <canvas id="users-chart" height="180"></canvas>
      </div>
    </div>
    <div class="mt-4">
      <h4 class="text-sm font-semibold">User Management</h4>
      <div class="mt-2 overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead>
            <tr class="text-slate-500 dark:text-slate-300">
              <th class="py-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Points</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.leaderboard.map((user) => `
              <tr class="border-t border-slate-200/60 dark:border-slate-800/70">
                <td class="py-2">${user.name}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${user.points}</td>
                <td>${user.banned ? 'Banned' : 'Active'}</td>
                <td>
                  <button data-id="${user.id}" data-banned="${user.banned}" class="btn btn-outline focus-ring ban-btn">
                    ${user.banned ? 'Unban' : 'Ban'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="mt-4">
      <h4 class="text-sm font-semibold">Action Logs</h4>
      <ul class="mt-2 space-y-1 text-sm text-slate-500 dark:text-slate-300">
        ${(state.stats?.logs || []).map((log) => `<li>${log.at}: ${log.message}</li>`).join('')}
      </ul>
    </div>
  `;
  panel.querySelector('#reset-map')?.addEventListener('click', async () => {
    if (!confirm('Reset all map data?')) return;
    await resetMapData();
    await loadData();
    updateMapMarkers();
    toast('Map data reset.', 'success');
  });
  panel.querySelectorAll('.ban-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const banned = btn.getAttribute('data-banned') === 'true';
      await banUser(id, !banned);
      await loadData();
      renderAdminPanel();
      toast(`User ${banned ? 'unbanned' : 'banned'}.`, 'success');
    });
  });
  buildCharts();
};

const buildCharts = () => {
  if (!state.stats) return;
  const impactCtx = document.querySelector('#impact-chart');
  const usersCtx = document.querySelector('#users-chart');
  if (!impactCtx || !usersCtx) return;

  const palette = getChartPalette();
  const impactData = [state.stats.totalTrash, state.stats.premiumCount, Math.max(0, state.stats.totalTrash - state.stats.premiumCount)];
  const userData = [Math.max(1, state.stats.newUsers), Math.max(1, state.leaderboard.length - state.stats.newUsers)];

  state.charts.impact?.destroy();
  state.charts.users?.destroy();

  state.charts.impact = new Chart(impactCtx, {
    type: 'bar',
    data: {
      labels: ['Total Cleanups', 'Premium', 'Community'],
      datasets: [
        {
          label: 'Impact',
          data: impactData,
          backgroundColor: palette.primary
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: palette.text } } },
      scales: {
        x: { ticks: { color: palette.text }, grid: { color: palette.grid } },
        y: { ticks: { color: palette.text }, grid: { color: palette.grid } }
      }
    }
  });

  state.charts.users = new Chart(usersCtx, {
    type: 'doughnut',
    data: {
      labels: ['New Users', 'Existing'],
      datasets: [
        {
          data: userData,
          backgroundColor: palette.secondary
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: palette.text } } }
    }
  });
};

const getChartPalette = () => {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue('--chart-text').trim(),
    grid: styles.getPropertyValue('--chart-grid').trim(),
    primary: [styles.getPropertyValue('--primary').trim(), styles.getPropertyValue('--secondary').trim(), styles.getPropertyValue('--warning').trim()],
    secondary: [styles.getPropertyValue('--secondary').trim(), styles.getPropertyValue('--primary').trim()]
  };
};

const updateChartTheme = () => {
  if (!state.charts.impact || !state.charts.users) return;
  buildCharts();
};

const showModal = (id, show = true) => {
  const modal = document.querySelector(id);
  if (!modal) return;
  modal.classList.toggle('hidden', !show);
  modal.classList.toggle('flex', show);
};

const initMap = () => {
  const mapEl = document.querySelector('#map');
  if (!mapEl || state.map) return;

  state.map = L.map(mapEl, { zoomControl: true }).setView([20.5937, 78.9629], 5);
  state.tiles.light = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  });
  state.tiles.dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  });
  updateMapTiles();

  state.markerLayer = L.layerGroup().addTo(state.map);

  state.mapClickHandler = (event) => {
    const { lat, lng } = event.latlng;
    const form = document.querySelector('#claim-form');
    if (!form) return;
    form.lat.value = lat.toFixed(6);
    form.lng.value = lng.toFixed(6);
    showModal('#claim-modal', true);
  };
  state.map.on('click', state.mapClickHandler);
  updateMapMarkers();
};

const cleanupMap = () => {
  if (!state.map || !state.mapClickHandler) return;
  state.map.off('click', state.mapClickHandler);
};

const updateMapMarkers = () => {
  if (!state.markerLayer) return;
  state.markerLayer.clearLayers();
  state.spots.forEach((spot) => {
    const marker = L.marker([spot.lat, spot.lng], { icon: createMarkerIcon(spot.status) });
    marker.bindPopup(`<strong>${spot.status.toUpperCase()}</strong><br/>Spot ID: ${spot.id.slice(0, 6)}`);
    marker.on('click', () => {
      state.selectedSpot = spot;
      const meta = document.querySelector('#cleanup-meta');
      if (meta) meta.textContent = `Spot ${spot.id.slice(0, 6)} · ${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`;
      showModal('#cleanup-modal', true);
    });
    marker.addTo(state.markerLayer);
  });
};

const handleAuth = async (event) => {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const name = formData.get('name');
  const email = formData.get('email');
  const password = formData.get('password');
  try {
    const { user } = await loginUser({ email, password });
    state.user = user;
    state.session = await getSessionInfo();
    showModal('#auth-modal', false);
    toast('Welcome back!', 'success');
    await loadData();
    renderAll();
  } catch (error) {
    toast(error.message, 'error');
  }
};

const handleSignup = async () => {
  const form = document.querySelector('#auth-form');
  const formData = new FormData(form);
  const name = formData.get('name');
  const email = formData.get('email');
  const password = formData.get('password');
  if (!name) {
    toast('Name is required for signup.', 'error');
    return;
  }
  try {
    await createUser({ name, email, password });
    const { user } = await loginUser({ email, password });
    state.user = user;
    state.session = await getSessionInfo();
    showModal('#auth-modal', false);
    toast('Account created!', 'success');
    await loadData();
    renderAll();
  } catch (error) {
    toast(error.message, 'error');
  }
};

const handleClaim = async (event) => {
  event.preventDefault();
  if (!state.user) {
    toast('Please login to claim a spot.', 'error');
    return;
  }
  const formData = new FormData(event.target);
  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));
  await createSpot({ lat, lng, reportedBy: state.user.id });
  showModal('#claim-modal', false);
  await loadData();
  updateMapMarkers();
  toast('Spot claimed! Upload cleanup photos.', 'success');
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  if (!window.FileReader) {
    reject(new Error('FileReader is not supported in this browser.'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Failed to read file.'));
  reader.readAsDataURL(file);
});

const handleCleanup = async (event) => {
  event.preventDefault();
  if (!state.user) {
    toast('Login required to submit cleanups.', 'error');
    return;
  }
  if (!state.selectedSpot) {
    toast('Select a spot first.', 'error');
    return;
  }
  const formData = new FormData(event.target);
  const before = formData.get('before');
  const after = formData.get('after');
  if (!before || !after) {
    toast('Both before and after photos are required.', 'error');
    return;
  }
  try {
    const [beforeData, afterData] = await Promise.all([readFileAsDataUrl(before), readFileAsDataUrl(after)]);
    if (beforeData.length > MAX_THUMBNAIL_BYTES * 1.4 || afterData.length > MAX_THUMBNAIL_BYTES * 1.4) {
      toast('Images are too large. Please upload smaller thumbnails.', 'error');
      return;
    }
    showModal('#scanning', true);
    setTimeout(async () => {
      const settings = await getSettings();
      const approved = Math.random() < settings.aiApprovalRate;
      const result = await recordCleanup({
        spotId: state.selectedSpot.id,
        userId: state.user.id,
        beforeImage: beforeData,
        afterImage: afterData,
        approved,
        aiReason: approved ? 'Approved' : 'AI detected inconsistencies.'
      });
      showModal('#scanning', false);
      if (!result.approved) {
        toast(`Cleanup rejected: ${result.reason}`, 'error');
        return;
      }
      toast(`Cleanup approved! +${result.points} points.`, 'success');
      state.user = result.user;
      await loadData();
      updateMapMarkers();
      renderAll();
      showModal('#cleanup-modal', false);
    }, 1400);
  } catch (error) {
    toast(error.message, 'error');
  }
};

const handlePremium = async () => {
  if (!state.user) {
    toast('Login required to upgrade.', 'error');
    return;
  }
  if (state.user.isPremium) {
    toast('You are already premium.', 'success');
    return;
  }
  if (!confirm('Upgrade to Premium for ₹10/month?')) return;
  showModal('#scanning', true);
  setTimeout(async () => {
    await upgradeToPremium(state.user.id);
    await loadData();
    renderAll();
    showModal('#scanning', false);
    toast('Payment complete! Premium unlocked.', 'success');
  }, 1200);
};

const handleShare = async () => {
  const text = 'Join me on GreenGrid India and help keep our neighborhoods clean! 🌿 https://greengrid.local';
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast('Invite copied to clipboard!', 'success');
    } else {
      throw new Error('Clipboard API unavailable.');
    }
  } catch (error) {
    toast('Clipboard unavailable. Please copy manually.', 'error');
  }
};

const handleExport = () => {
  if (!state.user) {
    toast('Login to export your data.', 'error');
    return;
  }
  const data = JSON.stringify(state.user, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `greengrid-${state.user.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const renderDevPanel = () => {
  const panel = document.querySelector('#dev-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !state.devVisible);
  if (!state.devVisible) return;
  panel.innerHTML = `
    <h3 class="text-lg font-semibold">Developer Helpers</h3>
    <p class="text-sm text-slate-500 dark:text-slate-300">Internal testing utilities. Press Ctrl+Shift+H to hide.</p>
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      <button id="seed-btn" class="btn btn-outline focus-ring">Seed fake users & spots</button>
      <button id="reset-btn" class="btn btn-outline focus-ring">Reset all app data</button>
      <div class="flex items-center gap-2">
        <input id="simulate-input" type="number" class="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" placeholder="Offset days" />
        <button id="simulate-btn" class="btn btn-outline focus-ring">Simulate Now</button>
      </div>
      <div class="flex items-center gap-2">
        <input id="ai-input" type="number" step="0.05" min="0" max="1" class="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2" value="${state.settings.aiApprovalRate}" />
        <button id="ai-btn" class="btn btn-outline focus-ring">Set AI Rate</button>
      </div>
    </div>
  `;
  panel.querySelector('#seed-btn')?.addEventListener('click', seedFakeData);
  panel.querySelector('#reset-btn')?.addEventListener('click', async () => {
    await resetAllData();
    await init();
    toast('Data reset.', 'success');
  });
  panel.querySelector('#simulate-btn')?.addEventListener('click', async () => {
    const val = Number(panel.querySelector('#simulate-input').value || 0);
    await simulateNow(val);
    await loadData();
    updateMapMarkers();
    renderAll();
    toast('Time simulation updated.', 'success');
  });
  panel.querySelector('#ai-btn')?.addEventListener('click', async () => {
    const val = Number(panel.querySelector('#ai-input').value || 0.7);
    await setAiApprovalRate(val);
    state.settings = await getSettings();
    toast('AI approval rate updated.', 'success');
  });
};

const seedFakeData = async () => {
  const fakeUsers = [
    { name: 'Aanya', email: 'aanya@test.com' },
    { name: 'Rahul', email: 'rahul@test.com' },
    { name: 'Neha', email: 'neha@test.com' }
  ];
  for (const user of fakeUsers) {
    try {
      await createUser({ name: user.name, email: user.email, password: 'password123' });
      await loginUser({ email: user.email, password: 'password123' });
    } catch (error) {
      // ignore duplicates
    }
  }
  const spots = [
    { lat: 28.6139, lng: 77.209 },
    { lat: 19.076, lng: 72.8777 },
    { lat: 13.0827, lng: 80.2707 }
  ];
  for (const spot of spots) {
    await createSpot({ ...spot, reportedBy: state.user?.id || null });
  }
  await loadData();
  updateMapMarkers();
  renderAll();
  toast('Seeded demo data.', 'success');
};

const renderHeaderControls = () => {
  const authBtn = document.querySelector('#auth-btn');
  const logoutBtn = document.querySelector('#logout-btn');
  if (state.user) {
    authBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    authBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
  }
};

const renderAll = () => {
  renderHeaderControls();
  renderProfile();
  renderLeaderboard();
  renderAdminPanel();
  renderDevPanel();
};

const loadData = async () => {
  state.settings = await getSettings();
  state.spots = await getAllSpots();
  state.leaderboard = await getLeaderboard();
  state.stats = await getStats();
  if (state.session?.userId) {
    state.user = await getUserById(state.session.userId);
  }
};

const init = async () => {
  renderBaseLayout();
  state.session = await getSessionInfo();
  await loadData();
  applyTheme(state.settings.theme);
  initMap();
  renderAll();

  document.querySelector('#theme-toggle')?.addEventListener('click', async () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    await updateThemeSetting(next);
    state.settings.theme = next;
    applyTheme(next);
  });

  systemQuery.addEventListener('change', () => {
    if (state.settings.theme === 'system') {
      applyTheme('system');
    }
  });

  document.querySelector('#auth-btn')?.addEventListener('click', () => showModal('#auth-modal', true));
  document.querySelector('#auth-close')?.addEventListener('click', () => showModal('#auth-modal', false));
  document.querySelector('#auth-form')?.addEventListener('submit', handleAuth);
  document.querySelector('#signup-btn')?.addEventListener('click', handleSignup);
  document.querySelector('#logout-btn')?.addEventListener('click', async () => {
    await logout();
    state.user = null;
    state.session = null;
    renderAll();
    toast('Logged out.', 'success');
  });

  document.querySelector('#claim-close')?.addEventListener('click', () => showModal('#claim-modal', false));
  document.querySelector('#claim-form')?.addEventListener('submit', handleClaim);

  document.querySelector('#cleanup-close')?.addEventListener('click', () => showModal('#cleanup-modal', false));
  document.querySelector('#cleanup-form')?.addEventListener('submit', handleCleanup);

  document.querySelector('#premium-btn')?.addEventListener('click', handlePremium);
  document.querySelector('#share-btn')?.addEventListener('click', handleShare);
  document.querySelector('#export-btn')?.addEventListener('click', handleExport);

  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 't') {
      event.preventDefault();
      document.querySelector('#theme-toggle')?.click();
    }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'h') {
      state.devVisible = !state.devVisible;
      renderDevPanel();
    }
  });

  window.addEventListener('beforeunload', cleanupMap);
};

init();
