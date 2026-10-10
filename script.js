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
// CLASS SCHEDULE FUNCTIONALITY
// ========================================


// ========================================
// 1. CLASS INFORMATION
// ========================================

const fitnessClasses = {

    yoga: {
        name: "Yoga",
        coach: "Sophia Williams",
        duration: 60,
        capacity: 15,
        level: "Beginner"
    },

    pilates: {
        name: "Pilates",
        coach: "Olivia Brown",
        duration: 50,
        capacity: 12,
        level: "Beginner"
    },

    swimming: {
        name: "Swimming",
        coach: "Emma Thompson",
        duration: 45,
        capacity: 10,
        level: "Intermediate"
    },

    stretching: {
        name: "Stretching",
        coach: "Olivia Brown",
        duration: 45,
        capacity: 15,
        level: "Beginner"
    },

    functional: {
        name: "Functional Training",
        coach: "Alex Morgan",
        duration: 60,
        capacity: 12,
        level: "Advanced"
    },

    aerobics: {
        name: "Aerobics",
        coach: "Sophia Williams",
        duration: 50,
        capacity: 20,
        level: "Intermediate"
    }

};


// ========================================
// 2. WEEKLY SCHEDULE DATA
// ========================================

// Available spots are demo values.
// Real availability will come from SQLite later.

const weeklySchedule = {

    monday: [
        { id: 1, class: "yoga", time: "08:00", available: 8 },
        { id: 2, class: "pilates", time: "10:00", available: 6 },
        { id: 3, class: "swimming", time: "12:00", available: 4 },
        { id: 4, class: "functional", time: "17:00", available: 9 },
        { id: 5, class: "aerobics", time: "19:00", available: 12 }
    ],

    tuesday: [
        { id: 6, class: "stretching", time: "08:00", available: 10 },
        { id: 7, class: "swimming", time: "10:00", available: 5 },
        { id: 8, class: "yoga", time: "12:00", available: 7 },
        { id: 9, class: "pilates", time: "17:00", available: 8 },
        { id: 10, class: "functional", time: "19:00", available: 6 }
    ],

    wednesday: [
        { id: 11, class: "yoga", time: "08:00", available: 9 },
        { id: 12, class: "aerobics", time: "10:00", available: 13 },
        { id: 13, class: "pilates", time: "12:00", available: 5 },
        { id: 14, class: "swimming", time: "17:00", available: 3 },
        { id: 15, class: "stretching", time: "19:00", available: 11 }
    ],

    thursday: [
        { id: 16, class: "functional", time: "08:00", available: 7 },
        { id: 17, class: "yoga", time: "10:00", available: 10 },
        { id: 18, class: "swimming", time: "12:00", available: 6 },
        { id: 19, class: "aerobics", time: "17:00", available: 15 },
        { id: 20, class: "pilates", time: "19:00", available: 4 }
    ],

    friday: [
        { id: 21, class: "stretching", time: "08:00", available: 12 },
        { id: 22, class: "pilates", time: "10:00", available: 7 },
        { id: 23, class: "functional", time: "12:00", available: 8 },
        { id: 24, class: "yoga", time: "17:00", available: 6 },
        { id: 25, class: "aerobics", time: "19:00", available: 10 }
    ],

    saturday: [
        { id: 26, class: "yoga", time: "09:00", available: 11 },
        { id: 27, class: "swimming", time: "11:00", available: 4 },
        { id: 28, class: "functional", time: "13:00", available: 5 },
        { id: 29, class: "aerobics", time: "16:00", available: 14 }
    ],

    sunday: [
        { id: 30, class: "stretching", time: "09:00", available: 13 },
        { id: 31, class: "yoga", time: "11:00", available: 9 },
        { id: 32, class: "pilates", time: "13:00", available: 8 }
    ]

};


// ========================================
// 3. ELEMENTS
// ========================================

const scheduleDayButtons =
    document.querySelectorAll(".schedule-day");

const scheduleClassFilter =
    document.getElementById("schedule-class-filter");

const scheduleList =
    document.getElementById("schedule-list");

const scheduleSelectedDay =
    document.getElementById("schedule-selected-day");

const scheduleResultsCount =
    document.getElementById("schedule-results-count");

const scheduleEmpty =
    document.getElementById("schedule-empty");

const scheduleReset =
    document.getElementById("schedule-reset");


// ========================================
// 4. CURRENT STATE
// ========================================

let selectedScheduleDay = "monday";

let selectedScheduleClass = "all";


// ========================================
// 5. TIME CALCULATION
// ========================================

function calculateEndTime(startTime, duration) {

    const [hours, minutes] =
        startTime.split(":").map(Number);

    const totalMinutes =
        hours * 60 + minutes + duration;

    const endHours =
        Math.floor(totalMinutes / 60) % 24;

    const endMinutes =
        totalMinutes % 60;

    return (
        String(endHours).padStart(2, "0") +
        ":" +
        String(endMinutes).padStart(2, "0")
    );

}


// ========================================
// 6. RENDER SCHEDULE
// ========================================

