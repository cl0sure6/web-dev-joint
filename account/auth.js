const authForm = document.getElementById('auth-form');
authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('auth-status');
    const button = authForm.querySelector('button');
    const data = Object.fromEntries(new FormData(authForm));
    if ('password_confirmation' in data && data.password !== data.password_confirmation) {
        status.textContent = 'The passwords do not match.';
        status.classList.add('form-status--error');
        return;
    }
    button.disabled = true;
    status.classList.remove('form-status--error');
    status.textContent = 'Just a moment…';
    try {
        const response = await fetch(`../api.php?action=${authForm.dataset.action}`, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content },
            body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Please try again.');
        try {
            sessionStorage.setItem('formAuthNotice', authForm.dataset.action === 'member-register'
                ? 'Your account has been created. Welcome to FORM!'
                : 'You have signed in successfully.');
        } catch { /* Navigation also works when browser storage is unavailable. */ }
        window.location.href = '../index.html';
    } catch (error) {
        status.textContent = error instanceof TypeError || error instanceof SyntaxError ? 'We could not reach the club. Please try again shortly.' : error.message;
        status.classList.add('form-status--error');
        button.disabled = false;
    }
});
