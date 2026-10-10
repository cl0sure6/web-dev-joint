const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
const view = document.getElementById('admin-view');
const status = document.getElementById('admin-status');
const addButton = document.getElementById('add-record');
const recordDialog = document.getElementById('record-dialog');
const deleteDialog = document.getElementById('delete-dialog');
const recordForm = document.getElementById('record-form');
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let club = null;
let activeSection = 'overview';
let editingId = 0;
let deletingRecord = null;

// One small field definition per editor; no frontend framework or build step.
const editors = {
    trainers: {
        title: 'Trainers', singular: 'trainer', description: 'The people helping your members make progress.',
        fields: [
            { name: 'name', label: 'Full name', max: 100 },
            { name: 'specialization', label: 'Specialization', max: 200 },
            { name: 'experience', label: 'Experience (years)', type: 'number', min: 0, max: 80, value: 0 },
            { name: 'education', label: 'Education & certificates', type: 'textarea', max: 1000, optional: true },
        ],
        columns: ['Name', 'Specialization', 'Experience', 'Education'],
        cells: (row) => [row.name, row.specialization, `${row.experience} years`, row.education || '—'],
    },
    classes: {
        title: 'Classes', singular: 'class', description: 'Create the programmes your members will come back for.',
        fields: [
            { name: 'name', label: 'Class name', max: 100 },
            { name: 'description', label: 'Description', type: 'textarea', max: 2000, optional: true },
            { name: 'trainer_id', label: 'Trainer', type: 'select', source: 'trainers', optional: true },
            { name: 'capacity', label: 'Capacity (people)', type: 'number', min: 1, max: 500, value: 20 },
            { name: 'duration', label: 'Duration (minutes)', type: 'number', min: 5, max: 300, value: 60 },
        ],
        columns: ['Class', 'Trainer', 'Capacity', 'Duration'],
        cells: (row) => [row.name, findName('trainers', row.trainer_id), `${row.capacity} people`, `${row.duration} min`],
    },
    schedule: {
        title: 'Schedule', singular: 'session', description: 'Give each class a day, a time, and a space.',
        fields: [
            { name: 'class_id', label: 'Class', type: 'select', source: 'classes' },
            { name: 'weekday', label: 'Day', type: 'select', options: weekdays.map((name, index) => [index + 1, name]) },
            { name: 'start_time', label: 'Start time', type: 'time', value: '09:00' },
            { name: 'room', label: 'Room / zone', max: 100 },
        ],
        columns: ['Class', 'Day', 'Time', 'Room'],
        cells: (row) => [findName('classes', row.class_id), weekdays[row.weekday - 1], row.start_time, row.room],
    },
    memberships: {
        title: 'Memberships', singular: 'membership', description: 'Set the plans, prices, and terms shown on the website.',
        fields: [
            { name: 'name', label: 'Plan name', max: 100 },
            { name: 'slug', label: 'Plan code (lowercase letters, numbers, hyphens)', max: 60, pattern: '[a-z0-9-]+' },
            { name: 'description', label: 'What is included?', type: 'textarea', max: 2000 },
            { name: 'price', label: 'Price (₸)', type: 'number', min: 0, max: 100000000 },
            { name: 'duration_days', label: 'Duration (days)', type: 'number', min: 1, max: 3650, value: 30 },
            { name: 'featured', label: 'Featured plan', type: 'select', options: [[0, 'Standard'], [1, 'Best Value']] },
        ],
        columns: ['Plan', 'Price', 'Duration', 'Highlight'],
        cells: (row) => [row.name, `${Number(row.price).toLocaleString('en-US')} ₸`, `${row.duration_days} days`, row.featured ? 'Best Value' : 'Standard'],
    },
    news: {
        title: 'News & events', singular: 'update', description: 'Keep your community in the loop. Future dates publish automatically on that date.',
        fields: [
            { name: 'title', label: 'Title', max: 200 },
            { name: 'category', label: 'Category', max: 60, value: 'Club news' },
            { name: 'body', label: 'Update', type: 'textarea', max: 4000 },
            { name: 'published_on', label: 'Publication date', type: 'date', value: localDate() },
        ],
        columns: ['Title', 'Category', 'Publication date', 'Update'],
        cells: (row) => [row.title, row.category, row.published_on, row.body],
    },
    faqs: {
        title: 'FAQ', singular: 'question', description: 'Clear answers to the questions members ask most.',
        fields: [
            { name: 'question', label: 'Question', max: 300 },
            { name: 'answer', label: 'Answer', type: 'textarea', max: 3000 },
            { name: 'position', label: 'Display order (lowest first)', type: 'number', min: 0, max: 1000, value: 1 },
        ],
        columns: ['Question', 'Answer', 'Order'],
        cells: (row) => [row.question, row.answer, row.position],
    },
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function localDate() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function findName(table, id) {
    return club[table].find((record) => Number(record.id) === Number(id))?.name || 'Unassigned';
}

async function request(action, data) {
    const response = await fetch(`../api.php?action=${encodeURIComponent(action)}`, {
        method: data ? 'POST' : 'GET',
        headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {},
        credentials: 'same-origin',
        body: data ? JSON.stringify(data) : undefined,
    });
    const result = await response.json();
    if (response.status === 401) {
        window.location.href = 'login.php';
        throw new Error('Your session expired. Please sign in again.');
    }
    if (!response.ok) {
        throw new Error(result.error || 'Unable to complete the request.');
    }
    return result;
}

function setStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('form-status--error', error);
}