function renderSchedule() {

    const dayClasses =
        weeklySchedule[selectedScheduleDay] || [];

    const filteredClasses =
        dayClasses.filter(item => {

            return (
                selectedScheduleClass === "all" ||
                item.class === selectedScheduleClass
            );

        });


    // Clear previous results
    scheduleList.innerHTML = "";


    // Update selected day
    scheduleSelectedDay.textContent =
        selectedScheduleDay.charAt(0).toUpperCase() +
        selectedScheduleDay.slice(1);


    // Update class count
    scheduleResultsCount.textContent =
        filteredClasses.length;


    // Show empty state
    if (filteredClasses.length === 0) {

        scheduleEmpty.hidden = false;

        return;

    }

    scheduleEmpty.hidden = true;


    // Generate schedule rows
    filteredClasses.forEach(item => {

        const classInfo =
            fitnessClasses[item.class];

        if (!classInfo) return;


        const endTime =
            calculateEndTime(
                item.time,
                classInfo.duration
            );


        const availabilityPercentage =
            (item.available / classInfo.capacity) * 100;


        const isFull =
            item.available <= 0;


        const row = document.createElement("div");

        row.className = "schedule-row";


        row.innerHTML = `

            <!-- TIME -->
            <div class="schedule-time">

                <strong>
                    ${item.time}
                </strong>

                <span>
                    Until ${endTime}
                </span>

            </div>


            <!-- CLASS -->
            <div class="schedule-class-info">

                <h4>
                    ${classInfo.name}
                </h4>

                <span class="schedule-category">
                    ${classInfo.level}
                </span>

            </div>


            <!-- COACH -->
            <div class="schedule-coach">

                ${classInfo.coach}

            </div>


            <!-- AVAILABLE SPOTS -->
            <div class="schedule-availability">

                <span class="schedule-spots ${isFull ? "schedule-full" : ""}">

                    ${isFull
                        ? "Fully Booked"
                        : item.available + " / " + classInfo.capacity + " spots"
                    }

                </span>

                <div class="schedule-spots-bar">

                    <div
                        class="schedule-spots-fill"
                        style="width: ${availabilityPercentage}%">
                    </div>

                </div>

            </div>


            <!-- BOOKING -->
            <button
                type="button"
                class="schedule-book-btn"
                data-schedule-id="${item.id}"
                ${isFull ? "disabled" : ""}>

                ${isFull ? "Class Full" : "Book Now"}

                <span>↗</span>

            </button>

        `;


        scheduleList.appendChild(row);

    });

}


// ========================================
// 7. WEEKDAY SWITCHING
// ========================================

scheduleDayButtons.forEach(button => {

    button.addEventListener("click", () => {

        selectedScheduleDay =
            button.dataset.day;


        scheduleDayButtons.forEach(btn => {

            btn.classList.remove("active");

            btn.setAttribute(
                "aria-pressed",
                "false"
            );

        });


        button.classList.add("active");

        button.setAttribute(
            "aria-pressed",
            "true"
        );


        renderSchedule();

    });

});


// ========================================
// 8. CLASS FILTERING
// ========================================

scheduleClassFilter.addEventListener(
    "change",
    () => {

        selectedScheduleClass =
            scheduleClassFilter.value;

        renderSchedule();

    }
);


// ========================================
// 9. RESET FILTERS
// ========================================

scheduleReset.addEventListener("click", () => {

    selectedScheduleClass = "all";

    scheduleClassFilter.value = "all";

    renderSchedule();

});


// ========================================
// 10. GROUP EXERCISES INTEGRATION
// ========================================

// Group Exercises saves selected class
// in sessionStorage before navigation.

function applySelectedFitnessClass() {

    const savedClass =
        sessionStorage.getItem("selectedFitnessClass");

    if (!savedClass) return;


    if (fitnessClasses[savedClass]) {

        selectedScheduleClass = savedClass;

        scheduleClassFilter.value = savedClass;

        renderSchedule();

    }


    // Remove temporary selection after using it
    sessionStorage.removeItem("selectedFitnessClass");

}


// Apply the filter whenever Schedule is opened

window.addEventListener("hashchange", () => {

    if (window.location.hash === "#working-hours") {

        applySelectedFitnessClass();

    }

});


// ========================================
// 11. BOOK NOW
// ========================================

scheduleList.addEventListener("click", event => {

    const button =
        event.target.closest(".schedule-book-btn");

    if (!button || button.disabled) return;


    const scheduleId =
        Number(button.dataset.scheduleId);


    // Find selected training
    const selectedTraining =
        weeklySchedule[selectedScheduleDay].find(
            item => item.id === scheduleId
        );


    if (!selectedTraining) return;


    const classInfo =
        fitnessClasses[selectedTraining.class];


    // Save chosen training for Online Booking
    sessionStorage.setItem(
        "bookingSelection",
        JSON.stringify({
            scheduleId: selectedTraining.id,
            classId: selectedTraining.class,
            className: classInfo.name,
            coach: classInfo.coach,
            weekday: selectedScheduleDay,
            time: selectedTraining.time
        })
    );


    // Temporary message until Online Booking is ready
    alert(
        "You selected " +
        classInfo.name +
        " on " +
        selectedScheduleDay +
        " at " +
        selectedTraining.time +
        ".\n\nOnline booking will be available soon."
    );

});


// ========================================
// 12. INITIALIZATION
// ========================================

scheduleDayButtons.forEach(button => {

    button.setAttribute(
        "aria-pressed",
        String(button.classList.contains("active"))
    );

});

renderSchedule();

if (window.location.hash === "#working-hours") {

    applySelectedFitnessClass();

}