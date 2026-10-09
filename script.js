// Section navigation keeps the existing project hashes and supports home anchors.
const pageSections = document.querySelectorAll('main > .page-section');
const navigation = document.querySelector('.navbar');
const menuToggle = document.querySelector('.menu-toggle');
const homeAnchors = ['contacts', 'news', 'reviews', 'faq', 'review-form'];
let csrfToken = '';

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function routePage(scroll = true) {
    const target = window.location.hash.slice(1) || 'home';
    const sectionId = homeAnchors.includes(target) ? 'home' : target;
    const exists = Array.from(pageSections).some((section) => section.id === sectionId);
    const activeId = exists ? sectionId : 'home';
    pageSections.forEach((section) => { section.hidden = section.id !== activeId; });
    document.querySelectorAll('.nav-links a').forEach((link) => {
        const current = link.hash.slice(1) === (target === 'contacts' ? 'contacts' : activeId);
        if (current) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
    document.getElementById('review-form').hidden = target !== 'review-form';
    navigation.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (scroll) {
        requestAnimationFrame(() => {
            const destination = document.getElementById(exists ? target : 'home');
            destination?.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
    }
}

menuToggle.addEventListener('click', () => {
    const open = navigation.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navigation.classList.contains('menu-open')) {
        navigation.classList.remove('menu-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.focus();
    }
});
window.addEventListener('hashchange', () => routePage());
routePage(Boolean(window.location.hash));
document.getElementById('copyright-year').textContent = new Date().getFullYear();

async function request(action, data) {
    const response = await fetch(`api.php?action=${encodeURIComponent(action)}`, {
        method: data ? 'POST' : 'GET',
        headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {},
        credentials: 'same-origin',
        body: data ? JSON.stringify(data) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Please try again shortly.');
    }
    return result;
}

function displaySettings(settings) {
    document.querySelectorAll('[data-setting]').forEach((element) => {
        if (Object.hasOwn(settings, element.dataset.setting)) {
            element.textContent = settings[element.dataset.setting];
        }
    });
    document.title = `${settings.club_name} — ${settings.tagline}`;
    ['phone', 'email'].forEach((key) => {
        const link = document.getElementById(`${key}-link`);
        link.hidden = !settings[key];
        document.getElementById(`${key}-pending`).hidden = Boolean(settings[key]);
        if (settings[key]) {
            link.textContent = settings[key];
            link.href = key === 'email' ? `mailto:${settings[key]}` : `tel:${settings[key].replace(/[^+\d]/g, '')}`;
        }
    });
    const map = document.getElementById('map-link');
    if (settings.map_url && settings.map_url.startsWith('https://')) {
        map.href = settings.map_url;
        map.hidden = false;
        document.getElementById('location-note').textContent = settings.address;
    }
}

function displayContent(content) {
    displaySettings(content.settings);
    const pricing = document.querySelector('.pricing-grid');
    pricing.innerHTML = content.memberships.length ? content.memberships.map((plan) => `
        <li class="pricing-grid__item">
            <article class="pricing-card${plan.featured ? ' pricing-card--featured' : ''}">
                ${plan.featured ? '<span class="pricing-card__badge">Best Value</span>' : ''}
                <h3 class="pricing-card__title">${escapeHtml(plan.name)}</h3>
                <p class="pricing-card__description">${escapeHtml(plan.description)}</p>
                <p class="pricing-card__cost"><data value="${plan.price}" class="pricing-card__amount">${Number(plan.price).toLocaleString('en-US')}</data> <span class="pricing-card__currency">₸</span></p>
                <p class="pricing-card__duration">${plan.duration_days} ${plan.duration_days === 1 ? 'day' : 'days'} of access</p>
                <a href="#contacts" class="pricing-card__action" data-plan="${escapeHtml(plan.name)}">Enquire about this plan</a>
            </article>
        </li>`).join('') : '<li class="small-note">Membership plans will be announced soon. Contact the club for details.</li>';
    document.getElementById('faq-list').innerHTML = content.faqs.length ? content.faqs.map((faq) => `<details><summary>${escapeHtml(faq.question)}</summary><p>${escapeHtml(faq.answer)}</p></details>`).join('') : '<p class="small-note">Have a question? Contact our team below.</p>';
    if (content.news.length) {
        document.getElementById('news-grid').innerHTML = content.news.map((item) => `<article class="news-card"><time class="news-date" datetime="${escapeHtml(item.published_on)}">${formatDate(item.published_on)}</time><p class="eyebrow">${escapeHtml(item.category)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join('');
    }
    if (content.reviews.length) {
        document.getElementById('reviews-grid').innerHTML = content.reviews.map((review) => `<article class="review-card"><p class="review-stars" aria-label="${review.rating} out of 5 stars">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</p><blockquote>${escapeHtml(review.comment)}</blockquote><cite>${escapeHtml(review.name)}</cite><time datetime="${escapeHtml(review.created_at.slice(0, 10))}">${formatDate(review.created_at)}</time></article>`).join('');
    }
}

function formatDate(value) {
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return escapeHtml(date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
}

// Existing pricing links also work while the API is loading.
document.querySelectorAll('.pricing-card__action').forEach((link) => {
    link.href = '#contacts';
    link.dataset.plan = link.closest('.pricing-card').querySelector('h3').textContent;
});
document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-plan]');
    if (link) {
        document.querySelector('#contact-form textarea').value = `I'd like to enquire about the ${link.dataset.plan} membership.`;
    }
});

async function submitForm(event, action, statusId) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById(statusId);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.classList.remove('form-status--error');
    status.textContent = 'Sending…';
    try {
        if (!csrfToken) {
            throw new Error('Online forms are unavailable. Please try again once the club service is running.');
        }
        const result = await request(action, Object.fromEntries(new FormData(form)));
        status.textContent = result.message;
        form.reset();
    } catch (error) {
        status.textContent = error.message;
        status.classList.add('form-status--error');
    } finally {
        button.disabled = false;
    }
}
document.getElementById('contact-form').addEventListener('submit', (event) => submitForm(event, 'contact', 'contact-status'));
document.getElementById('review-form').addEventListener('submit', (event) => submitForm(event, 'review', 'review-status'));

async function loadClub() {
    try {
        const session = await request('session');
        csrfToken = session.csrf;
        if (session.user?.role === 'user') {
            document.getElementById('review-fields').disabled = false;
            document.getElementById('review-access').textContent = `Signed in as ${session.user.name}. Reviews are checked by the team before publication.`;
        }
        displayContent(await request('content'));
        // Layout may shift when content arrives; restore the requested home anchor.
        if (homeAnchors.includes(window.location.hash.slice(1))) {
            routePage();
        }
    } catch (error) {
        document.getElementById('contact-status').textContent = 'Live club updates are temporarily unavailable. Online enquiries require the PHP service.';
        document.getElementById('contact-status').classList.add('form-status--error');
    }
}
loadClub();
