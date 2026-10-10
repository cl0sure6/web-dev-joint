let csrf = document.querySelector('meta[name="csrf-token"]').content;
let account = null;
let cancelId = null;
let scheduleRequest = 0;
const dateInput = document.getElementById('schedule-date');
const status = document.getElementById('member-status');
const cancelDialog = document.getElementById('cancel-dialog');
const html = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
async function api(action, data, query = '') {
    const response = await fetch(`../api.php?action=${action}${query}`, {
        method: data ? 'POST' : 'GET', credentials: 'same-origin',
        headers: data ? {'Content-Type':'application/json','X-CSRF-Token':csrf} : {},
        body: data ? JSON.stringify(data) : undefined,
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('The club service is unavailable. Please try again shortly.'); }
    if (response.status === 401) { window.location.href = 'login.php'; throw new Error('Your session expired. Please sign in again.'); }
    if (!response.ok) throw new Error(result.error || 'Please try again.');
    if (result.csrf) {
        csrf = result.csrf;
        document.querySelector('meta[name="csrf-token"]').content = csrf;
        document.querySelector('input[name="csrf"]').value = csrf;
    }
    return result;
}
function setStatus(element, message = '', error = false) {
    element.textContent = message;
    element.classList.toggle('form-status--error', error);
}
function bookingRow(booking) {
    return `<article class="member-row"><div><h3>${html(booking.name)}</h3><p>${html(dateLabel(booking.date))} · ${html(booking.start_time)} · ${html(booking.duration)} min</p><p>${html(booking.trainer || 'Club team')} · ${html(booking.room)}</p></div>${booking.upcoming && booking.status === 'confirmed' ? `<button class="button button--outline" data-cancel="${booking.id}">Cancel booking</button>` : `<span class="member-badge">${booking.status === 'cancelled' ? 'Cancelled' : 'Past class'}</span>`}</article>`;
}
function renderAccount() {
    document.getElementById('member-name').textContent = account.user.name;
    const upcoming = account.bookings.filter(b => b.upcoming && b.status === 'confirmed').sort((a,b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
    const past = account.bookings.filter(b => !b.upcoming || b.status === 'cancelled');
    document.getElementById('upcoming-bookings').innerHTML = upcoming.length ? upcoming.map(bookingRow).join('') : '<p class="member-empty">No upcoming bookings. <a href="#schedule">Find your next class ↗</a></p>';
    document.getElementById('past-bookings').innerHTML = past.length ? past.map(bookingRow).join('') : '<p class="member-empty">Your past and cancelled classes will appear here.</p>';
    const next = upcoming[0];
    document.getElementById('next-class').innerHTML = next ? `<h2>${html(next.name)}</h2><p>${html(dateLabel(next.date))} · ${html(next.start_time)}<br>${html(next.trainer || 'Club team')} · ${html(next.room)}</p><span class="member-badge">Booking confirmed</span><br><a class="button button--outline" href="#bookings">My bookings →</a>` : '<h2>Your next chapter.</h2><p>You have no upcoming classes. Find a session and make a little time for yourself.</p><a class="button button--outline" href="#schedule">Explore classes ↗</a>';
    const plan = account.membership;
    const labels = {active:'Active',upcoming:'Starts soon',expired:'Expired',cancelled:'Cancelled'};
    document.getElementById('membership').innerHTML = plan ? `<h2>${html(plan.name)}</h2><span class="member-badge">${labels[plan.status]}</span><p>${html(dateLabel(plan.starts_on))} – ${html(dateLabel(plan.ends_on))}</p><p>Contact the club team to renew or change your membership.</p><a class="text-link" href="../index.html#contacts">Get in touch ↗</a>` : '<h2>Find your fit.</h2><p>No membership has been assigned yet. Explore our plans and the club team will help you get started.</p><a class="button button--outline" href="../index.html#pricing">View memberships ↗</a>';
}
async function loadAccount() {
    account = await api('member-data');
    dateInput.min = account.today;
    dateInput.max = account.last_date;
    if (!dateInput.value || dateInput.value < account.today) dateInput.value = account.today;
    renderAccount();
}
async function loadSchedule() {
    if (!account) return;
    const requestId = ++scheduleRequest;
    const selectedDate = dateInput.value;
    const container = document.getElementById('class-list');
    const message = document.getElementById('schedule-status');
    if (!dateInput.checkValidity()) { container.innerHTML = ''; setStatus(message, 'Choose a date within the next 28 days.', true); return; }
    container.setAttribute('aria-busy','true');
    container.innerHTML = '<p class="member-empty">Loading classes…</p>';
    setStatus(message);
    try {
        const result = await api('member-schedule', null, `&date=${encodeURIComponent(selectedDate)}`);
        if (requestId !== scheduleRequest) return;
        container.innerHTML = result.classes.length ? result.classes.map(c => {
            const free = Math.max(0, c.capacity - c.booked);
            const disabled = c.started || c.booking_id || free === 0;
            const label = c.started ? 'Class started' : c.booking_id ? 'You are booked in' : free === 0 ? 'Fully booked' : 'Book a spot ↗';
            return `<article class="member-row"><div><span class="class-time">${html(c.start_time)}</span><h3>${html(c.name)}</h3><p>${html(c.trainer || 'Club team')} · ${html(c.room)} · ${html(c.duration)} min</p>${c.description ? `<p>${html(c.description)}</p>` : ''}<p>${free} ${free === 1 ? 'spot' : 'spots'} available</p></div><button class="button${disabled ? ' button--outline' : ''}" data-book="${c.id}" data-date="${html(selectedDate)}" ${disabled ? 'disabled' : ''}>${label}</button></article>`;
        }).join('') : '<p class="member-empty">No classes are scheduled for this day. Try another date or check back soon.</p>';
    } catch (error) { if (requestId === scheduleRequest) { container.innerHTML = ''; setStatus(message, error.message, true); } }
    finally { if (requestId === scheduleRequest) container.setAttribute('aria-busy','false'); }
}
function route() {
    const section = ['overview','schedule','bookings','profile'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    document.querySelectorAll('[data-section]').forEach(el => el.hidden = el.dataset.section !== section);
    document.querySelectorAll('.member-sidebar nav a').forEach(a => { if (a.hash === `#${section}`) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
    if (section === 'schedule') loadSchedule();
}
window.addEventListener('hashchange', route);
dateInput.addEventListener('change', loadSchedule);
document.getElementById('class-list').addEventListener('click', async event => {
    const button = event.target.closest('[data-book]');
    if (!button || button.disabled) return;
    button.disabled = true;
    let result;
    try { result = await api('member-book', {schedule_id:button.dataset.book,date:button.dataset.date}); }
    catch (error) { await loadSchedule(); setStatus(document.getElementById('schedule-status'),error.message,true); return; }
    try { await loadAccount(); await loadSchedule(); setStatus(document.getElementById('schedule-status'),result.message); }
    catch { setStatus(document.getElementById('schedule-status'), 'Your booking was saved. Refresh the page to update your account.'); }
});
document.getElementById('upcoming-bookings').addEventListener('click', event => {
    const button = event.target.closest('[data-cancel]');
    if (!button) return;
    cancelId = Number(button.dataset.cancel);
    const booking = account.bookings.find(b => Number(b.id) === cancelId);
    document.getElementById('cancel-description').textContent = `${booking.name} · ${dateLabel(booking.date)} · ${booking.start_time}. Your spot will become available to another member.`;
    setStatus(document.getElementById('cancel-status'));
    cancelDialog.showModal();
});
document.getElementById('keep-booking').addEventListener('click',()=>cancelDialog.close());
document.getElementById('confirm-cancel').addEventListener('click',async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
        const result = await api('member-cancel',{id:cancelId});
        cancelDialog.close();
        setStatus(status,result.message);
        try { await loadAccount(); } catch { setStatus(status, 'Your booking was cancelled. Refresh the page to update your account.'); }
    } catch(error) { setStatus(document.getElementById('cancel-status'),error.message,true); }
    finally { button.disabled = false; }
});
for (const [id, action] of [['profile-form','member-profile'],['password-form','member-password']]) {
    document.getElementById(id).addEventListener('submit',async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button');
        const message = form.querySelector('.form-status');
        button.disabled = true;
        setStatus(message,'Saving…');
        try {
            const result = await api(action,Object.fromEntries(new FormData(form)));
            form.querySelectorAll('input[type="password"]').forEach(el=>el.value='');
            setStatus(message,result.message);
            if(action === 'member-profile') { try { await loadAccount(); } catch { setStatus(message, 'Your profile was saved. Refresh the page to see the latest details.'); } }
        } catch(error) { setStatus(message,error.message,true); }
        finally { button.disabled=false; }
    });
}
async function initialise() {
    document.getElementById('retry-load').hidden = true;
    try { await loadAccount(); setStatus(status); route(); }
    catch(error) { setStatus(status,error.message,true); document.getElementById('retry-load').hidden = false; }
}
document.getElementById('retry-load').addEventListener('click',initialise);
route();
initialise();
