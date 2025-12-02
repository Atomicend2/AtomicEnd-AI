const loginForm = document.getElementById('login-form');
const dashboard = document.getElementById('dashboard');
const passwordInput = document.getElementById('password-input');
const loginBtn = document.getElementById('login-btn');
const loginMessage = document.getElementById('login-message');
const submissionsList = document.getElementById('submissions-list');
const refreshBtn = document.getElementById('refresh-btn');
const logoutBtn = document.getElementById('logout-btn');
const dashboardMessage = document.getElementById('dashboard-message');

const ADMIN_TOKEN_KEY = 'atomicEndAdminToken';

// --- Display Logic ---
function showDashboard(submissions) {
    loginForm.style.display = 'none';
    dashboard.style.display = 'block';
    submissionsList.innerHTML = '';
    
    if (submissions.length === 0) {
        submissionsList.innerHTML = '<p style="text-align:center; color:#ccc;">No submissions found in current server session cache.</p>';
        return;
    }

    submissions.forEach(sub => {
        const li = document.createElement('li');
        li.className = 'submission-item';
        li.innerHTML = `
            <strong>Contact: ${sub.contact}</strong>
            <div class="message-content">${sub.message}</div>
            <small>Submitted: ${new Date(sub.timestamp).toLocaleString()}</small>
        `;
        submissionsList.appendChild(li);
    });
}

function showLogin() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    loginForm.style.display = 'block';
    dashboard.style.display = 'none';
    passwordInput.value = '';
    loginMessage.textContent = '';
}

// --- Fetch Logic ---
async function fetchSubmissions() {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
        showLogin();
        return;
    }

    dashboardMessage.textContent = 'Loading submissions...';

    try {
        const response = await fetch('/admin-submissions', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 403) {
            dashboardMessage.textContent = 'Session expired. Please log in again.';
            showLogin();
            return;
        }

        const data = await response.json();
        
        if (data.success) {
            dashboardMessage.textContent = '';
            showDashboard(data.submissions.reverse()); // Show newest first
        } else {
            dashboardMessage.textContent = `Error: ${data.message}`;
        }
    } catch (error) {
        console.error('Fetch submissions error:', error);
        dashboardMessage.textContent = 'Network error or server unreachable.';
    }
}

// --- Event Handlers ---
loginBtn.onclick = async () => {
    const password = passwordInput.value;
    if (password.length === 0) {
        loginMessage.textContent = 'Password is required.';
        return;
    }

    loginMessage.textContent = 'Logging in...';

    try {
        const response = await fetch('/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
            await fetchSubmissions();
        } else {
            loginMessage.textContent = data.message || 'Login failed.';
        }
    } catch (error) {
        console.error('Login error:', error);
        loginMessage.textContent = 'Network error during login.';
    }
};

refreshBtn.onclick = fetchSubmissions;

logoutBtn.onclick = showLogin;

// --- Initial Load ---
if (localStorage.getItem(ADMIN_TOKEN_KEY)) {
    fetchSubmissions();
} else {
    showLogin();
}