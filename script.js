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
        if (session.user) {
            document.querySelectorAll('[data-account-link]').forEach(accountLink => {
            accountLink.textContent = session.user.role === 'admin' ? 'Administration ↗' : 'My account ↗';
            accountLink.href = session.user.role === 'admin' ? 'admin/index.php' : 'account/index.php';
            });
        }
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



// ========================================
// COACHES PAGE FUNCTIONALITY
// ========================================

// Coach filtering

const coachFilters = document.querySelectorAll(".coach-filter");
const coachCards = document.querySelectorAll(".coach-card");

coachFilters.forEach(button => {

    button.addEventListener("click", () => {

        const selectedCategory = button.dataset.filter;

        // Remove active class from all buttons
        coachFilters.forEach(btn => {
            btn.classList.remove("active");
        });

        // Activate clicked button
        button.classList.add("active");

        // Filter coach cards
        coachCards.forEach(card => {

            const coachCategory = card.dataset.category;

            if (
                selectedCategory === "all" ||
                selectedCategory === coachCategory
            ) {
                card.hidden = false;
            } else {
                card.hidden = true;
            }

        });

    });

});


// ========================================
// BOOK A SESSION
// ========================================

const coachBookingButtons =
    document.querySelectorAll(".coach-book-btn");

coachBookingButtons.forEach(button => {

    button.addEventListener("click", () => {

        const coachName = button.dataset.coach;

        // Get existing contact form
        const contactMessage = document.querySelector(
            "#contact-form textarea[name='message']"
        );

        // Automatically insert selected coach
        if (contactMessage) {

            contactMessage.value =
                `Hello! I would like to book a personal training session with ${coachName}. Please contact me with available dates and times.`;

        }

        // Redirect to contact section
        window.location.hash = "contacts";

    });

});

// ========================================
// GROUP EXERCISES FUNCTIONALITY
// ========================================


// FILTER ELEMENTS

const groupFilterButtons =
    document.querySelectorAll(".group-filter");

const groupCards =
    document.querySelectorAll(".group-card");

const groupCount =
    document.getElementById("group-count");


// ========================================
// FILTER CLASSES BY DIFFICULTY
// ========================================

groupFilterButtons.forEach(button => {

    button.addEventListener("click", () => {

        // Selected difficulty
        const selectedLevel = button.dataset.level;


        // Remove active state
        groupFilterButtons.forEach(btn => {
            btn.classList.remove("active");
            btn.setAttribute("aria-pressed", "false");
        });


        // Activate selected filter
        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");


        // Count visible classes
        let visibleClasses = 0;


        // Filter cards
        groupCards.forEach(card => {

            const cardLevel = card.dataset.level;

            const shouldShow =
                selectedLevel === "all" ||
                selectedLevel === cardLevel;


            // Show or hide card
            card.hidden = !shouldShow;


            if (shouldShow) {
                visibleClasses++;
            }

        });


        // Update counter
        groupCount.textContent = visibleClasses;

    });

});


// Set initial filter accessibility state

groupFilterButtons.forEach(button => {
    button.setAttribute(
        "aria-pressed",
        String(button.classList.contains("active"))
    );
});


// ========================================
// VIEW SCHEDULE BUTTON
// ========================================

// Remember the selected class.
// The Schedule page will use this in the next stage.

const groupScheduleButtons =
    document.querySelectorAll(".group-schedule-btn");

groupScheduleButtons.forEach(button => {

    button.addEventListener("click", () => {

        const selectedClass = button.dataset.class;

        // Save class selection in this browser tab
        sessionStorage.setItem(
            "selectedFitnessClass",
            selectedClass
        );

    });

});


// ========================================
// CLASS SCHEDULE & ONLINE BOOKING (SQLite-backed)
// ========================================
const scheduleDays = [...document.querySelectorAll('.schedule-day')];
const scheduleFilter = document.getElementById('schedule-class-filter');
const scheduleList = document.getElementById('schedule-list');
const scheduleEmpty = document.getElementById('schedule-empty');
const dateInput = document.getElementById('booking-date');
const bookingForm = document.getElementById('booking-form');
const weekdayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let selectedDay = 'monday';
let selectedClass = 'all';
let displayedSessions = [];
let bookingSelection = null;