async function loadData() {
    view.setAttribute('aria-busy', 'true');
    try {
        club = await request('admin-data');
        render();
    } finally {
        view.setAttribute('aria-busy', 'false');
    }
}

function tableHtml(columns, rows, tableName, actions = true) {
    if (!rows.length) {
        return `<div class="empty-state"><span aria-hidden="true">＋</span><h2>Room for something new.</h2><p>No ${escapeHtml(tableName === 'messages' ? 'messages' : tableName)} yet.${editors[tableName] ? ' Add the first record to get started.' : ''}</p></div>`;
    }
    return `<div class="table-scroll"><table class="admin-table"><caption class="sr-only">${escapeHtml(tableName)} records</caption><thead><tr>${columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}${actions ? '<th scope="col">Actions</th>' : ''}</tr></thead><tbody>${rows.map(({ record, cells }) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}${actions ? `<td class="table-actions">${editors[tableName] ? `<button class="text-button" data-edit="${record.id}" aria-label="Edit ${escapeHtml(record.name || record.title || record.question || 'record')}">Edit</button>` : `<button class="text-button" data-toggle="${record.id}">${tableName === 'reviews' ? (record.published ? 'Unpublish' : 'Publish') : (record.is_read ? 'Mark unread' : 'Mark read')}</button>`}<button class="text-button text-button--danger" data-delete="${record.id}" aria-label="Delete ${escapeHtml(record.name || record.title || record.question || 'record')}">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function renderOverview() {
    const unread = club.messages.filter((message) => !message.is_read).length;
    const pending = club.reviews.filter((review) => !review.published).length;
    const upcoming = club.bookings.filter((booking) => booking.status === 'confirmed' && booking.date >= localDate());
    view.innerHTML = `<div class="stats-grid">
        ${[['Members', club.users.filter((user) => user.role === 'user').length, 'users'], ['Active classes', club.classes.length, 'classes'], ['Upcoming bookings', upcoming.length, 'bookings'], ['Unread enquiries', unread, 'messages']].map(([label, count, hash]) => `<a href="#${hash}" class="stat-card"><span>${label}</span><strong>${count}</strong><span class="stat-arrow" aria-hidden="true">↗</span></a>`).join('')}
        </div><div class="overview-grid"><section class="overview-panel"><div class="panel-heading"><h2>On your radar.</h2><span class="eyebrow">THE NEXT LITTLE THING</span></div><a href="#messages" class="task-row"><span>Member enquiries</span><strong>${unread} unread →</strong></a><a href="#reviews" class="task-row"><span>Stories to review</span><strong>${pending} pending →</strong></a><a href="#schedule" class="task-row"><span>Weekly sessions</span><strong>${club.schedule.length} scheduled →</strong></a><a href="#settings" class="task-row"><span>Club details & opening hours</span><strong>Edit →</strong></a></section><section class="overview-note"><p class="eyebrow">SMALL CHANGES. BETTER DAYS.</p><h2>Keep the club<br>in good form.</h2><p>Updated schedules, clear information, and a quick reply. A great member experience starts here.</p><a href="#news" class="text-link">Share a club update ↗</a><span class="overview-note-mark" aria-hidden="true">✳</span></section></div><section class="overview-panel"><div class="panel-heading"><h2>Upcoming bookings</h2><a href="#bookings" class="text-link">View all ↗</a></div>${tableHtml(['Member', 'Class', 'Date', 'Time'], upcoming.slice(0, 5).map((record) => ({ record, cells: [record.member, record.class_name, record.date, record.start_time] })), 'bookings', false)}</section>`;
}

function render() {
    const hash = window.location.hash.slice(1) || 'overview';
    activeSection = ['overview', 'users', 'bookings', 'reviews', 'messages', 'settings', ...Object.keys(editors)].includes(hash) ? hash : 'overview';
    document.querySelectorAll('.admin-nav a').forEach((link) => {
        if (link.hash === `#${activeSection}`) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
    addButton.hidden = !editors[activeSection];
    const title = document.getElementById('admin-title');
    const description = document.getElementById('admin-description');
    document.getElementById('admin-eyebrow').textContent = activeSection === 'overview' ? 'YOUR CLUB, AT A GLANCE' : 'YOUR CLUB / ' + activeSection.toUpperCase();
    if (activeSection === 'overview') {
        title.textContent = 'The daily overview.';
        description.textContent = 'A clear picture of what is happening at the club.';
        renderOverview();
        return;
    }
    const editor = editors[activeSection];
    if (editor) {
        title.textContent = editor.title;
        description.textContent = editor.description;
        addButton.textContent = `+ Add ${editor.singular}`;
        const records = activeSection === 'schedule' ? [...club.schedule].sort((first, second) => first.weekday - second.weekday || first.start_time.localeCompare(second.start_time)) : club[activeSection];
        view.innerHTML = tableHtml(editor.columns, records.map((record) => ({ record, cells: editor.cells(record) })), activeSection);
        return;
    }
    const labels = {
        users: ['Members & staff', 'Registered accounts. Member registration is managed by the member-account part of the project.'],
        bookings: ['Bookings', 'All class reservations, including cancellations. Online booking is managed by the booking part of the project.'],
        reviews: ['Member stories', 'Approve reviews before they appear on the homepage.'],
        messages: ['The club inbox.', 'Enquiries from the homepage. Reply using the email address provided.'],
        settings: ['Club information', 'Keep the homepage details and contact information up to date.'],
    };
    [title.textContent, description.textContent] = labels[activeSection];
    if (activeSection === 'settings') {
        renderSettings();
        return;
    }
    const definitions = {
        users: { columns: ['Name', 'Email', 'Role', 'Joined'], cells: (row) => [row.name, row.email, row.role, row.created_at.slice(0, 10)] },
        bookings: { columns: ['Member', 'Email', 'Phone', 'Class', 'Date', 'Time', 'Status'], cells: (row) => [row.member, row.email || '—', row.phone || '—', row.class_name, row.date, row.start_time, row.status] },
        reviews: { columns: ['Member', 'Rating', 'Story', 'Status', 'Date'], cells: (row) => [row.name, `${row.rating} / 5`, row.comment, row.published ? 'Published' : 'Pending', row.created_at.slice(0, 10)] },
        messages: { columns: ['From', 'Email', 'Message', 'Status', 'Date'], cells: (row) => [row.name, row.email, row.message, row.is_read ? 'Read' : 'Unread', row.created_at.slice(0, 10)] },
    };
    const definition = definitions[activeSection];
    view.innerHTML = tableHtml(definition.columns, club[activeSection].map((record) => ({ record, cells: definition.cells(record) })), activeSection, ['reviews', 'messages'].includes(activeSection));
}

function fieldHtml(field, value) {
    const attributes = `name="${field.name}" ${field.optional ? '' : 'required'}`;
    let control;
    if (field.type === 'select') {
        let options = field.source ? club[field.source].map((record) => [record.id, record.name]) : field.options;
        if (field.optional) {
            options = [['', 'Unassigned'], ...options];
        } else if (field.source) {
            options = [['', `Choose a ${field.source === 'classes' ? 'class' : 'trainer'}`], ...options];
        }
        control = `<select ${attributes}>${options.map(([id, label]) => `<option value="${escapeHtml(id)}" ${String(value ?? '') === String(id) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
    } else if (field.type === 'textarea') {
        control = `<textarea ${attributes} rows="4" maxlength="${field.max}">${escapeHtml(value ?? '')}</textarea>`;
    } else {
        control = `<input ${attributes} type="${field.type || 'text'}" value="${escapeHtml(value ?? '')}" ${field.type === 'number' ? `min="${field.min}" max="${field.max}" step="1"` : (field.max ? `maxlength="${field.max}"` : '')} ${field.pattern ? `pattern="${field.pattern}"` : ''}>`;
    }
    return `<label>${escapeHtml(field.label)}${control}</label>`;
}

function openEditor(id = 0) {
    const editor = editors[activeSection];
    if (activeSection === 'schedule' && !club.classes.length) {
        setStatus('Create a class first, then add it to the schedule.', true);
        return;
    }
    editingId = id;
    const record = club[activeSection].find((item) => Number(item.id) === Number(id)) || {};
    document.getElementById('dialog-title').textContent = `${id ? 'Edit' : 'Add'} ${editor.singular}`;
    document.getElementById('record-fields').innerHTML = editor.fields.map((field) => fieldHtml(field, record[field.name] ?? field.value)).join('');
    document.getElementById('dialog-status').textContent = '';
    recordDialog.showModal();
}

function renderSettings() {
    const fields = [
        { name: 'club_name', label: 'Club name', max: 2000 },
        { name: 'tagline', label: 'Tagline', max: 2000 },
        { name: 'about', label: 'About the club', type: 'textarea', max: 2000 },
        { name: 'history', label: 'Club history', type: 'textarea', max: 2000 },
        { name: 'opened', label: 'Opening date / note', max: 2000 },
        { name: 'address', label: 'Address', max: 2000 },
        { name: 'phone', label: 'Phone', type: 'tel', optional: true, max: 30 },
        { name: 'email', label: 'Email', type: 'email', optional: true, max: 200 },
        { name: 'map_url', label: 'Map link (https://)', type: 'url', optional: true, max: 2000 },
        { name: 'weekday_hours', label: 'Monday – Friday hours', max: 2000 },
        { name: 'weekend_hours', label: 'Saturday – Sunday hours', max: 2000 },
    ];
    view.innerHTML = `<form id="settings-form" class="settings-form stacked-form"><div class="settings-grid">${fields.map((field) => fieldHtml(field, club.settings[field.name])).join('')}</div><button class="button" type="submit">Save club information ↗</button></form>`;
    document.getElementById('settings-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button');
        button.disabled = true;
        try {
            const result = await request('settings', Object.fromEntries(new FormData(event.currentTarget)));
            await loadData();
            setStatus(result.message);
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            button.disabled = false;
        }
    });
}

addButton.addEventListener('click', () => openEditor());
document.getElementById('close-dialog').addEventListener('click', () => recordDialog.close());
document.getElementById('cancel-dialog').addEventListener('click', () => recordDialog.close());
document.getElementById('cancel-delete').addEventListener('click', () => deleteDialog.close());
recordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = recordForm.querySelector('button[type="submit"]');
    const dialogStatus = document.getElementById('dialog-status');
    button.disabled = true;
    dialogStatus.textContent = 'Saving…';
    try {
        const result = await request('save', { ...Object.fromEntries(new FormData(recordForm)), table: activeSection, id: editingId });
        recordDialog.close();
        await loadData();
        setStatus(result.message);
    } catch (error) {
        dialogStatus.textContent = error.message;
        dialogStatus.classList.add('form-status--error');
    } finally {
        button.disabled = false;
    }
});

