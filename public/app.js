const state = { routes: [], passTypes: {} };
const $ = (selector) => document.querySelector(selector);
const money = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
$('#travelDate').min = localToday;
$('#travelDate').value = localToday;
$('#year').textContent = new Date().getFullYear();

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  let data;
  try { data = await response.json(); } catch { data = { error: 'The server returned an unreadable response.' }; }
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function selectedRoute() {
  return state.routes.find(route => route.id === $('#routeSelect').value);
}
function currentPass() {
  return state.passTypes[$('#passSelect').value] || { label: 'Single ride', multiplier: 1, validity: 'One ride' };
}
function updateSummary() {
  const route = selectedRoute();
  const pass = currentPass();
  const quantity = Number($('#quantity').value || 1);
  $('#summaryRoute').textContent = route ? `${route.from} → ${route.to}` : 'Choose a route';
  $('#summaryDuration').textContent = route ? `${route.duration} · ${route.frequency}` : '—';
  $('#summaryPass').textContent = pass.label;
  $('#summaryValidity').textContent = pass.validity;
  $('#summaryUnit').textContent = route ? money(route.baseFare * pass.multiplier) : '₹—';
  $('#summaryQty').textContent = quantity;
  $('#summaryTotal').textContent = route ? money(route.baseFare * pass.multiplier * quantity) : '₹—';
  $('#routePreview').innerHTML = route
    ? `<span class="route-pin">↗</span><span><strong>${escapeHtml(route.from)} → ${escapeHtml(route.to)}</strong><small>${escapeHtml(route.type)} route · ${escapeHtml(route.frequency)}</small></span><span class="route-duration">${escapeHtml(route.duration)}</span>`
    : '<span class="route-pin">↗</span><span><strong>Select a route</strong><small>Your journey details will appear here.</small></span><span class="route-duration">—</span>';
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function renderRoutes() {
  $('#routeCount').textContent = `${state.routes.length} ROUTES AVAILABLE`;
  $('#routeSelect').innerHTML = '<option value="">Select a route</option>' + state.routes.map(route =>
    `<option value="${route.id}">${escapeHtml(route.from)} → ${escapeHtml(route.to)} · ${money(route.baseFare)}</option>`).join('');
  $('#routeGrid').innerHTML = state.routes.map(route => `
    <article class="route-card">
      <div class="route-card-top"><span class="route-type">${escapeHtml(route.type.toUpperCase())}</span><span class="route-id">${escapeHtml(route.id)}</span></div>
      <div class="route-points"><div class="route-dots"><i></i><b></b><i></i></div><div><div class="route-stop">${escapeHtml(route.from)}<small>Departure point</small></div><div class="route-stop">${escapeHtml(route.to)}<small>Destination</small></div></div></div>
      <div class="route-card-bottom"><span><small>FROM</small><br><strong>${money(route.baseFare)}</strong></span><button type="button" data-route="${route.id}">Choose →</button></div>
    </article>`).join('');
}
function showMessage(message, type = 'error') {
  const el = $('#formMessage');
  el.textContent = message;
  el.className = `form-message${type === 'success' ? ' success' : ''}`;
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}
function openLookup() {
  $('#lookupModal').hidden = false;
  $('#lookupResult').innerHTML = '';
  setTimeout(() => $('#ticketCodeInput').focus(), 50);
}
function closeLookup() { $('#lookupModal').hidden = true; }
function renderTicket(booking) {
  $('#lookupResult').innerHTML = `<div class="ticket-result">
    <div class="eyebrow">BOOKING ${escapeHtml(booking.status)}</div>
    <p class="ticket-code">${escapeHtml(booking.ticketCode)}</p>
    <p><strong>${escapeHtml(booking.passengerName)}</strong><br>${escapeHtml(booking.routeName)}<br>${escapeHtml(booking.passLabel)} · ${escapeHtml(booking.travelDate)}<br>Quantity: ${booking.quantity} · Total: <strong>${money(booking.totalPrice)}</strong></p>
    <button type="button" id="copyTicket">Copy ticket code</button>
  </div>`;
  $('#copyTicket').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(booking.ticketCode); showToast('Ticket code copied.'); }
    catch { showToast(`Your ticket code is ${booking.ticketCode}`); }
  });
}
async function init() {
  try {
    const data = await api('/api/routes');
    state.routes = data.routes;
    state.passTypes = data.passTypes;
    renderRoutes();
    updateSummary();
  } catch (error) {
    $('#routeSelect').innerHTML = '<option value="">Routes unavailable</option>';
    $('#routeGrid').innerHTML = `<p class="route-loading">${escapeHtml(error.message)} Check that the server is running.</p>`;
    showToast('Could not connect to the booking service.');
  }
}
$('#routeSelect').addEventListener('change', updateSummary);
$('#passSelect').addEventListener('change', updateSummary);
$('#quantity').addEventListener('change', updateSummary);
$('#routeGrid').addEventListener('click', event => {
  const button = event.target.closest('[data-route]');
  if (!button) return;
  $('#routeSelect').value = button.dataset.route;
  updateSummary();
  $('#book').scrollIntoView({ behavior: 'smooth' });
});
$('#bookingForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#bookButton');
  button.disabled = true;
  button.innerHTML = 'Confirming…';
  showMessage('');
  const form = new FormData(event.currentTarget);
  const payload = {
    passengerName: form.get('passengerName'),
    email: form.get('email'),
    routeId: form.get('routeId'),
    passType: form.get('passType'),
    travelDate: form.get('travelDate'),
    quantity: Number(form.get('quantity'))
  };
  try {
    const result = await api('/api/bookings', { method: 'POST', body: JSON.stringify(payload) });
    showMessage(`Booking confirmed! Your ticket code is ${result.booking.ticketCode}. Save this code to retrieve your ticket.`, 'success');
    openLookup();
    renderTicket(result.booking);
    showToast('Your booking is confirmed.');
    event.currentTarget.reset();
    $('#travelDate').value = localToday;
    updateSummary();
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Confirm booking <span>→</span>';
  }
});
$('#openLookup').addEventListener('click', openLookup);
$('#footerLookup').addEventListener('click', openLookup);
$('#closeLookup').addEventListener('click', closeLookup);
$('#lookupModal').addEventListener('click', event => { if (event.target === $('#lookupModal')) closeLookup(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeLookup(); });
$('#lookupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const code = $('#ticketCodeInput').value.trim().toUpperCase();
  $('#lookupResult').innerHTML = '<p class="route-loading">Looking up your ticket…</p>';
  try {
    const result = await api(`/api/bookings/${encodeURIComponent(code)}`);
    renderTicket(result.booking);
  } catch (error) {
    $('#lookupResult').innerHTML = `<p style="font-size:12px;color:#c43d48;margin-top:15px">${escapeHtml(error.message)}</p>`;
  }
});
$('#mobileMenu').addEventListener('click', () => {
  const nav = $('.nav-links');
  nav.classList.toggle('open');
  $('#mobileMenu').setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
});
$('.nav-links').addEventListener('click', event => {
  if (event.target.closest('a')) $('.nav-links').classList.remove('open');
});
init();