function localISO(date) {
    return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function nextDateForDay(day) {
    const numbers = {sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
    const date = new Date();
    date.setHours(0,0,0,0);
    date.setDate(date.getDate()+(numbers[day]-date.getDay()+7)%7);
    return localISO(date);
}
async function fetchPublicSchedule(date) {
    const response=await fetch(`api.php?action=public-schedule&date=${encodeURIComponent(date)}`,{credentials:'same-origin'});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Unable to load schedule.');
    return result;
}
function endAt(start,minutes) {
    const [h,m]=start.split(':').map(Number);
    const total=h*60+m+Number(minutes);
    return `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
async function loadSchedule() {
    const date = nextDateForDay(selectedDay);
    document.getElementById('schedule-selected-day').textContent = `${selectedDay[0].toUpperCase()+selectedDay.slice(1)} · ${date}`;
    scheduleList.textContent = 'Loading available sessions...';
    try {
        const result = await fetchPublicSchedule(date);
        displayedSessions = result.sessions;
        const rows=displayedSessions.filter(row=>selectedClass==='all'||row.class_name.toLowerCase().replaceAll(' ','-')===selectedClass || (selectedClass==='functional' && row.class_name.toLowerCase()==='functional training'));
        document.getElementById('schedule-results-count').textContent = rows.length;
        scheduleList.innerHTML='';
        scheduleEmpty.hidden=rows.length>0;
        rows.forEach(item=>{
            const row=document.createElement('div');row.className='schedule-row';
            const available=Number(item.available);
            const percent=100*available/Number(item.capacity);
            const past=new Date(`${date}T${item.start_time}:00`)<=new Date();
            row.innerHTML=`<div class="schedule-time"><strong>${escapeHtml(item.start_time)}</strong><span>Until ${endAt(item.start_time,item.duration)}</span></div>
              <div class="schedule-class-info"><h4>${escapeHtml(item.class_name)}</h4><span class="schedule-category">${escapeHtml(item.room)}</span></div>
              <div class="schedule-coach">${escapeHtml(item.coach)}</div>
              <div class="schedule-availability"><span class="schedule-spots">${available} / ${item.capacity} spots</span><div class="schedule-spots-bar"><div class="schedule-spots-fill" style="width:${percent}%"></div></div></div>
              <button type="button" class="schedule-book-btn" data-id="${item.id}" ${available===0||past?'disabled':''}>${past?'Finished':available===0?'Class Full':'Book Now'} <span>↗</span></button>`;
            scheduleList.append(row);
        });
    } catch(err) { scheduleList.textContent=err.message; scheduleEmpty.hidden=true; }
}
function applyClassFromGroup() {
    const stored=sessionStorage.getItem('selectedFitnessClass');
    if(stored && [...scheduleFilter.options].some(o=>o.value===stored)) {
        selectedClass=stored;scheduleFilter.value=stored;
    }
    sessionStorage.removeItem('selectedFitnessClass');
    loadSchedule();
}
scheduleDays.forEach(day=>{
    day.setAttribute('aria-pressed',String(day.classList.contains('active')));
    day.addEventListener('click',()=>{
        selectedDay=day.dataset.day;
        scheduleDays.forEach(b=>{b.classList.toggle('active',b===day);b.setAttribute('aria-pressed',String(b===day));});
        loadSchedule();
    });
});
scheduleFilter.addEventListener('change',()=>{selectedClass=scheduleFilter.value;loadSchedule();});
document.getElementById('schedule-reset').addEventListener('click',()=>{selectedClass='all';scheduleFilter.value='all';loadSchedule();});
window.addEventListener('hashchange',()=>{
    if(location.hash==='#working-hours') applyClassFromGroup();
    if(location.hash==='#online-booking') loadBookingSelection();
});
scheduleList.addEventListener('click',event=>{
    const btn=event.target.closest('.schedule-book-btn');
    if(!btn||btn.disabled)return;
    const row=displayedSessions.find(s=>Number(s.id)===Number(btn.dataset.id));
    if(!row)return;
    bookingSelection={...row,date:nextDateForDay(selectedDay)};
    sessionStorage.setItem('bookingSelection',JSON.stringify(bookingSelection));
    location.hash='#online-booking';
    loadBookingSelection();
});
async function loadBookingSelection() {
    const message=document.getElementById('booking-status');
    message.textContent='';
    try {bookingSelection=JSON.parse(sessionStorage.getItem('bookingSelection')||'null');}
    catch {bookingSelection=null;}
    const valid=bookingSelection&&bookingSelection.id&&bookingSelection.date;
    document.getElementById('booking-submit').disabled=!valid;
    if(!valid){message.textContent='Choose a class in Schedule first.';return;}
    document.getElementById('booking-class').textContent=bookingSelection.class_name;
    document.getElementById('booking-coach').textContent=bookingSelection.coach;
    document.getElementById('booking-time').textContent=bookingSelection.start_time;
    dateInput.value=bookingSelection.date;
    dateInput.min=localISO(new Date());
    const max=new Date(); max.setDate(max.getDate()+30); dateInput.max=localISO(max);
    await checkBookingDate();
}
async function checkBookingDate() {
    if(!bookingSelection)return;
    const date=dateInput.value;
    document.getElementById('booking-date-label').textContent=date||'—';
    const status=document.getElementById('booking-status');
    const btn=document.getElementById('booking-submit');btn.disabled=true;
    if(!date)return;
    const chosen=new Date(date+'T12:00:00');
    const original=new Date(bookingSelection.date+'T12:00:00');
    if(chosen.getDay()!==original.getDay()) {status.textContent='Choose the same weekday as your selected session.';return;}
    try {
        const result=await fetchPublicSchedule(date);
        const live=result.sessions.find(row=>Number(row.id)===Number(bookingSelection.id));
        if(!live){status.textContent='Session no longer available.';return;}
        bookingSelection={...live,date};
        document.getElementById('booking-spots').textContent=`${live.available} / ${live.capacity}`;
        const past=new Date(`${date}T${live.start_time}:00`)<=new Date();
        status.textContent=past?'This class has already started.':live.available<1?'This class is full.':'';
        btn.disabled=past||live.available<1;
    } catch(error){status.textContent=error.message;}
}
dateInput.addEventListener('change',checkBookingDate);
bookingForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const btn=document.getElementById('booking-submit');const status=document.getElementById('booking-status');
    if(!bookingSelection||btn.disabled)return;
    btn.disabled=true;status.textContent='Confirming your reservation...';
    const values=Object.fromEntries(new FormData(bookingForm));
    try {
        const result=await request('guest-book',{schedule_id:Number(bookingSelection.id),...values});
        status.textContent=`✓ ${result.message} Reference #${result.booking_id}.`;
        bookingForm.reset();sessionStorage.removeItem('bookingSelection');bookingSelection=null;
        await loadSchedule();
    } catch(error){status.textContent=error.message;btn.disabled=false;}
});
if(location.hash==='#working-hours')applyClassFromGroup();else loadSchedule();
if(location.hash==='#online-booking')loadBookingSelection();