view.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    const toggle = event.target.closest('[data-toggle]');
    if (edit) {
        openEditor(Number(edit.dataset.edit));
    }
    if (remove) {
        deletingRecord = { table: activeSection, id: Number(remove.dataset.delete) };
        document.getElementById('delete-status').textContent = '';
        document.getElementById('delete-description').textContent = activeSection === 'trainers' ? 'The trainer will be removed. Their classes will become unassigned.' : 'This will permanently remove the record. Linked bookings or schedules may need to be removed first.';
        deleteDialog.showModal();
    }
    if (toggle) {
        const id = Number(toggle.dataset.toggle);
        const record = club[activeSection].find((item) => Number(item.id) === id);
        const key = activeSection === 'reviews' ? 'published' : 'is_read';
        toggle.disabled = true;
        try {
            await request('save', { table: activeSection, id, [key]: record[key] ? 0 : 1 });
            await loadData();
            setStatus('Changes saved.');
        } catch (error) {
            setStatus(error.message, true);
            toggle.disabled = false;
        }
    }
});
document.getElementById('confirm-delete').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
        const result = await request('delete', deletingRecord);
        deleteDialog.close();
        await loadData();
        setStatus(result.message);
    } catch (error) {
        document.getElementById('delete-status').textContent = error.message;
        document.getElementById('delete-status').classList.add('form-status--error');
    } finally {
        document.getElementById('confirm-delete').disabled = false;
    }
});
window.addEventListener('hashchange', () => {
    recordDialog.close();
    deleteDialog.close();
    setStatus('');
    if (club) {
        render();
    }
});
loadData().catch((error) => {
    view.innerHTML = '<div class="empty-state"><h2>Unable to load the club.</h2><p>Refresh the page to try again.</p></div>';
    setStatus(error.message, true);
});

