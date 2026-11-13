// --- FIREBASE INITIALIZATION ---
// IMPORTANT: Replace this with your own Firebase project configuration.
const firebaseConfig = {
    apiKey: "AIzaSyAuT2BclaexjC7dVfHmT43eB99GXgXOXB4",
    authDomain: "quizable-gold.firebaseapp.com",
    databaseURL: "https://quizable-gold-default-rtdb.firebaseio.com",
    projectId: "quizable-gold",
    storageBucket: "quizable-gold.firebasestorage.app",
    messagingSenderId: "822610236715",
    appId: "1:822610236715:web:d7f9feecf3d284a474a16e",
    measurementId: "G-RP9FL5RG88"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
let currentAuthUser = null;

// Global variables
let quizData = null;
let currentQuestionIndex = 0;
let studentAnswers = [];
let flaggedQuestions = new Set();
let focusLostCount = 0;
let isQuizActive = false;
let isHandlingFocusLoss = false; // Flag to prevent double counting
const MAX_ATTEMPTS = 5;
let timerInterval = null;
let devToolsInterval = null; // For DevTools detection
let allStudentResults = []; // To store all results for a quiz
let processedStudentResults = []; // To store results for PDF export
let quizStartTime = 0;
let allAdminQuizzes = []; // Global store for admin search
const adminResultsCache = {}; // Cache admin quiz results by quizId

// --- AUTHORIZED ADMINISTRATOR CONFIGURATION ---
// Add the administrator email addresses who are permitted to access the Admin Dashboard.
// (All emails should be lowercase)
const ADMIN_EMAILS = [
    // Add your admin email(s) here, e.g.:
    "ctutc.jbocales@gmail.com"
];

function isAdminUser(user) {
    if (!user || !user.email) return false;
    const email = user.email.toLowerCase().trim();
    // If ADMIN_EMAILS has entries, enforce strict whitelist check.
    if (ADMIN_EMAILS.length > 0) {
        return ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(email);
    }
    // If not yet configured with specific emails, allow logged-in teachers
    return true;
}

// --- AUTHENTICATION CONTROLLERS ---

function updateAuthUI(user) {
    currentAuthUser = user;
    const userEmailText = document.getElementById('user-display-email');
    const userAvatarInitial = document.getElementById('user-avatar-initial');
    const navAdminBtn = document.getElementById('nav-admin-btn');
    const actionAdminBtn = document.getElementById('go-to-admin-panel');

    if (user) {
        const displayName = user.displayName || user.email || 'Teacher';
        if (userEmailText) userEmailText.textContent = displayName;
        if (userAvatarInitial) userAvatarInitial.textContent = (displayName[0] || 'T').toUpperCase();

        const isAdm = isAdminUser(user);
        if (navAdminBtn) navAdminBtn.classList.toggle('hidden', !isAdm);
        if (actionAdminBtn) actionAdminBtn.classList.toggle('hidden', !isAdm);
    } else {
        if (navAdminBtn) navAdminBtn.classList.add('hidden');
        if (actionAdminBtn) actionAdminBtn.classList.add('hidden');
    }
}

// Listen to Firebase Auth state transitions
auth.onAuthStateChanged((user) => {
    updateAuthUI(user);
});

function openAuthModal(tab = 'login') {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.remove('hidden');
        switchAuthTab(tab);
    }
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
    hideAuthAlert();
}

function switchAuthTab(tab) {
    const tabLogin = document.getElementById('auth-tab-login');
    const tabReg = document.getElementById('auth-tab-register');
    const tabReset = document.getElementById('auth-tab-reset');

    const formLogin = document.getElementById('auth-login-form');
    const formReg = document.getElementById('auth-register-form');
    const formReset = document.getElementById('auth-reset-form');

    const titleEl = document.getElementById('auth-modal-title');

    [tabLogin, tabReg, tabReset].forEach(t => t && t.classList.remove('active'));
    [formLogin, formReg, formReset].forEach(f => f && f.classList.add('hidden'));
    hideAuthAlert();

    if (tab === 'login') {
        if (tabLogin) tabLogin.classList.add('active');
        if (formLogin) formLogin.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Teacher Sign In';
    } else if (tab === 'register') {
        if (tabReg) tabReg.classList.add('active');
        if (formReg) formReg.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Create Teacher Account';
    } else if (tab === 'reset') {
        if (tabReset) tabReset.classList.add('active');
        if (formReset) formReset.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Reset Password';
    }
}

function showAuthAlert(message, type = 'error') {
    const alertEl = document.getElementById('auth-alert');
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.className = `auth-alert auth-alert-${type}`;
    alertEl.classList.remove('hidden');
}

function hideAuthAlert() {
    const alertEl = document.getElementById('auth-alert');
    if (alertEl) alertEl.classList.add('hidden');
}

function formatAuthError(err) {
    if (!err || !err.code) return err.message || 'An error occurred during authentication.';
    switch (err.code) {
        case 'auth/user-not-found':
            return 'No account found with this email. Please click "Register" to create your account.';
        case 'auth/wrong-password':
        case 'auth/invalid-login-credentials':
        case 'auth/invalid-credential':
            return 'Incorrect email or password. Please try again or use the Reset tab.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists. Please Sign In.';
        case 'auth/weak-password':
            return 'Password is too weak. Please use at least 6 characters.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/operation-not-allowed':
            return 'Email/Password sign-in is not enabled in Firebase Console. Please enable it in Firebase Console -> Authentication -> Sign-in method.';
        default:
            return err.message;
    }
}

async function handleAuthLogin(e) {
    e.preventDefault();
    const email = document.getElementById('auth-login-email').value.trim();
    const password = document.getElementById('auth-login-password').value;

    showLoading();
    hideAuthAlert();
    try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        hideLoading();
        closeAuthModal();
        showToast(`Welcome back, ${cred.user.displayName || cred.user.email}!`, 'success');

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('part') === 'admin') {
            loadAdminDashboard();
        } else {
            showTeacherMenu();
        }
    } catch (err) {
        hideLoading();
        showAuthAlert(formatAuthError(err), 'error');
    }
}

async function handleAuthRegister(e) {
    e.preventDefault();
    const name = document.getElementById('auth-reg-name').value.trim();
    const email = document.getElementById('auth-reg-email').value.trim();
    const password = document.getElementById('auth-reg-password').value;
    const confirm = document.getElementById('auth-reg-confirm').value;

    if (password !== confirm) {
        showAuthAlert('Passwords do not match.', 'error');
        return;
    }

    showLoading();
    hideAuthAlert();
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        if (name) {
            await cred.user.updateProfile({ displayName: name });
        }
        hideLoading();
        closeAuthModal();
        showToast(`Account created successfully. Welcome, ${name || email}!`, 'success');

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('part') === 'admin') {
            loadAdminDashboard();
        } else {
            showTeacherMenu();
        }
    } catch (err) {
        hideLoading();
        showAuthAlert(formatAuthError(err), 'error');
    }
}

async function handleAuthReset(e) {
    e.preventDefault();
    const email = document.getElementById('auth-reset-email').value.trim();

    showLoading();
    hideAuthAlert();
    try {
        await auth.sendPasswordResetEmail(email);
        hideLoading();
        showAuthAlert('Password reset email sent! Please check your inbox.', 'success');
    } catch (err) {
        hideLoading();
        showAuthAlert(err.message, 'error');
    }
}

function handleTeacherLogout() {
    auth.signOut().then(() => {
        showToast('Logged out successfully.', 'info');
        showStudentPortal();
    }).catch(err => {
        showToast('Logout error: ' + err.message, 'error');
    });
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeFigure(figureHtml) {
    if (!figureHtml) return '';
    try {
        const temp = document.createElement('div');
        temp.innerHTML = figureHtml;
        const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'link', 'style', 'base', 'meta'];
        dangerousTags.forEach(tag => {
            temp.querySelectorAll(tag).forEach(el => el.remove());
        });
        temp.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (/^on/i.test(attr.name)) {
                    el.removeAttribute(attr.name);
                }
                if (/^(href|src|xlink:href)$/i.test(attr.name)) {
                    const val = attr.value.trim().toLowerCase();
                    if (val.startsWith('javascript:') || val.startsWith('data:text/html')) {
                        el.removeAttribute(attr.name);
                    }
                }
            });
        });
        return temp.innerHTML;
    } catch (e) {
        return '';
    }
}

// --- DATE & EXPIRY HELPER UTILITIES ---
function parseExpiryTimestamp(val) {
    if (val === null || val === undefined || val === '' || val === 0 || val === false) {
        return null;
    }
    if (typeof val === 'number') {
        return (!isNaN(val) && val > 0) ? val : null;
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed || trimmed === '0' || trimmed === 'null' || trimmed === 'undefined') return null;
        if (/^\d+$/.test(trimmed)) {
            const num = parseInt(trimmed, 10);
            return (!isNaN(num) && num > 0) ? num : null;
        }
        // Match standard local ISO/datetime strings (YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm)
        const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
        if (match) {
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const day = parseInt(match[3], 10);
            const hour = parseInt(match[4], 10);
            const minute = parseInt(match[5], 10);
            const second = match[6] ? parseInt(match[6], 10) : 0;
            const localDate = new Date(year, month, day, hour, minute, second);
            const ts = localDate.getTime();
            if (!isNaN(ts) && ts > 0) return ts;
        }
        const parsed = new Date(trimmed).getTime();
        return (!isNaN(parsed) && parsed > 0) ? parsed : null;
    }
    return null;
}

function parseExpiryInput(inputValue) {
    if (!inputValue || typeof inputValue !== 'string' || !inputValue.trim()) return null;
    const trimmed = inputValue.trim();
    // Safely parse YYYY-MM-DDTHH:mm(:ss) for all mobile browsers (iOS Safari, Android Chrome, WebViews)
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        const second = match[6] ? parseInt(match[6], 10) : 0;
        const localDate = new Date(year, month, day, hour, minute, second);
        const ts = localDate.getTime();
        return (isNaN(ts) || ts <= 0) ? null : ts;
    }
    const fallback = new Date(trimmed).getTime();
    return (isNaN(fallback) || fallback <= 0) ? null : fallback;
}

function formatDateTimeLocal(timestampOrDateStr) {
    if (!timestampOrDateStr) return '';
    const ts = parseExpiryTimestamp(timestampOrDateStr);
    if (!ts) return '';
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--success)"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--info)"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--danger)"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
    };

    toast.innerHTML = `
        ${icons[type] || icons.info}
        <span style="font-size:0.9rem; font-weight:500;">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// DOM Elements
const teacherMenu = document.getElementById('teacher-menu');
const teacherCreateSection = document.getElementById('teacher-create-section');
const teacherResultsSection = document.getElementById('teacher-results-section');
const studentSection = document.getElementById('student-section');
const quizSection = document.getElementById('quiz-section');
const resultsSection = document.getElementById('results-section');
const tabWarning = document.getElementById('tab-warning');
const attemptsCounter = document.getElementById('attempts-counter');
const timerDisplay = document.getElementById('timer-display');
const attemptsCount = document.getElementById('attempts-count');
const remainingAttempts = document.getElementById('remaining-attempts');
const confirmationModal = document.getElementById('confirmation-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const instructionModal = document.getElementById('instruction-modal');
const instructionCountdown = document.getElementById('instruction-countdown');
// MAX_ATTEMPTS is already defined globally
let persistenceKey = '';

// Attempts Widget Elements
const attemptsWidget = document.getElementById('attempts-widget');
const attemptsNumber = document.getElementById('attempts-number');
const attemptsText = document.getElementById('attempts-text');
const attemptsMessage = document.getElementById('attempts-message');

let widgetTimeout;

// Show Student Portal View
function showStudentPortal(cleanUrl = false) {
    const header = document.getElementById('app-header');
    if (header) header.classList.add('hidden');
    closeAuthModal();

    teacherMenu.classList.add('hidden');
    teacherCreateSection.classList.add('hidden');
    teacherResultsSection.classList.add('hidden');
    const adminDash = document.getElementById('admin-dashboard-section');
    if (adminDash) adminDash.classList.add('hidden');
    quizSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    studentSection.classList.remove('hidden');
    const nav = document.getElementById('quiz-navigator');
    if (nav) nav.classList.add('hidden');

    if (cleanUrl && window.history && window.history.replaceState) {
        const url = new URL(window.location);
        url.searchParams.delete('part');
        window.history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
    }
}

// Initialize based on URL parameters
function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    tabWarning.classList.add('hidden');
    if (attemptsWidget) attemptsWidget.classList.add('hidden');
    timerDisplay.classList.add('hidden');
    confirmationModal.classList.add('hidden');
    instructionModal.classList.add('hidden');
    document.getElementById('export-pdf-btn').classList.add('hidden');
    const expExcelBtnInit = document.getElementById('export-excel-btn');
    if (expExcelBtnInit) expExcelBtnInit.classList.add('hidden');

    const part = urlParams.get('part');
    const qParam = urlParams.get('q');

    if (qParam) {
        try {
            const safeBase64 = qParam.replace(/ /g, '+');
            const decoded = JSON.parse(atob(safeBase64));
            if (decoded.i && decoded.k) {
                setTimeout(() => {
                    const idField = document.getElementById(part === 'teacher' ? 'results-quiz-id' : 'student-quiz-id');
                    const keyField = document.getElementById(part === 'teacher' ? 'results-secret-key' : 'student-secret-key');
                    if (idField && keyField) {
                        idField.value = decoded.i;
                        keyField.value = decoded.k;
                        showToast(`Quiz details loaded from link.`, 'success');

                        if (part === 'teacher') {
                            const header = document.getElementById('app-header');
                            if (header) header.classList.remove('hidden');
                            if (auth.currentUser) {
                                showTeacherMenu();
                                showViewResults();
                                fetchAndDisplayResults(decoded.i, decoded.k);
                            } else {
                                openAuthModal('login');
                                showToast('Please sign in to access teacher results.', 'info');
                            }
                        }
                    }
                }, 500);
            }
        } catch (e) {
            console.error("Invalid quiz link data", e);
        }
    }

    if (part === 'admin') {
        const header = document.getElementById('app-header');
        if (header) header.classList.remove('hidden');

        if (!auth.currentUser) {
            showStudentPortal(false);
            openAuthModal('login');
            showToast('Please sign in with administrator credentials.', 'info');
        } else {
            studentSection.classList.add('hidden');
            document.getElementById('admin-dashboard-section').classList.remove('hidden');
            loadAdminDashboard();
        }
    } else if (part === 'teacher' && !qParam) {
        const header = document.getElementById('app-header');
        if (header) header.classList.remove('hidden');

        if (!auth.currentUser) {
            showStudentPortal(false);
            openAuthModal('login');
            showToast('Please sign in to access Teacher Dashboard.', 'info');
        } else {
            showTeacherMenu();
        }
    } else if (part !== 'teacher') {
        showStudentPortal(false);
        checkAutoLogin();
    }
}

async function loadAdminDashboard() {
    if (!auth.currentUser) {
        showStudentPortal(false);
        openAuthModal('login');
        showToast('Please sign in with administrator credentials.', 'info');
        return;
    }

    if (!isAdminUser(auth.currentUser)) {
        showToast('Access Denied: Your account does not have administrator privileges.', 'error');
        showTeacherMenu();
        return;
    }

    const header = document.getElementById('app-header');
    if (header) header.classList.remove('hidden');

    studentSection.classList.add('hidden');
    teacherMenu.classList.add('hidden');
    teacherCreateSection.classList.add('hidden');
    teacherResultsSection.classList.add('hidden');
    quizSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    document.getElementById('admin-dashboard-section').classList.remove('hidden');

    showLoading();
    try {
        // Fetch both the index and the actual master list of quiz IDs
        const [adminSnap, masterSnap] = await Promise.all([
            database.ref('admin/quizzes').once('value'),
            database.ref('quizzes').once('value')
        ]);

        const adminMetadata = adminSnap.val() || {};
        const masterQuizzes = masterSnap.val() || {};

        const allQuizIds = Object.keys(masterQuizzes);

        // Decrypt metadata for each quiz
        const decryptedMetaPromises = allQuizIds.map(async (id) => {
            if (adminMetadata[id]) {
                try {
                    // Transparently decrypt the admin metadata with creator UID fallback
                    const creatorUid = masterQuizzes[id]?.creatorUid;
                    const decrypted = await systemDecrypt(adminMetadata[id].data, creatorUid);
                    const meta = JSON.parse(decrypted);
                    return { id, ...meta };
                } catch (e) {
                    console.error("Failed to decrypt meta for " + id, e);
                    return { id, title: "Decryption Error", subject: "Error", secretKey: "N/A" };
                }
            } else {
                return {
                    id,
                    title: "Legacy Quiz (Unindexed)",
                    subject: "Legacy / Unindexed",
                    secretKey: "Manual entry required",
                    isLegacy: true,
                    createdAt: 0
                };
            }
        });

        allAdminQuizzes = await Promise.all(decryptedMetaPromises);
        const quizList = allAdminQuizzes;

        // Group by subject
        const grouped = quizList.reduce((acc, q) => {
            const subject = q.subject || 'Uncategorized';
            if (!acc[subject]) acc[subject] = [];
            acc[subject].push(q);
            return acc;
        }, {});

        // Render Stats
        const statsContainer = document.getElementById('admin-stats');
        statsContainer.innerHTML = `
            <div class="stat-card"><div class="stat-value">${allQuizIds.length}</div><div class="stat-label">Stored Quizzes</div></div>
            <div class="stat-card"><div class="stat-value">${Object.keys(grouped).length}</div><div class="stat-label">Subjects</div></div>
            <div class="stat-card"><div class="stat-value" id="admin-total-submissions">...</div><div class="stat-label">Submissions</div></div>
        `;

        renderAdminDashboard(grouped);
    } catch (e) {
        console.error("Dashboard error", e);
        showToast('Error loading dashboard', 'error');
    }
    hideLoading();
}

function renderAdminDashboard(grouped) {
    const container = document.getElementById('admin-quizzes-container');

    if (Object.keys(grouped).length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 60px 20px; border: 2px dashed var(--border); background: var(--bg-body); box-shadow: none;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: white; border-radius: 50%; margin-bottom: 20px; color: var(--primary);">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                </div>
                <h3 style="margin-bottom: 10px; color: var(--text-main);">No indexed quizzes found</h3>
                <p style="color: var(--text-muted); max-width: 400px; margin: 0 auto; font-size: 0.95rem;">
                    Quizzes created after the admin update will automatically appear here grouped by their subjects.
                </p>
                <button class="btn btn-primary" onclick="showCreateQuiz()" style="margin-top: 25px;">Create Your First Quiz</button>
            </div>
        `;
        return;
    }
    container.innerHTML = '';

    const sortedSubjects = Object.keys(grouped).sort();

    sortedSubjects.forEach(subject => {
        const groupEl = document.createElement('div');
        groupEl.className = 'subject-group';

        // Sort: Newest to Oldest
        const quizList = grouped[subject].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const initialQuizzes = quizList.slice(0, 3);
        const extraQuizzes = quizList.slice(3);
        const groupNormalizedId = `extra-${subject.replace(/[^a-zA-Z0-9]/g, '-')}`;

        groupEl.innerHTML = `
            <div class="subject-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                <h2 style="color:white; margin:0; font-size:1.2rem;">${subject}</h2>
            </div>
            <div class="quizzes-in-group">
                ${initialQuizzes.map(q => renderAdminQuizItem(q)).join('')}
                
                <div id="${groupNormalizedId}" class="hidden">
                    ${extraQuizzes.map(q => renderAdminQuizItem(q)).join('')}
                </div>

                ${extraQuizzes.length > 0 ? `
                    <button class="btn btn-outline" style="width:100%; margin: 10px 0; border-style: dashed; background: white;" 
                            onclick="toggleExtraQuizzes('${groupNormalizedId}', this)">
                        Show More (${extraQuizzes.length} more)
                    </button>
                ` : ''}
            </div>
        `;
        container.appendChild(groupEl);
    });

    // Count total submissions in background and calculate stats
    database.ref('results').once('value').then(async (snap) => {
        const results = snap.val() || {};
        let count = 0;
        let totalScorePerc = 0;
        let totalSubmissionsWithScore = 0;
        let totalViolations = 0;

        // Build key map for decryption
        const keyMap = {};
        allAdminQuizzes.forEach(q => keyMap[q.id] = q.secretKey);

        for (const quizId in results) {
            const quizResults = results[quizId];
            const secretKey = keyMap[quizId];
            const submissions = Object.keys(quizResults);
            count += submissions.length;

            if (secretKey) {
                for (const studentKey in quizResults) {
                    try {
                        const decrypted = await decryptData(quizResults[studentKey], secretKey);
                        const res = JSON.parse(decrypted);
                        if (res.totalQuestions > 0) {
                            totalScorePerc += (res.score / res.totalQuestions) * 100;
                            totalSubmissionsWithScore++;
                        }
                        totalViolations += (res.securityViolations || 0);
                    } catch (e) { }
                }
            }
        }

        const avgScore = totalSubmissionsWithScore > 0 ? (totalScorePerc / totalSubmissionsWithScore).toFixed(1) : 0;

        document.getElementById('admin-total-submissions').textContent = count;

        // Update stats container with more detailed info
        const statsContainer = document.getElementById('admin-stats');
        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${allAdminQuizzes.length}</div>
                <div class="stat-label">Stored Quizzes</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${count}</div>
                <div class="stat-label">Total Submissions</div>
            </div>
            <div class="stat-card" title="Total Violations: ${totalViolations}">
                <div class="stat-value">${avgScore}%</div>
                <div class="stat-label">Avg. Class Score</div>
            </div>
        `;
    });
}

function renderAdminQuizItem(q) {
    return `
        <div class="admin-quiz-item" id="admin-quiz-${escapeHtml(q.id)}">
            <div class="admin-quiz-header">
                <div>
                    <h3 style="margin-bottom:4px;">${escapeHtml(q.title)}</h3>
                    <div style="font-size:0.8rem; color:var(--text-muted);">
                        ID: ${escapeHtml(q.id)} | Key: ${escapeHtml(q.secretKey)} 
                        ${q.createdAt ? `| ${new Date(q.createdAt).toLocaleDateString()}` : ''}
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-info btn-sm" onclick="loadAdminQuizResults('${escapeHtml(q.id)}', '${escapeHtml(q.secretKey)}')">Results</button>
                    <button class="btn btn-warning btn-sm" onclick="showAdminSettingsModal('${escapeHtml(q.id)}', '${escapeHtml(q.secretKey)}')">Settings</button>
                    <button class="btn btn-outline btn-sm" onclick="deleteQuizAdmin('${escapeHtml(q.id)}')" style="color:var(--danger)">Delete</button>
                </div>
            </div>
            <div id="admin-results-${escapeHtml(q.id)}" class="hidden">
                <div class="loader-spinner" style="width: 25px; height: 25px; border-width: 3px;"></div>
            </div>
        </div>
    `;
}

function toggleExtraQuizzes(id, btn) {
    const el = document.getElementById(id);
    const isHidden = el.classList.toggle('hidden');
    const count = el.children.length;
    btn.textContent = isHidden ? `Show More (${count} more)` : 'Show Less';
}

async function loadAdminQuizResults(quizId, secretKey) {
    const container = document.getElementById(`admin-results-${quizId}`);
    container.classList.toggle('hidden');
    if (container.classList.contains('hidden')) return;

    container.innerHTML = '<div style="padding:20px; text-align:center;"><div class="loader-spinner" style="width: 25px; height: 25px; border-width: 3px;"></div></div>';

    try {
        const snap = await database.ref(`results/${quizId}`).once('value');
        const encryptedResults = snap.val();

        if (!encryptedResults) {
            container.innerHTML = '<p style="padding:20px; text-align:center; color:var(--text-muted);">No submissions yet.</p>';
            return;
        }

        const promises = Object.entries(encryptedResults).map(([dbKey, data]) =>
            decryptData(data, secretKey).then(dec => {
                const parsed = JSON.parse(dec);
                parsed.dbKey = dbKey;
                return parsed;
            }).catch(() => null)
        );
        const validResults = (await Promise.all(promises)).filter(Boolean);

        if (validResults.length === 0) {
            container.innerHTML = '<p style="padding:20px; text-align:center; color:var(--text-muted);">Could not decrypt results (Invalid Key).</p>';
            return;
        }

        validResults.sort((a, b) => a.student.lastName.localeCompare(b.student.lastName));
        adminResultsCache[quizId] = validResults;

        container.innerHTML = `
            <div style="display:flex; justify-content:flex-end; gap:8px; padding:8px 4px;">
                <button class="btn btn-primary btn-sm" onclick="exportAdminQuizResultsPdf('${escapeHtml(quizId)}', '${escapeHtml(secretKey)}')">
                    Export PDF
                </button>
                <button class="btn btn-info btn-sm" onclick="exportAdminQuizResultsExcel('${escapeHtml(quizId)}', '${escapeHtml(secretKey)}')">
                    Export Excel
                </button>
            </div>
            <table class="admin-results-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Student Name</th>
                        <th>Score</th>
                        <th>Time</th>
                        <th>Violations</th>
                        <th>Submitted</th>
                        <th style="text-align:center;">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${validResults.map((res, i) => `
                        <tr>
                            <td style="color:var(--text-muted);">${i + 1}</td>
                            <td style="font-weight:600;">
                                ${escapeHtml(res.student?.lastName || '')}, ${escapeHtml(res.student?.firstName || '')}
                                ${res.isRetake ? `<span style="font-size:0.68rem; background:#fef3c7; color:#92400e; padding:1px 5px; border-radius:3px; border:1px solid #fde68a;">🔄 Retake</span>` : ''}
                            </td>
                            <td style="font-weight:700; color:var(--primary);">${escapeHtml(res.score)}/${escapeHtml(res.totalQuestions)}</td>
                            <td>${res.timeTakenMs ? (res.timeTakenMs / 60000).toFixed(1) + 'm' : 'N/A'}</td>
                            <td style="color:${res.securityViolations > 0 ? 'var(--danger)' : 'inherit'}">${res.securityViolations || 0}</td>
                            <td style="font-size:0.75rem; color:var(--text-muted);">${new Date(res.submittedAt).toLocaleString()}</td>
                            <td style="text-align:center;">
                                <button class="btn btn-sm btn-danger-outline" style="padding:2px 8px; font-size:0.75rem;" onclick="confirmResetStudentAttempt('${escapeHtml(quizId)}', '${escapeHtml(secretKey)}', '${escapeHtml(res.dbKey)}', '${escapeHtml((res.student?.lastName || '') + ', ' + (res.student?.firstName || ''))}', '${escapeHtml(res.student?.institutionalId || '')}', true)" title="Reset attempt and clear lockout">
                                    Reset
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        container.innerHTML = '<p style="padding:20px; text-align:center; color:var(--danger);">Error fetching results.</p>';
    }
}

async function deleteQuizAdmin(quizId) {
    if (!confirm('Are you sure you want to permanently delete this quiz and all its results from the database? This cannot be undone.')) return;

    showLoading();
    try {
        const quizSnap = await database.ref(`quizzes/${quizId}`).once('value');
        const creatorUid = quizSnap.val()?.creatorUid;

        const updates = {};
        updates[`quizzes/${quizId}`] = null;
        updates[`results/${quizId}`] = null;
        updates[`admin/quizzes/${quizId}`] = null;
        if (creatorUid) {
            updates[`teachers/${creatorUid}/quizzes/${quizId}`] = null;
        }

        await database.ref().update(updates);

        showToast('Quiz and all associated data deleted', 'success');
        loadAdminDashboard();
    } catch (e) {
        console.error("Deletion error:", e);
        showToast('Deletion failed: ' + e.message, 'error');
    }
    hideLoading();
}

function adminLogout() {
    window.location.href = window.location.pathname;
}

// --- NEW ADMIN ENHANCEMENTS ---

function filterAdminQuizzes() {
    const query = document.getElementById('admin-search-input').value.toLowerCase().trim();
    if (!query) {
        renderAdminDashboard(groupQuizzesBySubject(allAdminQuizzes));
        return;
    }

    const filtered = allAdminQuizzes.filter(q =>
        q.title.toLowerCase().includes(query) ||
        q.id.toLowerCase().includes(query) ||
        (q.subject && q.subject.toLowerCase().includes(query))
    );

    renderAdminDashboard(groupQuizzesBySubject(filtered));
}

function groupQuizzesBySubject(list) {
    return list.reduce((acc, q) => {
        const subject = q.subject || 'Uncategorized';
        if (!acc[subject]) acc[subject] = [];
        acc[subject].push(q);
        return acc;
    }, {});
}

function formatCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let str = String(val).trim();
    // Neutralize formula injection in spreadsheets (=, +, -, @)
    if (/^[=+@\-]/.test(str)) {
        str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
}

async function exportAllSubmissionsCsv() {
    showLoading();
    try {
        const snap = await database.ref('results').once('value');
        const allResultsRaw = snap.val() || {};

        let csvRows = [
            ['Quiz ID', 'Quiz Title', 'Subject', 'Student Name', 'Student ID', 'Section', 'Score', 'Total Questions', 'Time (m)', 'Violations', 'Submitted At']
        ];

        // We need the secret keys for decryption. We have them in allAdminQuizzes.
        const keyMap = {};
        allAdminQuizzes.forEach(q => keyMap[q.id] = q.secretKey);

        for (const quizId in allResultsRaw) {
            const quizResults = allResultsRaw[quizId];
            const secretKey = keyMap[quizId];

            if (!secretKey) continue; // Skip if we don't have the key

            for (const studentKey in quizResults) {
                try {
                    const decrypted = await decryptData(quizResults[studentKey], secretKey);
                    const res = JSON.parse(decrypted);

                    csvRows.push([
                        quizId,
                        res.quizTitle || 'N/A',
                        res.subject || 'N/A',
                        `${res.student?.lastName || ''}, ${res.student?.firstName || ''}`,
                        res.student?.institutionalId || 'N/A',
                        res.student?.section || 'N/A',
                        res.score,
                        res.totalQuestions,
                        res.timeTakenMs ? (res.timeTakenMs / 60000).toFixed(1) : '0',
                        res.securityViolations || 0,
                        new Date(res.submittedAt).toLocaleString().replace(',', '')
                    ]);
                } catch (e) {
                    console.error(`Failed to decrypt result for ${studentKey} in ${quizId}`);
                }
            }
        }

        if (csvRows.length === 1) {
            showToast('No submissions found to export.', 'info');
            hideLoading();
            return;
        }

        const csvContent = csvRows.map(row => row.map(formatCsvCell).join(',')).join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Quizable_All_Submissions_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast(`Exported ${csvRows.length - 1} submissions to CSV.`, 'success');
    } catch (e) {
        console.error("Global export error", e);
        showToast('Export failed: ' + e.message, 'error');
    }
    hideLoading();
}

async function exportAdminQuizResultsPdf(quizId, secretKey) {
    let results = adminResultsCache[quizId];

    if (!results) {
        showLoading();
        try {
            const snap = await database.ref(`results/${quizId}`).once('value');
            const encryptedResults = snap.val();
            if (!encryptedResults) {
                showToast('No submissions found.', 'info');
                hideLoading();
                return;
            }
            const promises = Object.values(encryptedResults).map(data =>
                decryptData(data, secretKey).then(JSON.parse).catch(() => null)
            );
            results = (await Promise.all(promises)).filter(Boolean);
            adminResultsCache[quizId] = results;
        } catch (e) {
            showToast('Failed to fetch results: ' + e.message, 'error');
            hideLoading();
            return;
        }
        hideLoading();
    }

    if (!results || results.length === 0) {
        showToast('No results to export.', 'info');
        return;
    }

    const sorted = [...results].sort((a, b) => a.student.lastName.localeCompare(b.student.lastName));

    const quizMeta = allAdminQuizzes.find(q => q.id === quizId);
    const quizTitle = sorted[0]?.quizTitle || quizMeta?.title || 'Quiz';
    const subject = sorted[0]?.subject || quizMeta?.subject || 'N/A';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    // Analytics
    const scores = sorted.map(r => (r.score / r.totalQuestions) * 100);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const highest = Math.max(...scores).toFixed(1);
    const passCount = scores.filter(s => s >= 75).length;
    const passRate = ((passCount / scores.length) * 100).toFixed(1);
    const times = sorted.map(r => r.timeTakenMs || 0).filter(t => t > 0);
    const avgTime = times.length ? (times.reduce((a, b) => a + b, 0) / times.length / 60000).toFixed(1) : 'N/A';

    // Header
    doc.setFontSize(20);
    doc.setTextColor(16, 185, 129);
    doc.text(quizTitle, 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Subject: ${subject}   |   Quiz ID: ${quizId}`, 14, 26);
    doc.text(`Report Generated: ${new Date().toLocaleString()}   |   Total Submissions: ${sorted.length}`, 14, 32);

    // Summary table
    doc.autoTable({
        head: [['Total Students', 'Average Score', 'Highest Score', 'Pass Rate (75%+)', 'Avg Duration']],
        body: [[sorted.length, `${avgScore}%`, `${highest}%`, `${passRate}%`, avgTime !== 'N/A' ? `${avgTime}m` : 'N/A']],
        startY: 38,
        theme: 'striped',
        headStyles: { fillColor: [15, 118, 110], fontSize: 9 },
        bodyStyles: { fontSize: 9, halign: 'center' }
    });

    // Student list
    doc.setFontSize(13);
    doc.setTextColor(6, 78, 59);
    doc.text('Student Results — Sorted by Last Name', 14, doc.lastAutoTable.finalY + 10);

    doc.autoTable({
        head: [['#', 'Last Name', 'First Name', 'ID', 'Section', 'Score', '%', 'Time', 'Violations', 'Submitted At']],
        body: sorted.map((r, i) => [
            i + 1,
            r.student.lastName,
            r.student.firstName,
            r.student.institutionalId || 'N/A',
            r.student.section || 'N/A',
            `${r.score}/${r.totalQuestions}`,
            `${((r.score / r.totalQuestions) * 100).toFixed(1)}%`,
            r.timeTakenMs ? (r.timeTakenMs / 60000).toFixed(1) + 'm' : 'N/A',
            r.securityViolations || 0,
            r.submittedAt ? new Date(r.submittedAt).toLocaleString() : 'N/A'
        ]),
        startY: doc.lastAutoTable.finalY + 14,
        headStyles: { fillColor: [16, 185, 129], fontSize: 9 },
        styles: { fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' },
            7: { halign: 'center' },
            8: { halign: 'center' }
        }
    });

    const safeTitle = quizTitle.replace(/[^a-z0-9]/gi, '_');
    doc.save(`${safeTitle}_Results_${new Date().toISOString().split('T')[0]}.pdf`);
    showToast('PDF exported successfully.', 'success');
}

// --- EXCEL EXPORT UTILITIES & GENERATORS ---

function makeValidSheetName(name, existingNames) {
    let clean = (name || 'Sheet')
        .replace(/[\\/?*\[\]:]/g, '_')
        .trim();
    if (clean.length > 31) {
        clean = clean.substring(0, 31).trim();
    }
    if (!clean) clean = 'Sheet';
    let unique = clean;
    let counter = 2;
    while (existingNames.has(unique.toLowerCase())) {
        const suffix = ` (${counter})`;
        const maxBaseLen = 31 - suffix.length;
        unique = clean.substring(0, maxBaseLen).trim() + suffix;
        counter++;
    }
    existingNames.add(unique.toLowerCase());
    return unique;
}

const EXCEL_STUDENT_COLS = [
    { wch: 6 },   // #
    { wch: 18 },  // Last Name
    { wch: 18 },  // First Name
    { wch: 16 },  // Student ID
    { wch: 12 },  // Section
    { wch: 8 },   // Score
    { wch: 16 },  // Total Questions
    { wch: 15 },  // Percentage (%)
    { wch: 14 },  // Time (mins)
    { wch: 12 },  // Violations
    { wch: 22 },  // Submitted At
    { wch: 14 }   // Attempt Type
];

function buildStudentExcelRows(list) {
    // Sort strictly in alphabetical order by Last Name, then First Name
    const sorted = [...list].sort((a, b) => {
        const ln = (a.student?.lastName || '').trim().localeCompare((b.student?.lastName || '').trim());
        if (ln !== 0) return ln;
        return (a.student?.firstName || '').trim().localeCompare((b.student?.firstName || '').trim());
    });

    return [
        ['#', 'Last Name', 'First Name', 'Student ID', 'Section', 'Score', 'Total Questions', 'Percentage (%)', 'Time (mins)', 'Violations', 'Submitted At', 'Attempt Type'],
        ...sorted.map((r, i) => {
            const total = r.totalQuestions || 0;
            const score = r.score ?? 0;
            const pct = total > 0 ? parseFloat(((score / total) * 100).toFixed(2)) : 0;
            const timeMins = r.timeTakenMs ? parseFloat((r.timeTakenMs / 60000).toFixed(1)) : 0;
            const submittedStr = r.submittedAt ? new Date(r.submittedAt).toLocaleString() : 'N/A';
            return [
                i + 1,
                r.student?.lastName || '',
                r.student?.firstName || '',
                r.student?.institutionalId || 'N/A',
                r.student?.section || 'Unspecified',
                score,
                total,
                pct,
                timeMins,
                r.securityViolations || 0,
                submittedStr,
                r.isRetake ? 'Retake' : 'Initial'
            ];
        })
    ];
}

async function exportAdminQuizResultsExcel(quizId, secretKey) {
    let results = adminResultsCache[quizId];

    if (!results) {
        showLoading();
        try {
            const snap = await database.ref(`results/${quizId}`).once('value');
            const encryptedResults = snap.val();
            if (!encryptedResults) {
                showToast('No submissions found.', 'info');
                hideLoading();
                return;
            }
            const promises = Object.values(encryptedResults).map(data =>
                decryptData(data, secretKey).then(JSON.parse).catch(() => null)
            );
            results = (await Promise.all(promises)).filter(Boolean);
            adminResultsCache[quizId] = results;
        } catch (e) {
            showToast('Failed to fetch results: ' + e.message, 'error');
            hideLoading();
            return;
        }
        hideLoading();
    }

    if (!results || results.length === 0) {
        showToast('No results to export.', 'info');
        return;
    }

    const quizMeta = allAdminQuizzes.find(q => q.id === quizId);
    const quizTitle = results[0]?.quizTitle || quizMeta?.title || 'Quiz';

    const wb = XLSX.utils.book_new();
    const existingSheetNames = new Set();

    // Group submissions by section
    const bySection = {};
    results.forEach(r => {
        const sec = (r.student?.section || 'Unspecified').trim();
        if (!bySection[sec]) bySection[sec] = [];
        bySection[sec].push(r);
    });

    // 1. Overall Sheet: All Students (alphabetical)
    const allWs = XLSX.utils.aoa_to_sheet(buildStudentExcelRows(results));
    allWs['!cols'] = EXCEL_STUDENT_COLS;
    XLSX.utils.book_append_sheet(wb, allWs, makeValidSheetName('All Students', existingSheetNames));

    // 2. Separate Sheets per Section (alphabetical)
    const sortedSections = Object.keys(bySection).sort();
    sortedSections.forEach(sec => {
        const secWs = XLSX.utils.aoa_to_sheet(buildStudentExcelRows(bySection[sec]));
        secWs['!cols'] = EXCEL_STUDENT_COLS;
        XLSX.utils.book_append_sheet(wb, secWs, makeValidSheetName(`Section ${sec}`, existingSheetNames));
    });

    const safeTitle = quizTitle.replace(/[^a-z0-9]/gi, '_');
    XLSX.writeFile(wb, `${safeTitle}_SectionScores_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Excel file exported successfully (separate sheets per section).', 'success');
}

function exportCurrentTeacherQuizExcel() {
    if (!allStudentResults || allStudentResults.length === 0) {
        showToast('No results available to export.', 'info');
        return;
    }
    const quizTitle = document.getElementById('quiz-title-display')?.textContent ||
                      allStudentResults[0]?.quizTitle || 'Quiz';
    const wb = XLSX.utils.book_new();
    const existingSheetNames = new Set();

    // Sheet 1: All Students
    const allWs = XLSX.utils.aoa_to_sheet(buildStudentExcelRows(allStudentResults));
    allWs['!cols'] = EXCEL_STUDENT_COLS;
    XLSX.utils.book_append_sheet(wb, allWs, makeValidSheetName('All Students', existingSheetNames));

    // Separate sheets per section
    const bySection = {};
    allStudentResults.forEach(r => {
        const sec = (r.student?.section || 'Unspecified').trim();
        if (!bySection[sec]) bySection[sec] = [];
        bySection[sec].push(r);
    });

    Object.keys(bySection).sort().forEach(sec => {
        const secWs = XLSX.utils.aoa_to_sheet(buildStudentExcelRows(bySection[sec]));
        secWs['!cols'] = EXCEL_STUDENT_COLS;
        XLSX.utils.book_append_sheet(wb, secWs, makeValidSheetName(`Section ${sec}`, existingSheetNames));
    });

    const safeTitle = quizTitle.replace(/[^a-z0-9]/gi, '_');
    XLSX.writeFile(wb, `${safeTitle}_Scores_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Excel file exported successfully.', 'success');
}

/**
 * Export all quiz results from August 2026 to latest.
 * - Every quiz gets its own sheet with all students in alphabetical order.
 * - In addition, students per section are placed on separate sheets in alphabetical order.
 * - An overview summary sheet is placed first with quiz stats.
 */
async function exportAugust2026Excel(startDate = new Date(2026, 7, 1, 0, 0, 0, 0)) {
    showLoading();
    try {
        const cutoffTime = startDate.getTime();

        // 1. Ensure admin quizzes metadata is loaded and decrypted
        let quizzes = allAdminQuizzes;
        if (!quizzes || quizzes.length === 0) {
            const [adminSnap, masterSnap] = await Promise.all([
                database.ref('admin/quizzes').once('value'),
                database.ref('quizzes').once('value')
            ]);
            const adminMetadata = adminSnap.val() || {};
            const masterQuizzes = masterSnap.val() || {};
            const allQuizIds = Object.keys(masterQuizzes);

            const decryptedMetaPromises = allQuizIds.map(async (id) => {
                if (adminMetadata[id]) {
                    try {
                        const creatorUid = masterQuizzes[id]?.creatorUid;
                        const decrypted = await systemDecrypt(adminMetadata[id].data, creatorUid);
                        const meta = JSON.parse(decrypted);
                        return { id, ...meta };
                    } catch (e) {
                        return { id, title: "Decryption Error", subject: "Error", secretKey: "N/A" };
                    }
                } else {
                    return { id, title: "Legacy Quiz (Unindexed)", subject: "Legacy", secretKey: null, createdAt: 0 };
                }
            });
            quizzes = await Promise.all(decryptedMetaPromises);
            allAdminQuizzes = quizzes;
        }

        // 2. Fetch all raw results
        const resultsSnap = await database.ref('results').once('value');
        const allResultsRaw = resultsSnap.val() || {};

        // 3. Filter for quizzes that are from August 2026 to latest
        const qualifyingQuizzes = [];

        for (const q of quizzes) {
            if (!q.secretKey || q.secretKey === 'N/A' || q.secretKey === 'Manual entry required') continue;

            const isCreatedAfterCutoff = q.createdAt && q.createdAt >= cutoffTime;
            const quizResultsRaw = allResultsRaw[q.id] || {};
            const rawEntries = Object.entries(quizResultsRaw);

            // Decrypt student submissions for this quiz
            const decryptedSubmissions = [];
            for (const [studentKey, encData] of rawEntries) {
                try {
                    const dec = await decryptData(encData, q.secretKey);
                    const parsed = JSON.parse(dec);
                    parsed.dbKey = studentKey;
                    decryptedSubmissions.push(parsed);
                } catch (e) {
                    console.warn(`Failed to decrypt result ${studentKey} for quiz ${q.id}`);
                }
            }

            const hasSubmissionsAfterCutoff = decryptedSubmissions.some(s => (s.submittedAt || 0) >= cutoffTime);

            if (isCreatedAfterCutoff || hasSubmissionsAfterCutoff) {
                qualifyingQuizzes.push({
                    quiz: q,
                    submissions: decryptedSubmissions
                });
            }
        }

        if (qualifyingQuizzes.length === 0) {
            hideLoading();
            showToast('No quizzes or submissions found from August 2026 to latest.', 'info');
            return;
        }

        // Sort chronologically descending
        qualifyingQuizzes.sort((a, b) => (b.quiz.createdAt || 0) - (a.quiz.createdAt || 0));

        // 4. Construct Excel Workbook
        const wb = XLSX.utils.book_new();
        const existingSheetNames = new Set();

        // Sheet 0: Overview Summary
        const summaryRows = [
            ['#', 'Quiz Title', 'Subject', 'Quiz ID', 'Created Date', 'Total Submissions', 'Sections', 'Avg Score (%)', 'High Score (%)', 'Pass Rate (%)']
        ];

        qualifyingQuizzes.forEach((item, index) => {
            const q = item.quiz;
            const subs = item.submissions;
            const scores = subs.map(r => r.totalQuestions > 0 ? (r.score / r.totalQuestions) * 100 : 0);
            const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';
            const high = scores.length ? Math.max(...scores).toFixed(1) : 'N/A';
            const passCount = scores.filter(s => s >= 75).length;
            const passRate = scores.length ? ((passCount / scores.length) * 100).toFixed(1) + '%' : 'N/A';

            const sectionSet = new Set(subs.map(s => (s.student?.section || 'Unspecified').trim()));
            const secStr = Array.from(sectionSet).filter(Boolean).sort().join(', ') || 'None';

            summaryRows.push([
                index + 1,
                q.title || 'Untitled Quiz',
                q.subject || 'Uncategorized',
                q.id,
                q.createdAt ? new Date(q.createdAt).toLocaleDateString() : 'N/A',
                subs.length,
                secStr,
                avg !== 'N/A' ? parseFloat(avg) : 'N/A',
                high !== 'N/A' ? parseFloat(high) : 'N/A',
                passRate
            ]);
        });

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
        summaryWs['!cols'] = [
            { wch: 5 }, { wch: 26 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
            { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
        ];
        XLSX.utils.book_append_sheet(wb, summaryWs, makeValidSheetName('Overview Summary', existingSheetNames));

        // For each quiz: Sheet for the entire quiz + separate sheets per section (all in alphabetical order)
        qualifyingQuizzes.forEach((item, idx) => {
            const q = item.quiz;
            const subs = item.submissions;
            const qNum = idx + 1;
            const cleanTitle = (q.title || `Quiz_${qNum}`).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().substring(0, 14);

            const bySection = {};
            subs.forEach(r => {
                const sec = (r.student?.section || 'Unspecified').trim();
                if (!bySection[sec]) bySection[sec] = [];
                bySection[sec].push(r);
            });

            const sectionKeys = Object.keys(bySection).sort();

            // 1. Sheet for this quiz (all students, alphabetical)
            const allRows = subs.length > 0
                ? buildStudentExcelRows(subs)
                : [['#', 'Last Name', 'First Name', 'Student ID', 'Section', 'Score', 'Total Questions', 'Percentage (%)'], ['No submissions recorded yet']];
            const allWs = XLSX.utils.aoa_to_sheet(allRows);
            allWs['!cols'] = EXCEL_STUDENT_COLS;
            const allSheetName = makeValidSheetName(`Q${qNum} ${cleanTitle} (All)`, existingSheetNames);
            XLSX.utils.book_append_sheet(wb, allWs, allSheetName);

            // 2. Separate sheet per section for this quiz (alphabetical)
            sectionKeys.forEach(sec => {
                const secStudents = bySection[sec];
                const secRows = buildStudentExcelRows(secStudents);
                const secWs = XLSX.utils.aoa_to_sheet(secRows);
                secWs['!cols'] = EXCEL_STUDENT_COLS;
                const secSheetName = makeValidSheetName(`Q${qNum} ${cleanTitle} - ${sec}`, existingSheetNames);
                XLSX.utils.book_append_sheet(wb, secWs, secSheetName);
            });
        });

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `Quizable_Results_Aug2026_To_Latest_${dateStr}.xlsx`;
        XLSX.writeFile(wb, filename);

        hideLoading();
        showToast(`Successfully exported ${qualifyingQuizzes.length} quiz(zes) to Excel!`, 'success');
    } catch (err) {
        console.error("Export August 2026 Quizzes Excel error:", err);
        hideLoading();
        showToast('Export failed: ' + err.message, 'error');
    }
}

async function showAdminSettingsModal(quizId, secretKey) {
    showLoading();
    try {
        const quizSnap = await database.ref('quizzes/' + quizId).once('value');
        const data = quizSnap.val();
        if (!data) throw new Error('Quiz data not found');

        const decrypted = await decryptData(data.encryptedQuizData, secretKey);
        const quiz = JSON.parse(decrypted);

        // Populate the modal fields
        document.getElementById('settings-modal-subtitle').textContent = `Quiz ID: ${quizId} | ${quiz.title}`;
        document.getElementById('modal-modify-duration').value = quiz.duration || 0;
        document.getElementById('modal-modify-sample-count').value = quiz.sampleCount || 0;

        document.getElementById('modal-modify-expiry').value = formatDateTimeLocal(quiz.expiry);

        document.getElementById('modal-modify-show-results').checked = quiz.showResultsToStudent !== false;
        document.getElementById('modal-modify-show-answer-summary').checked = quiz.showAnswerSummary !== false;

        // Show the modal
        const modal = document.getElementById('admin-settings-modal');
        modal.classList.remove('hidden');

        // Bind the update button for THIS specific quiz
        const updateBtn = document.getElementById('modal-update-settings-btn');
        const newUpdateBtn = updateBtn.cloneNode(true);
        updateBtn.parentNode.replaceChild(newUpdateBtn, updateBtn);

        newUpdateBtn.onclick = async () => {
            const expiryInput = document.getElementById('modal-modify-expiry').value;
            const newSettings = {
                duration: parseInt(document.getElementById('modal-modify-duration').value) || 0,
                expiry: parseExpiryInput(expiryInput),
                sampleCount: parseInt(document.getElementById('modal-modify-sample-count').value) || 0,
                showResultsToStudent: document.getElementById('modal-modify-show-results').checked,
                showAnswerSummary: document.getElementById('modal-modify-show-answer-summary').checked
            };

            await updateQuizSettings(quizId, secretKey, newSettings, quiz);
            modal.classList.add('hidden');
            loadAdminDashboard(); // Refresh
        };

        showToast(`Loaded settings for: ${quiz.title}`, 'info');
    } catch (e) {
        console.error("Load settings error", e);
        showToast('Failed to load settings: ' + e.message, 'error');
    }
    hideLoading();
}

function checkAutoLogin() {
    const activeSession = localStorage.getItem('quizable_active_session');
    if (activeSession) {
        try {
            const session = JSON.parse(activeSession);
            // Check if session is recent (e.g., less than 4 hours)
            if (Date.now() - session.timestamp < 14400000) {
                // Populate fields
                if (session.quizId) document.getElementById('student-quiz-id').value = session.quizId;
                if (session.firstName) document.getElementById('student-first-name').value = session.firstName;
                if (session.lastName) document.getElementById('student-last-name').value = session.lastName;
                if (session.studentInstitutionalId) document.getElementById('student-id-field').value = session.studentInstitutionalId;
                if (session.yearVal) document.getElementById('student-year').value = session.yearVal;
                if (session.sectionVal) document.getElementById('student-section-select').value = session.sectionVal;
                if (session.secretKey) document.getElementById('student-secret-key').value = session.secretKey;

                // Only auto-trigger if all mandatory fields are present
                if (session.quizId && session.firstName && session.lastName && session.studentInstitutionalId && session.secretKey) {
                    showToast('Resuming previous quiz session...', 'info');
                    startQuiz();
                }
            }
        } catch (e) {
            console.error("Auto-login failed:", e);
        }
    }
}

function showTeacherMenu() {
    if (!auth.currentUser) {
        showStudentPortal(false);
        openAuthModal('login');
        showToast('Please sign in to access the Teacher Dashboard.', 'info');
        return;
    }
    const header = document.getElementById('app-header');
    if (header) header.classList.remove('hidden');

    teacherMenu.classList.remove('hidden');
    teacherCreateSection.classList.add('hidden');
    teacherResultsSection.classList.add('hidden');
    studentSection.classList.add('hidden');
    quizSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    const adminDash = document.getElementById('admin-dashboard-section');
    if (adminDash) adminDash.classList.add('hidden');
    document.getElementById('quiz-navigator').classList.add('hidden');

    // Automatically load all quizzes created by this teacher
    loadTeacherDashboardQuizzes();
}

async function loadTeacherDashboardQuizzes() {
    const container = document.getElementById('teacher-quizzes-container');
    const countBadge = document.getElementById('teacher-quiz-count-badge');
    if (!container) return;

    if (!auth.currentUser) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Please sign in to view your quizzes.</p>';
        return;
    }

    container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: var(--text-muted);">
            <div class="loader-spinner" style="width: 28px; height: 28px; border-width: 3px; margin: 0 auto 10px auto;"></div>
            <p style="font-size: 0.9rem;">Loading your quizzes...</p>
        </div>
    `;

    let quizzes = [];
    try {
        const snap = await database.ref(`teachers/${auth.currentUser.uid}/quizzes`).once('value');
        if (snap.exists()) {
            const data = snap.val();
            quizzes = Object.keys(data).map(id => ({
                id,
                title: data[id].title || 'Untitled Quiz',
                subject: data[id].subject || 'General',
                secretKey: data[id].secretKey || '',
                sampleCount: data[id].sampleCount || 0,
                createdAt: data[id].createdAt || Date.now()
            })).sort((a, b) => b.createdAt - a.createdAt);
        }
    } catch (err) {
        console.warn("Error fetching teacher cloud quizzes:", err);
    }

    // Merge with local storage history if available
    const localHistory = JSON.parse(localStorage.getItem('quizable_teacher_history') || '[]');
    const map = new Map();
    quizzes.forEach(q => map.set(q.id, q));
    localHistory.forEach(q => {
        if (!map.has(q.id)) {
            map.set(q.id, {
                id: q.id,
                title: q.title,
                subject: q.subject || 'Saved Local',
                secretKey: q.key,
                sampleCount: q.sampleCount || 0,
                createdAt: q.timestamp || Date.now()
            });
        }
    });

    const allMyQuizzes = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
    if (countBadge) countBadge.textContent = `${allMyQuizzes.length} Quiz${allMyQuizzes.length === 1 ? '' : 'zes'}`;

    if (allMyQuizzes.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 35px 20px; background: var(--bg-body); border: 2px dashed var(--border); border-radius: 12px;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: white; border-radius: 50%; margin-bottom: 12px; color: var(--primary);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                </div>
                <h3 style="font-size: 1.05rem; margin-bottom: 6px; color: var(--text-main);">No quizzes created yet</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 320px; margin: 0 auto 15px auto;">
                    Create your first quiz to share with students and monitor submissions.
                </p>
                <button class="btn btn-primary btn-sm" onclick="showCreateQuiz()">+ Create New Quiz</button>
            </div>
        `;
        return;
    }

    container.innerHTML = allMyQuizzes.map(q => {
        const studentLink = generateQuizLink(q.id, q.secretKey);
        const dateStr = new Date(q.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        return `
            <div class="card" style="padding: 16px 20px; margin-bottom: 0; display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--border); background: white;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 240px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <h3 style="font-size: 1.08rem; margin: 0; color: var(--text-main); font-weight: 700;">${escapeHtml(q.title)}</h3>
                            <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: #ecfdf5; color: var(--primary); font-weight: 600; border: 1px solid rgba(16,185,129,0.2);">
                                ${escapeHtml(q.subject)}
                            </span>
                            ${q.sampleCount ? `<span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: #eff6ff; color: #2563eb; font-weight: 600; border: 1px solid rgba(37,99,235,0.2);">🎯 ${q.sampleCount} items pooled</span>` : ''}
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px; font-size: 0.8rem; color: var(--text-muted); flex-wrap: wrap;">
                            <span>Created: <strong>${dateStr}</strong></span>
                            <span>&bull;</span>
                            <span>Quiz ID: <code style="background: var(--bg-body); padding: 2px 6px; border-radius: 4px; font-family: monospace;">${escapeHtml(q.id)}</code></span>
                            <span>&bull;</span>
                            <span>Key: <code style="background: var(--bg-body); padding: 2px 6px; border-radius: 4px; font-family: monospace;">${escapeHtml(q.secretKey)}</code></span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-primary" onclick="openTeacherQuizResults('${escapeHtml(q.id)}', '${escapeHtml(q.secretKey)}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                            View Results
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="copyToClipboard('${studentLink}', 'Student quiz link copied!')" title="Copy Student Link">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            Student Link
                        </button>
                        <button class="btn btn-sm btn-outline" style="color: var(--danger); padding: 6px 10px;" onclick="deleteTeacherQuiz('${escapeHtml(q.id)}')" title="Delete from list">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function openTeacherQuizResults(id, key) {
    showViewResults();
    document.getElementById('results-quiz-id').value = id;
    document.getElementById('results-secret-key').value = key;
    fetchAndDisplayResults(id, key);
}

async function deleteTeacherQuiz(id) {
    const choice = confirm('Do you want to permanently delete this quiz and all student results from the cloud?\n\n- Click OK to delete permanently from the database.\n- Click Cancel to abort.');
    if (!choice) return;
    showLoading();
    try {
        if (auth.currentUser) {
            const updates = {};
            updates[`teachers/${auth.currentUser.uid}/quizzes/${id}`] = null;
            updates[`quizzes/${id}`] = null;
            updates[`results/${id}`] = null;
            updates[`admin/quizzes/${id}`] = null;
            await database.ref().update(updates);
        }
        deleteFromHistory(id);
        await loadTeacherDashboardQuizzes();
        showToast('Quiz and associated cloud data deleted.', 'info');
    } catch (e) {
        showToast('Error removing quiz: ' + e.message, 'error');
    }
    hideLoading();
}

function showCreateQuiz() {
    if (!auth.currentUser) {
        showStudentPortal(false);
        openAuthModal('login');
        showToast('Please sign in to create quizzes.', 'info');
        return;
    }
    const header = document.getElementById('app-header');
    if (header) header.classList.remove('hidden');

    teacherMenu.classList.add('hidden');
    teacherCreateSection.classList.remove('hidden');
    document.getElementById('quiz-navigator').classList.remove('hidden');

    // Attempt to load draft first
    const hasQuestions = document.getElementById('questions-container').children.length > 0;
    if (!hasQuestions) {
        const saved = localStorage.getItem('quizable_quiz_draft');
        if (saved) {
            loadDraft();
        } else {
            addQuestion();
        }
    }
    updateQuestionNumbers();
}

function showViewResults() {
    if (!auth.currentUser) {
        showStudentPortal(false);
        openAuthModal('login');
        showToast('Please sign in to view analytics and results.', 'info');
        return;
    }
    const header = document.getElementById('app-header');
    if (header) header.classList.remove('hidden');

    teacherMenu.classList.add('hidden');
    teacherResultsSection.classList.remove('hidden');
    loadTeacherHistory();
}

// Attach Auto-Save to Main Inputs
['quiz-title', 'quiz-subject', 'quiz-duration', 'quiz-expiry', 'sample-question-count', 'secret-key', 'show-results-to-student', 'show-answer-summary', 'save-results-to-cloud', 'randomize-order'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        const eventType = (el.type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(eventType, saveDraft);
    }
});

function saveTeacherHistory(title, id, key) {
    const history = JSON.parse(localStorage.getItem('quizable_teacher_history') || '[]');
    // Avoid duplicates
    const newHistory = history.filter(h => h.id !== id);
    newHistory.unshift({ title, id, key, timestamp: Date.now() });
    // Keep last 15
    if (newHistory.length > 15) newHistory.pop();
    localStorage.setItem('quizable_teacher_history', JSON.stringify(newHistory));
}

async function loadTeacherHistory() {
    const container = document.getElementById('recent-quizzes-container');
    if (!container) return;
    const list = document.getElementById('recent-quizzes-list');
    if (!list) return;
    let localHistory = JSON.parse(localStorage.getItem('quizable_teacher_history') || '[]');

    let cloudQuizzes = [];
    if (auth.currentUser) {
        try {
            const snap = await database.ref(`teachers/${auth.currentUser.uid}/quizzes`).once('value');
            if (snap.exists()) {
                const val = snap.val();
                cloudQuizzes = Object.keys(val).map(k => ({
                    id: k,
                    title: val[k].title,
                    key: val[k].secretKey,
                    timestamp: val[k].createdAt || Date.now()
                }));
            }
        } catch (e) {
            console.warn("Could not fetch cloud quizzes for teacher:", e);
        }
    }

    // Merge cloud and local quizzes, dedup by ID
    const combinedMap = new Map();
    cloudQuizzes.forEach(q => combinedMap.set(q.id, q));
    localHistory.forEach(q => {
        if (!combinedMap.has(q.id)) combinedMap.set(q.id, q);
    });

    const combinedList = Array.from(combinedMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (combinedList.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    list.innerHTML = combinedList.map(h => `
        <div class="card" style="padding:15px; margin-bottom:0; display:flex; justify-content:space-between; align-items:center;">
            <div onclick="fillCredentials('${escapeHtml(h.id)}', '${escapeHtml(h.key)}')" style="cursor:pointer; flex-grow:1;">
                <div style="font-weight:600;">${escapeHtml(h.title)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(h.timestamp).toLocaleDateString()} &bull; ID: <code>${escapeHtml(h.id)}</code></div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-outline" style="padding:5px 8px; border-radius:6px;" onclick="copyToClipboard('${escapeHtml(h.id)}', 'Quiz ID copied!')" title="Copy ID">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                </button>
                <button class="btn btn-outline" style="padding:5px 8px; border-radius:6px; color:var(--danger);" onclick="deleteFromHistory('${escapeHtml(h.id)}')" title="Delete from history">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('');
}

window.copyToClipboard = (text, message) => {
    navigator.clipboard.writeText(text).then(() => {
        showToast(message, 'success');
    });
};

window.deleteFromHistory = (id) => {
    if (!confirm('Remove this quiz from your recent history?')) return;
    let history = JSON.parse(localStorage.getItem('quizable_teacher_history') || '[]');
    history = history.filter(h => h.id !== id);
    localStorage.setItem('quizable_teacher_history', JSON.stringify(history));
    loadTeacherHistory();
    showToast('Removed from history', 'info');
};

// Global scope helper for onclick
window.fillCredentials = (id, key) => {
    document.getElementById('results-quiz-id').value = id;
    document.getElementById('results-secret-key').value = key;
    // Auto fetch the results immediately
    fetchAndDisplayResults(id, key);
};

// function saveTeacherHistory(title, id, key) ...

window.copyJsonTemplate = function () {
    const text = document.getElementById('json-example-code').innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast('JSON Example copied!', 'success');
    });
};

// Teacher functionality
document.getElementById('add-question').addEventListener('click', () => addQuestion());
document.getElementById('generate-encrypted-file').addEventListener('click', generateEncryptedFile);
document.getElementById('load-from-json').addEventListener('click', loadQuizFromJson);
document.getElementById('load-from-pasted-json').addEventListener('click', loadQuizFromPastedText);

document.getElementById('json-upload').addEventListener('change', function () {
    const fileName = this.files[0] ? this.files[0].name : 'No file chosen';
    document.getElementById('json-file-name').textContent = fileName;
});

document.getElementById('go-to-create-quiz').addEventListener('click', showCreateQuiz);
document.getElementById('go-to-view-results').addEventListener('click', showViewResults);

// Student functionality
document.getElementById('start-quiz').addEventListener('click', startQuiz);
document.getElementById('return-to-quiz').addEventListener('click', returnToQuiz);
document.getElementById('restart-quiz').addEventListener('click', restartQuiz);
document.getElementById('view-results-btn').addEventListener('click', handleViewResultsClick);

const togglePaletteBtn = document.getElementById('toggle-palette-btn');
if (togglePaletteBtn) {
    togglePaletteBtn.addEventListener('click', () => {
        const grid = document.getElementById('student-palette-grid');
        const text = document.getElementById('toggle-palette-text');
        if (grid) {
            const isHidden = grid.classList.toggle('hidden');
            if (text) text.textContent = isHidden ? 'Show Grid' : 'Hide Grid';
            togglePaletteBtn.setAttribute('aria-expanded', !isHidden);
        }
    });
}

['student-quiz-id', 'results-quiz-id'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener('blur', function () {
            this.value = this.value.trim().replace(/^Quiz ID:\s*/i, '');
        });
        element.addEventListener('paste', function () {
            setTimeout(() => {
                this.value = this.value.trim().replace(/^Quiz ID:\s*/i, '');
            }, 100);
        });
    }
});

['student-secret-key', 'results-secret-key'].forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener('blur', function () {
            this.value = this.value.trim().replace(/^Secret Key:\s*/i, '');
        });
        element.addEventListener('paste', function () {
            setTimeout(() => {
                this.value = this.value.trim().replace(/^Secret Key:\s*/i, '');
            }, 100);
        });
    }
});

function isDevToolsOpen() {
    // Touch/mobile devices do not have docked desktop DevTools
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) return false;

    // Method 1: Debugger delay
    const start = performance.now();
    debugger;
    if (performance.now() - start > 220) return true;

    // Method 2: Significant window size discrepancy (docked desktop DevTools)
    if (window.outerWidth && window.innerWidth) {
        const widthDiff = window.outerWidth - window.innerWidth;
        const heightDiff = window.outerHeight - window.innerHeight;
        if (widthDiff > 280 || heightDiff > 280) return true;
    }

    return false;
}

// --- CHEATING PREVENTION ---
window.addEventListener('contextmenu', (e) => { if (isQuizActive) e.preventDefault(); });
['copy', 'cut', 'dragstart'].forEach(event => {
    window.addEventListener(event, (e) => { if (isQuizActive) e.preventDefault(); });
});
window.addEventListener('keydown', (e) => {
    // Block DevTools
    if (isQuizActive && (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')))) {
        e.preventDefault();
    }
    // Block Save, View Source, Select All
    if (isQuizActive && e.ctrlKey && (e.key === 's' || e.key === 'u' || e.key === 'a')) {
        e.preventDefault();
    }
});
document.getElementById('export-pdf-btn').addEventListener('click', exportResultsToPdf);

function handleVisibilityChange() {
    if (document.hidden && isQuizActive) handleFocusLoss();
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
const debouncedSaveDraft = debounce((...args) => saveDraft(...args), 400);

function addQuestion(questionData = null) {
    const questionsContainer = document.getElementById('questions-container');
    const questionIndex = questionsContainer.children.length;

    const text = questionData ? questionData.text : '';
    const figure = questionData ? (questionData.figure || '') : '';
    const options = (questionData && questionData.options) ?
        (Array.isArray(questionData.options) ? questionData.options : questionData.options.split('|').map(o => o.trim()))
        : ['', '', '', ''];
    const correctAnswer = questionData ? questionData.correctAnswer : 0;

    const questionDiv = document.createElement('div');
    questionDiv.className = 'quiz-question';
    questionDiv.id = `question-card-${questionIndex}`;

    questionDiv.innerHTML = `
        <div class="question-card-header">
            <h3 class="question-number-title">Question ${questionIndex + 1}</h3>
            <div class="question-card-actions">
                <button class="btn btn-outline preview-toggle-btn">
                    <svg class="icon-eye" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <span>Preview</span>
                </button>
                <button class="btn btn-outline duplicate-question">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>Duplicate</span>
                </button>
                <button class="btn btn-danger remove-question">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <span>Remove</span>
                </button>
            </div>
        </div>
        
        <div class="form-group">
            <label>Question Text</label>
            <textarea class="question-text" placeholder="What is the result of...?" rows="3"></textarea>
        </div>
        
        <details class="form-group figure-collapsible" ${figure ? 'open' : ''}>
            <summary class="figure-summary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Add Figure / Illustration (HTML/SVG)
            </summary>
            <div class="figure-editor-layout">
                <div class="figure-input-wrapper">
                    <textarea class="question-figure" placeholder="e.g. <svg>...</svg> or <b>Code Snippet</b>" rows="3"></textarea>
                    <button class="clear-figure-btn">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Clear content
                    </button>
                </div>
                <div class="figure-editor-preview">
                    <small style="color:var(--text-muted)">Figure Preview</small>
                </div>
            </div>
        </details>

        <div class="preview-container">
            <span class="preview-badge">Student View Preview</span>
            <div class="preview-content"></div>
        </div>
        
        <div class="form-group">
            <label class="options-header">
                <span>Options <small style="color:var(--text-muted); font-weight:normal;">(Click a number to mark as correct)</small></span>
                <button class="btn btn-outline btn-sm add-option-btn">+ Add Option</button>
            </label>
            <div class="options-builder"></div>
        </div>
        
        <input type="hidden" class="correct-answer" value="${correctAnswer}">
    `;

    questionDiv.querySelector('.question-text').value = text;
    questionDiv.querySelector('.question-figure').value = figure;

    questionsContainer.appendChild(questionDiv);

    const optionsBuilder = questionDiv.querySelector('.options-builder');
    options.forEach((opt, i) => addOptionInput(optionsBuilder, opt, i === correctAnswer));

    // Event Listeners
    questionDiv.querySelector('.remove-question').addEventListener('click', function () {
        questionsContainer.removeChild(questionDiv);
        updateQuestionNumbers();
        saveDraft();
    });

    questionDiv.querySelector('.duplicate-question').addEventListener('click', function () {
        const currentData = getQuestionData(questionDiv);
        addQuestion(currentData);
        updateQuestionNumbers();
        saveDraft();
    });

    questionDiv.querySelector('.add-option-btn').addEventListener('click', function () {
        addOptionInput(optionsBuilder, '');
        saveDraft();
    });

    const previewToggle = questionDiv.querySelector('.preview-toggle-btn');
    const previewContainer = questionDiv.querySelector('.preview-container');
    previewToggle.addEventListener('click', function () {
        const isActive = previewContainer.classList.toggle('active');
        previewToggle.innerHTML = isActive ?
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> <span>Edit</span>` :
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> <span>Preview</span>`;
        if (isActive) updateLivePreview(questionDiv);
    });

    const figureInput = questionDiv.querySelector('.question-figure');
    const figurePreview = questionDiv.querySelector('.figure-editor-preview');
    const clearFigureBtn = questionDiv.querySelector('.clear-figure-btn');

    clearFigureBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Clear the illustration/figure for this question?')) {
            figureInput.value = '';
            refreshEditorFigure();
            saveDraft();
        }
    });

    const refreshEditorFigure = () => {
        const val = figureInput.value.trim();
        figurePreview.innerHTML = sanitizeFigure(val) || '<small style="color:var(--text-muted)">Figure Preview</small>';
    };

    // Initial load
    if (figure) refreshEditorFigure();

    // Auto-save and live preview logic
    questionDiv.addEventListener('input', (e) => {
        if (e.target.classList.contains('question-figure')) refreshEditorFigure();
        if (previewContainer.classList.contains('active')) updateLivePreview(questionDiv);
        debouncedSaveDraft();
    });

    updateQuestionNumbers();
}

function addOptionInput(container, value = '', isCorrect = false) {
    const index = container.children.length;
    const div = document.createElement('div');
    div.className = 'option-input-group';
    div.innerHTML = `
        <span class="option-index-badge ${isCorrect ? 'correct' : ''}" title="Set as correct answer">${index}</span>
        <input type="text" class="option-val" placeholder="Possible answer...">
        <span class="remove-option-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </span>
    `;
    div.querySelector('.option-val').value = value;
    container.appendChild(div);

    div.querySelector('.option-index-badge').addEventListener('click', () => {
        const card = container.closest('.quiz-question');
        const hiddenInput = card.querySelector('.correct-answer');
        hiddenInput.value = index;

        // Update visual state for all options in this card
        container.querySelectorAll('.option-input-group').forEach((group, i) => {
            const badge = group.querySelector('.option-index-badge');
            const match = (i === index);
            if (match) badge.classList.add('correct');
            else badge.classList.remove('correct');
        });
        saveDraft();
    });

    div.querySelector('.remove-option-btn').addEventListener('click', () => {
        if (container.children.length > 2) {
            container.removeChild(div);
            updateOptionIndices(container);
            saveDraft();
        } else {
            alert("Minimum 2 options required.");
        }
    });

    // Save draft on keystroke with debounce
    div.querySelector('.option-val').addEventListener('input', debouncedSaveDraft);
}

function updateOptionIndices(container) {
    const groups = container.querySelectorAll('.option-input-group');
    groups.forEach((group, i) => {
        const badge = group.querySelector('.option-index-badge');
        if (badge) badge.textContent = i;
    });
}

function updateLivePreview(card) {
    const text = card.querySelector('.question-text').value;
    const figure = card.querySelector('.question-figure').value;
    const options = Array.from(card.querySelectorAll('.option-val')).map(i => i.value);
    const previewContent = card.querySelector('.preview-content');

    previewContent.innerHTML = `
        <p style="font-size:1.1rem; margin-bottom:15px; white-space: pre-wrap; word-break: break-word;">${text ? escapeHtml(text) : '<i style="color:var(--text-muted)">No question text...</i>'}</p>
        ${figure ? `<div class="quiz-figure" style="margin-bottom:20px;">${sanitizeFigure(figure)}</div>` : ''}
        <div class="quiz-options">
            ${options.map((opt, i) => `
                <div class="quiz-option" style="cursor:default; white-space: pre-wrap; word-break: break-word;">${opt ? escapeHtml(opt) : '<i style="color:var(--text-muted)">Empty option...</i>'}</div>
            `).join('')}
        </div>
    `;
}

function getQuestionData(card) {
    return {
        text: card.querySelector('.question-text').value,
        figure: card.querySelector('.question-figure').value,
        options: Array.from(card.querySelectorAll('.option-val')).map(i => i.value).filter(v => v.trim() !== ''),
        correctAnswer: parseInt(card.querySelector('.correct-answer').value) || 0
    };
}

function updateQuestionNumbers() {
    const questionsContainer = document.getElementById('questions-container');
    const navigatorContainer = document.getElementById('quiz-navigator');
    const questions = questionsContainer.querySelectorAll('.quiz-question');

    navigatorContainer.innerHTML = '';

    questions.forEach((q, index) => {
        const titleEl = q.querySelector('.question-number-title');
        if (titleEl) titleEl.textContent = `Question ${index + 1}`;
        q.id = `question-card-${index}`;

        // Update Navigator
        const dot = document.createElement('div');
        dot.className = 'nav-dot';
        dot.textContent = index + 1;
        dot.title = `Jump to Question ${index + 1}`;
        dot.onclick = () => {
            document.querySelectorAll('.nav-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            q.scrollIntoView({ behavior: 'smooth', block: 'center' });
            q.style.outline = '2px solid var(--primary)';
            setTimeout(() => q.style.outline = 'none', 1500);
        };
        navigatorContainer.appendChild(dot);
    });
}

// --- ADVANCED SECURITY HELPERS ---

function generateWatermark(firstName, lastName, section, studentId) {
    const createLayer = (w, h, opacity, rotate, scale = 1) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.font = `bold ${14 * scale}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx.textAlign = 'center';
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rotate);

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const text1 = `${lastName.toUpperCase()}, ${firstName}`;
        const text2 = `${studentId} | ${section}`;
        const text3 = `UNAUTHORIZED COPY - ${timestamp}`;

        ctx.fillText(text1, 0, -20 * scale);
        ctx.fillText(text2, 0, 0);
        ctx.fillText(text3, 0, 20 * scale);
        return canvas.toDataURL();
    };

    const staticLayer = createLayer(400, 300, 0.5, -Math.PI / 4);
    const dynamicLayer = createLayer(600, 450, 0.3, -Math.PI / 6, 1.5);

    document.getElementById('quiz-watermark').style.backgroundImage = `url(${staticLayer})`;
    document.getElementById('quiz-watermark-dynamic').style.backgroundImage = `url(${dynamicLayer})`;
}

let isClearingClipboard = false;

function clearClipboard() {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            isClearingClipboard = true;
            navigator.clipboard.writeText(' ')
                .catch(() => { })
                .finally(() => {
                    setTimeout(() => { isClearingClipboard = false; }, 300);
                });
        }
    } catch (e) {
        isClearingClipboard = false;
    }
}

// Handle Ctrl+P
window.addEventListener('keydown', (e) => {
    if (isQuizActive && (e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handleFocusLoss(); // Log as violation
        alert('Printing is disabled for security. This attempt has been logged.');
    }
});

function loadQuizFromJson() {
    const fileInput = document.getElementById('json-upload');
    if (!fileInput.files[0]) {
        alert('Please select a JSON file.');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => processJsonData(e.target.result);
    reader.readAsText(fileInput.files[0]);
}

function loadQuizFromPastedText() {
    const jsonText = document.getElementById('pasted-json-input').value;
    if (!jsonText.trim()) {
        alert('Please paste JSON data first.');
        return;
    }
    processJsonData(jsonText);
}

function processJsonData(jsonDataString) {
    try {
        const quizJson = JSON.parse(jsonDataString);
        if (!quizJson.title || !Array.isArray(quizJson.questions)) {
            throw new Error('Invalid JSON format.');
        }
        document.getElementById('quiz-title').value = quizJson.title;
        const questionsContainer = document.getElementById('questions-container');
        questionsContainer.innerHTML = '';
        quizJson.questions.forEach(q => addQuestion(q));
        alert('Quiz loaded successfully!');
    } catch (error) {
        alert('Failed to load JSON: ' + error.message);
    }
}

function generateEncryptedFile() {
    if (!auth.currentUser) {
        showToast('Please sign in as a teacher to create and save quizzes.', 'error');
        openAuthModal('login');
        return;
    }

    const quizTitle = document.getElementById('quiz-title').value;
    const quizSubject = document.getElementById('quiz-subject').value;
    const quizDuration = parseFloat(document.getElementById('quiz-duration').value) || 0;
    const quizExpiry = document.getElementById('quiz-expiry').value;
    const sampleQuestionCount = parseInt(document.getElementById('sample-question-count').value) || 0;
    const instructionCountdownDuration = parseInt(document.getElementById('instruction-countdown-duration').value) || 30;
    const showResultsToStudent = document.getElementById('show-results-to-student').checked;
    const showAnswerSummary = document.getElementById('show-answer-summary').checked;
    const saveResultsToCloud = document.getElementById('save-results-to-cloud').checked;
    const randomizeOrder = document.getElementById('randomize-order').checked;
    const secretKey = document.getElementById('secret-key').value;
    const questions = document.querySelectorAll('.quiz-question');

    if (questions.length === 0) { alert('Add at least one question.'); return; }
    if (!secretKey) { alert('Enter a Secret Key.'); return; }

    const quizId = 'quiz-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const quiz = {
        title: quizTitle,
        subject: quizSubject,
        duration: quizDuration,
        expiry: parseExpiryInput(quizExpiry),
        sampleCount: sampleQuestionCount,
        instructionCountdown: instructionCountdownDuration,
        showResultsToStudent, showAnswerSummary, saveResultsToCloud, randomizeOrder,
        id: quizId,
        questions: []
    };

    let allValid = true;
    questions.forEach((q, index) => {
        const data = getQuestionData(q);
        if (data.text && data.options.length >= 2 && !isNaN(data.correctAnswer) && data.correctAnswer >= 0 && data.correctAnswer < data.options.length) {
            quiz.questions.push(data);
        } else {
            alert(`Error in Question ${index + 1}. Please ensure text is provided, at least 2 options exist, and correct answer index is valid.`);
            allValid = false;
        }
    });

    if (!allValid) return;

    showLoading();
    encryptData(JSON.stringify(quiz), secretKey).then(async (encrypted) => {
        const teacherUid = auth.currentUser.uid;
        const teacherEmail = auth.currentUser.email || '';
        const adminMeta = {
            title: quizTitle,
            subject: quizSubject || 'Uncategorized',
            secretKey: secretKey,
            sampleCount: sampleQuestionCount,
            teacherEmail: teacherEmail,
            createdAt: Date.now()
        };

        // Encrypt metadata
        const encryptedAdminMeta = await systemEncrypt(JSON.stringify(adminMeta));

        const saveData = {};
        saveData['quizzes/' + quiz.id] = {
            encryptedQuizData: encrypted,
            creatorUid: teacherUid,
            creatorEmail: teacherEmail,
            createdAt: Date.now()
        };
        saveData['teachers/' + teacherUid + '/quizzes/' + quiz.id] = {
            title: quizTitle,
            subject: quizSubject || 'Uncategorized',
            secretKey: secretKey,
            sampleCount: sampleQuestionCount,
            createdAt: Date.now()
        };
        saveData['admin/quizzes/' + quiz.id] = { data: encryptedAdminMeta };

        database.ref().update(saveData).then(() => {
            hideLoading();
            const studentLink = generateQuizLink(quiz.id, secretKey);
            const teacherLink = generateQuizLink(quiz.id, secretKey, true);
            const credentials = `Quiz Title: ${quizTitle}\nQuiz ID: ${quiz.id}\nSecret Key: ${secretKey}\n\nStudent Link: ${studentLink}\nTeacher Link: ${teacherLink}`;
            saveTeacherHistory(quizTitle, quiz.id, secretKey); // Save to history
            const blob = new Blob([credentials], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quiz_credentials_${quizTitle.replace(/\s+/g, '_')}.txt`;
            a.click();
            resetQuizForm();
            showQuizCreatedModal(studentLink, teacherLink);
        }).catch(err => {
            hideLoading();
            alert('Failed to save quiz: ' + err.message);
        });
    }).catch(err => {
        hideLoading();
        alert('Encryption failed: ' + err.message);
    });
}

function resetQuizForm() {
    document.getElementById('quiz-title').value = '';
    document.getElementById('quiz-subject').value = '';
    document.getElementById('quiz-duration').value = '0';
    document.getElementById('quiz-expiry').value = '';
    const sampleInput = document.getElementById('sample-question-count');
    if (sampleInput) sampleInput.value = '';
    document.getElementById('secret-key').value = '';
    document.getElementById('pasted-json-input').value = '';
    document.getElementById('json-upload').value = '';
    document.getElementById('json-file-name').textContent = 'No file chosen';
    document.getElementById('questions-container').innerHTML = '';
    // Add one empty question to start fresh
    addQuestion();
    localStorage.removeItem('quizable_quiz_draft');
    alert("Form cleared.");
}

// --- DRAFT SYSTEM ---
function saveDraft() {
    const questions = document.querySelectorAll('.quiz-question');
    const sampleInput = document.getElementById('sample-question-count');
    const draft = {
        title: document.getElementById('quiz-title').value,
        subject: document.getElementById('quiz-subject').value,
        duration: document.getElementById('quiz-duration').value,
        expiry: document.getElementById('quiz-expiry').value,
        sampleCount: sampleInput ? sampleInput.value : '',
        secretKey: document.getElementById('secret-key').value,
        showResults: document.getElementById('show-results-to-student').checked,
        showAnswerSummary: document.getElementById('show-answer-summary').checked,
        saveCloud: document.getElementById('save-results-to-cloud').checked,
        randomize: document.getElementById('randomize-order').checked,
        questions: []
    };

    questions.forEach(q => {
        draft.questions.push(getQuestionData(q));
    });

    localStorage.setItem('quizable_quiz_draft', JSON.stringify(draft));
}

function loadDraft() {
    const saved = localStorage.getItem('quizable_quiz_draft');
    if (!saved) return;

    try {
        const draft = JSON.parse(saved);
        if (draft.questions.length === 0) return;

        document.getElementById('quiz-title').value = draft.title || '';
        document.getElementById('quiz-subject').value = draft.subject || '';
        document.getElementById('quiz-duration').value = draft.duration || '0';
        document.getElementById('quiz-expiry').value = draft.expiry || '';
        const sampleInput = document.getElementById('sample-question-count');
        if (sampleInput) sampleInput.value = draft.sampleCount || '';
        document.getElementById('secret-key').value = draft.secretKey || '';
        document.getElementById('show-results-to-student').checked = draft.showResults !== false;
        document.getElementById('show-answer-summary').checked = draft.showAnswerSummary !== false;
        document.getElementById('save-results-to-cloud').checked = draft.saveCloud !== false;
        document.getElementById('randomize-order').checked = draft.randomize !== false;

        const container = document.getElementById('questions-container');
        container.innerHTML = '';
        draft.questions.forEach(q => addQuestion(q));

        updateQuestionNumbers();
        console.log("Draft loaded successfully.");
    } catch (e) {
        console.error("Failed to load draft:", e);
    }
}

function exportDraftAsJson() {
    const questions = document.querySelectorAll('.quiz-question');
    const quizTitle = document.getElementById('quiz-title').value || 'Untitled Quiz';
    const draft = {
        title: quizTitle,
        subject: document.getElementById('quiz-subject').value,
        duration: document.getElementById('quiz-duration').value,
        expiry: document.getElementById('quiz-expiry').value,
        showResultsToStudent: document.getElementById('show-results-to-student').checked,
        showAnswerSummary: document.getElementById('show-answer-summary').checked,
        saveResultsToCloud: document.getElementById('save-results-to-cloud').checked,
        randomizeOrder: document.getElementById('randomize-order').checked,
        questions: []
    };

    questions.forEach(q => {
        draft.questions.push(getQuestionData(q));
    });

    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quizTitle.replace(/\s+/g, '_')}_structure.json`;
    a.click();
}

// Periodic Auto-Save every 5 seconds (Safety First)
setInterval(() => {
    if (!teacherCreateSection.classList.contains('hidden')) {
        saveDraft();
        console.log("Draft auto-saved...");
    }
}, 5000);

function handleViewResultsClick() {
    let quizId = document.getElementById('results-quiz-id').value.trim();
    quizId = quizId.replace(/^Quiz ID:\s*/i, '');

    let secretKey = document.getElementById('results-secret-key').value.trim();
    secretKey = secretKey.replace(/^Secret Key:\s*/i, '');

    if (quizId && secretKey) fetchAndDisplayResults(quizId, secretKey);
}

async function fetchAndDisplayResults(quizId, secretKey) {
    const resultsDisplay = document.getElementById('student-results-display');
    const sectionContainer = document.getElementById('section-selector-container');
    const quizManagementContainer = document.getElementById('quiz-management-container');
    const modifyExpiryInput = document.getElementById('modify-quiz-expiry');

    showLoading();
    quizManagementContainer.classList.add('hidden');

    // Fetch Quiz Details for Management
    try {
        const quizSnap = await database.ref('quizzes/' + quizId).once('value');
        const quizDataEnc = quizSnap.val();
        if (quizDataEnc) {
            const decrypted = await decryptData(quizDataEnc.encryptedQuizData, secretKey);
            const quizDetails = JSON.parse(decrypted);

            quizManagementContainer.classList.remove('hidden');

            // Populate fields
            document.getElementById('modify-quiz-duration').value = quizDetails.duration || 0;
            const modifySampleCountEl = document.getElementById('modify-quiz-sample-count');
            if (modifySampleCountEl) modifySampleCountEl.value = quizDetails.sampleCount || 0;
            const bankCountEl = document.getElementById('modify-quiz-bank-count');
            if (bankCountEl) bankCountEl.textContent = Array.isArray(quizDetails.questions) ? quizDetails.questions.length : 0;
            document.getElementById('modify-show-results').checked = quizDetails.showResultsToStudent !== false;
            document.getElementById('modify-show-answer-summary').checked = quizDetails.showAnswerSummary !== false;

            modifyExpiryInput.value = formatDateTimeLocal(quizDetails.expiry);

            // Requirement 2: Save to history if not already there
            saveTeacherHistory(quizDetails.title, quizId, secretKey);

            const isOwner = !quizDataEnc.creatorUid || (auth.currentUser && auth.currentUser.uid === quizDataEnc.creatorUid);
            const updateBtn = document.getElementById('update-quiz-settings-btn');
            if (updateBtn) {
                if (!isOwner) {
                    updateBtn.disabled = true;
                    updateBtn.title = "Only the creator of this quiz can modify settings.";
                } else {
                    updateBtn.disabled = false;
                    updateBtn.title = "";
                }

                updateBtn.onclick = () => {
                    if (!isOwner) {
                        alert("Permission Denied: Only the creator of this quiz can modify settings.");
                        return;
                    }
                    const newDuration = parseFloat(document.getElementById('modify-quiz-duration').value) || 0;
                    const newExpiry = parseExpiryInput(modifyExpiryInput.value);
                    const newSampleCount = parseInt(document.getElementById('modify-quiz-sample-count')?.value, 10) || 0;
                    const showResults = document.getElementById('modify-show-results').checked;
                    const showAnswerSummaryVal = document.getElementById('modify-show-answer-summary').checked;
                    updateQuizSettings(quizId, secretKey, {
                        duration: newDuration,
                        expiry: newExpiry,
                        sampleCount: newSampleCount,
                        showResultsToStudent: showResults,
                        showAnswerSummary: showAnswerSummaryVal
                    }, quizDetails);
                };
            }
        }
    } catch (e) {
        console.warn("Could not fetch quiz details for management:", e);
    }

    const resultsRef = database.ref(`results/${quizId}`);
    try {
        const snapshot = await resultsRef.once('value');
        const encryptedResults = snapshot.val();

        if (!encryptedResults) {
            hideLoading();
            resultsDisplay.innerHTML = '<p>No results found.</p>';
            return;
        }

        const promises = Object.entries(encryptedResults).map(([dbKey, data]) =>
            decryptData(data, secretKey).then(dec => {
                const parsed = JSON.parse(dec);
                parsed.dbKey = dbKey;
                return parsed;
            }).catch(() => null)
        );
        const validResults = (await Promise.all(promises)).filter(Boolean);
        allStudentResults = validResults;

        const resultsBySection = validResults.reduce((acc, res) => {
            const sec = res.student.section || 'Unspecified';
            if (!acc[sec]) acc[sec] = [];
            acc[sec].push(res);
            return acc;
        }, {});

        const sortedSections = Object.keys(resultsBySection).sort();
        const checkboxGroup = document.getElementById('section-checkboxes');
        checkboxGroup.innerHTML = sortedSections.map(sec => `
            <label><input type="checkbox" class="section-checkbox" value="${sec}" checked> ${sec}</label>
        `).join('');
        sectionContainer.classList.remove('hidden');

        const render = (selected) => {
            let list = [];
            selected.forEach(s => list.push(...resultsBySection[s]));
            list.sort((a, b) => a.student.lastName.localeCompare(b.student.lastName));
            processedStudentResults = list;
            document.getElementById('export-pdf-btn').classList.toggle('hidden', list.length === 0);
            const expExcelBtnToggle = document.getElementById('export-excel-btn');
            if (expExcelBtnToggle) expExcelBtnToggle.classList.toggle('hidden', list.length === 0);

            // Analytics Calculation
            const scores = list.map(r => (r.score / r.totalQuestions) * 100);
            const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
            const highest = scores.length ? Math.max(...scores).toFixed(1) : 0;
            const passCount = scores.filter(s => s >= 75).length;
            const passRate = scores.length ? ((passCount / scores.length) * 100).toFixed(1) : 0;

            const times = list.map(r => r.timeTakenMs || 0).filter(t => t > 0);
            const avgTimeMs = times.length ? (times.reduce((a, b) => a + b, 0) / times.length) : 0;
            const avgTimeMins = (avgTimeMs / 60000).toFixed(1);

            resultsDisplay.innerHTML = `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:15px; margin-bottom:30px;">
                    <div class="card" style="padding:15px; margin-bottom:0; text-align:center; background:var(--bg-body); border:1px solid var(--border);">
                        <div style="font-size:0.8rem; color:var(--text-muted);">Avg. Score</div>
                        <div style="font-size:1.5rem; font-weight:700; color:var(--primary);">${avgScore}%</div>
                    </div>
                    <div class="card" style="padding:15px; margin-bottom:0; text-align:center; background:var(--bg-body); border:1px solid var(--border);">
                        <div style="font-size:0.8rem; color:var(--text-muted);">Avg. Duration</div>
                        <div style="font-size:1.5rem; font-weight:700; color:var(--info);">${avgTimeMins}m</div>
                    </div>
                    <div class="card" style="padding:15px; margin-bottom:0; text-align:center; background:var(--bg-body); border:1px solid var(--border);">
                        <div style="font-size:0.8rem; color:var(--text-muted);">Highest</div>
                        <div style="font-size:1.5rem; font-weight:700; color:var(--primary);">${highest}%</div>
                    </div>
                    <div class="card" style="padding:15px; margin-bottom:0; text-align:center; background:var(--bg-body); border:1px solid var(--border);">
                        <div style="font-size:0.8rem; color:var(--text-muted);">Pass Rate (75%+)</div>
                        <div style="font-size:1.5rem; font-weight:700; color:var(--success);">${passRate}%</div>
                    </div>
                    <div class="card" style="padding:15px; margin-bottom:0; text-align:center; background:var(--bg-body); border:1px solid var(--border);">
                        <div style="font-size:0.8rem; color:var(--text-muted);">Students</div>
                        <div style="font-size:1.5rem; font-weight:700; color:var(--text-main);">${list.length}</div>
                    </div>
                </div>

                <h3>Student List</h3>
                <div class="card" style="padding:0; overflow:hidden;">
                    ${list.map(res => {
                const submissionDate = res.submittedAt ? new Date(res.submittedAt).toLocaleString() : 'N/A';
                return `
                    <div class="student-result-card" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:12px;">
                        <div style="flex:1; min-width:240px;">
                            <div style="font-weight:600; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                ${escapeHtml(res.student?.lastName || '')}, ${escapeHtml(res.student?.firstName || '')}
                                ${res.isRetake ? `<span style="font-size:0.7rem; background:#fef3c7; color:#92400e; padding:2px 7px; border-radius:4px; font-weight:600; border:1px solid #fde68a;">🔄 Retake</span>` : ''}
                            </div>
                            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                                ID: ${escapeHtml(res.student?.institutionalId || 'N/A')} | Section: ${escapeHtml(res.student?.section || 'N/A')}
                            </div>
                            ${res.isRetake && res.retakeReason ? `<div style="font-size:0.75rem; color:#b45309; margin-top:3px; background:#fffbeb; padding:3px 8px; border-radius:4px; display:inline-block; border-left:3px solid #f59e0b;"><strong>Reason:</strong> <em>${escapeHtml(res.retakeReason)}</em></div>` : ''}
                            ${res.securityViolations > 0 ? `<div style="font-size:0.7rem; color:var(--danger); font-weight:700; margin-top:4px;">⚠️ ${res.securityViolations} Security Violations</div>` : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:14px;">
                            <div style="text-align:right;">
                                <div style="color:var(--primary); font-weight:800; font-size:1.2rem;">${res.score}/${res.totalQuestions}</div>
                                <div style="font-size:0.7rem; color:var(--text-muted);">${res.timeTakenMs ? (res.timeTakenMs / 60000).toFixed(1) + 'm' : 'N/A'} | ${submissionDate}</div>
                            </div>
                            <button class="btn btn-sm btn-danger-outline reset-student-btn" 
                                onclick="confirmResetStudentAttempt('${escapeHtml(quizId)}', '${escapeHtml(secretKey)}', '${escapeHtml(res.dbKey)}', '${escapeHtml((res.student?.lastName || '') + ', ' + (res.student?.firstName || ''))}', '${escapeHtml(res.student?.institutionalId || '')}')" 
                                title="Reset attempt and clear lockout for this student">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                                Reset
                            </button>
                        </div>
                    </div>
                    `;
            }).join('')}
                </div>
            `;
        };

        document.getElementById('merge-sections-btn').onclick = () => {
            const selected = Array.from(document.querySelectorAll('.section-checkbox:checked')).map(cb => cb.value);
            render(selected);
        };
        render(sortedSections);
        hideLoading();
    } catch (error) {
        hideLoading();
        alert('Error fetching results: ' + error.message);
    }
}

async function updateQuizSettings(quizId, secretKey, newSettings, currentQuizData) {
    if (!auth.currentUser) {
        alert('You must be logged in as the quiz creator to update quiz settings.');
        return;
    }
    if (!confirm('Are you sure you want to update the quiz settings?')) return;

    showLoading();
    try {
        // Update the fields in the quiz object
        if (newSettings.hasOwnProperty('duration')) currentQuizData.duration = newSettings.duration;
        if (newSettings.hasOwnProperty('expiry')) {
            currentQuizData.expiry = parseExpiryTimestamp(newSettings.expiry);
        }
        if (newSettings.hasOwnProperty('sampleCount')) {
            currentQuizData.sampleCount = newSettings.sampleCount;
        }
        if (newSettings.hasOwnProperty('showResultsToStudent')) {
            currentQuizData.showResultsToStudent = newSettings.showResultsToStudent;
        }
        if (newSettings.hasOwnProperty('showAnswerSummary')) {
            currentQuizData.showAnswerSummary = newSettings.showAnswerSummary;
        }

        // Re-encrypt the entire quiz data
        const encrypted = await encryptData(JSON.stringify(currentQuizData), secretKey);

        // Save back to Firebase
        await database.ref('quizzes/' + quizId).update({
            encryptedQuizData: encrypted
        });

        if (auth.currentUser && newSettings.hasOwnProperty('sampleCount')) {
            await database.ref(`teachers/${auth.currentUser.uid}/quizzes/${quizId}`).update({
                sampleCount: newSettings.sampleCount || 0
            }).catch(() => {});
        }

        hideLoading();
        showConfirmationModal('Success!', 'Quiz settings have been updated.', null, true);
    } catch (error) {
        hideLoading();
        alert('Failed to update quiz settings: ' + error.message);
    }
}

window.confirmResetStudentAttempt = async function (quizId, secretKey, dbKey, studentName, studentInstId, isAdmin = false) {
    if (!auth.currentUser) {
        showToast('Please sign in to manage student results.', 'error');
        return;
    }

    const displayName = studentName ? studentName.trim() : 'this student';
    const idInfo = studentInstId ? ` (ID: ${studentInstId})` : '';
    const message = `Are you sure you want to reset the attempt for ${displayName}${idInfo}?\n\nThis will permanently delete their submission and clear all security lockout violations from the database, allowing them to take the exam again cleanly without penalty.`;

    showConfirmationModal('Reset Student Attempt', message, async () => {
        showLoading();
        try {
            await database.ref(`results/${quizId}/${dbKey}`).remove();
            hideLoading();
            showToast(`Attempt for ${displayName} has been reset.`, 'success');
            if (isAdmin) {
                delete adminResultsCache[quizId];
                loadAdminQuizResults(quizId, secretKey);
            } else {
                fetchAndDisplayResults(quizId, secretKey);
            }
        } catch (err) {
            hideLoading();
            alert('Failed to reset student attempt: ' + err.message);
        }
    });
};

function exportResultsToPdf() {
    if (processedStudentResults.length === 0) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const res0 = processedStudentResults[0];

    // Analytics Calculation
    const scores = processedStudentResults.map(r => (r.score / r.totalQuestions) * 100);
    const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
    const highest = scores.length ? Math.max(...scores).toFixed(1) : 0;
    const passCount = scores.filter(s => s >= 75).length;
    const passRate = scores.length ? ((passCount / scores.length) * 100).toFixed(1) : 0;

    const times = processedStudentResults.map(r => r.timeTakenMs || 0).filter(t => t > 0);
    const avgTimeMins = times.length ? (times.reduce((a, b) => a + b, 0) / times.length / 60000).toFixed(1) : 0;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // var(--primary)
    doc.text(res0.quizTitle, 14, 22);

    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139); // var(--text-muted)
    doc.text(`Subject: ${res0.subject || 'N/A'}`, 14, 30);
    doc.text(`Report Generated: ${new Date().toLocaleString()}`, 14, 37);

    // Analytics Summary Table
    doc.autoTable({
        head: [['Class Performance Summary', 'Value']],
        body: [
            ['Average Score', `${avgScore}%`],
            ['Average Duration', `${avgTimeMins}m`],
            ['Highest Score', `${highest}%`],
            ['Pass Rate (75%+)', `${passRate}%`],
            ['Total Students', processedStudentResults.length]
        ],
        startY: 45,
        theme: 'striped',
        headStyles: { fillColor: [15, 118, 110] } // var(--secondary)
    });

    // Student List Table
    doc.setFontSize(16);
    doc.setTextColor(6, 78, 59); // var(--text-main)
    doc.text('Student Performance List', 14, doc.lastAutoTable.finalY + 15);

    doc.autoTable({
        head: [['Last Name', 'First Name', 'ID', 'Section', 'Score', 'Duration', 'Violations', 'Submitted At']],
        body: processedStudentResults.map(r => [
            r.student.lastName,
            r.student.firstName,
            r.student.institutionalId || 'N/A',
            r.student.section,
            `${r.score}/${r.totalQuestions}`,
            r.timeTakenMs ? (r.timeTakenMs / 60000).toFixed(1) + 'm' : 'N/A',
            r.securityViolations || 0,
            r.submittedAt ? new Date(r.submittedAt).toLocaleString() : 'N/A'
        ]),
        startY: doc.lastAutoTable.finalY + 20,
        headStyles: { fillColor: [16, 185, 129] } // var(--primary)
    });

    // Detailed Individual Reports (Optional - keeping existing logic)
    let includeDetails = true;
    if (processedStudentResults.length > 25) {
        includeDetails = confirm(
            `This class has ${processedStudentResults.length} students. Generating individual test breakdown pages for all students may take significant memory and time.\n\nClick OK to include full breakdown pages, or Cancel to generate a high-speed Summary Report (Class Analytics & Student Performance List only).`
        );
    }

    if (includeDetails) {
        processedStudentResults.forEach(res => {
            doc.addPage();
            doc.setFontSize(18);
            doc.setTextColor(16, 185, 129);
            doc.text(`Individual Detail: ${res.student.lastName}, ${res.student.firstName}`, 14, 20);

            doc.setFontSize(11);
            doc.setTextColor(100, 116, 139);
            doc.text(`Institutional ID: ${res.student.institutionalId || 'N/A'} | Section: ${res.student.section}`, 14, 28);
            const duration = res.timeTakenMs ? (res.timeTakenMs / 60000).toFixed(1) + 'm' : 'N/A';
            doc.text(`Final Score: ${res.score}/${res.totalQuestions} (${((res.score / res.totalQuestions) * 100).toFixed(1)}%) | Duration: ${duration}`, 14, 35);

            doc.autoTable({
                head: [['#', 'Question', 'Student Answer', 'Correct Answer', 'Result']],
                body: res.detailedAnswers.map((a, i) => [
                    i + 1,
                    a.questionText,
                    a.studentAnswerText,
                    a.correctAnswerText,
                    a.isCorrect ? 'Correct' : 'Incorrect'
                ]),
                startY: 42,
                headStyles: { fillColor: [15, 118, 110] }
            });
        });
    }

    doc.save(`${res0.quizTitle}_Full_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

function shuffleQuiz(quiz) {
    if (!quiz || !Array.isArray(quiz.questions)) return;
    // Densify and remove any holes/nulls
    quiz.questions = quiz.questions.filter(q => q && typeof q === 'object');
    for (let i = quiz.questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [quiz.questions[i], quiz.questions[j]] = [quiz.questions[j], quiz.questions[i]];
    }
    quiz.questions.forEach(q => {
        if (!q) return;
        if (!Array.isArray(q.options)) {
            if (typeof q.options === 'string') {
                q.options = q.options.split('|').map(o => o.trim()).filter(Boolean);
            } else if (q.options && typeof q.options === 'object') {
                q.options = Object.values(q.options).filter(Boolean);
            } else {
                q.options = ['Option 1', 'Option 2'];
            }
        }
        const cleanOpts = Array.from(q.options)
            .filter(opt => opt !== undefined && opt !== null)
            .map(opt => typeof opt === 'object' && opt.text ? String(opt.text).trim() : String(opt).trim())
            .filter(Boolean);
        if (cleanOpts.length < 2) return;

        const originalCorrectIndex = typeof q.correctAnswer === 'number' ? q.correctAnswer : 0;
        const mappedOptions = cleanOpts.map((opt, idx) => ({
            text: opt,
            isCorrect: idx === originalCorrectIndex
        }));
        for (let i = mappedOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [mappedOptions[i], mappedOptions[j]] = [mappedOptions[j], mappedOptions[i]];
        }
        q.options = mappedOptions.map(o => (o && o.text !== undefined) ? o.text : String(o || '')).filter(Boolean);
        const newCorrectIndex = mappedOptions.findIndex(o => o && o.isCorrect);
        q.correctAnswer = newCorrectIndex !== -1 ? newCorrectIndex : 0;
    });
}

let instructionCountdownInterval = null;

function showInstructionModal(duration, onComplete) {
    if (!instructionModal) {
        if (onComplete) onComplete();
        return;
    }

    if (instructionCountdownInterval) {
        clearInterval(instructionCountdownInterval);
        instructionCountdownInterval = null;
    }

    // Safely parse duration. Default to 5 seconds if undefined/null/invalid.
    const rawVal = parseInt(duration, 10);
    const countDuration = (!isNaN(rawVal) && rawVal > 0) ? rawVal : 5;

    let count = countDuration;
    if (instructionCountdown) {
        instructionCountdown.textContent = count;
    }
    instructionModal.classList.remove('hidden');

    let hasCompleted = false;
    const executeComplete = () => {
        if (hasCompleted) return;
        hasCompleted = true;
        if (instructionCountdownInterval) {
            clearInterval(instructionCountdownInterval);
            instructionCountdownInterval = null;
        }
        if (instructionModal) {
            instructionModal.classList.add('hidden');
        }
        if (onComplete) {
            try {
                onComplete();
            } catch (err) {
                console.error("Error starting quiz after countdown:", err);
                alert("Failed to start quiz: " + (err.message || err));
                if (studentSection) studentSection.classList.remove('hidden');
                if (quizSection) quizSection.classList.add('hidden');
            }
        }
    };

    // Allow student to proceed immediately via the "Start Quiz Now" button
    const proceedBtn = document.getElementById('instruction-proceed-btn');
    if (proceedBtn) {
        proceedBtn.onclick = () => executeComplete();
    }

    instructionCountdownInterval = setInterval(() => {
        count--;
        if (instructionCountdown) {
            instructionCountdown.textContent = Math.max(0, count);
        }
        if (count <= 0) {
            executeComplete();
        }
    }, 1000);
}

function fetchServerTimeOffset() {
    return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => {
            if (!done) {
                done = true;
                resolve(0);
            }
        }, 2000);

        database.ref(".info/serverTimeOffset").once("value").then(snap => {
            if (!done) {
                done = true;
                clearTimeout(timer);
                resolve(snap.val() || 0);
            }
        }).catch(() => {
            if (!done) {
                done = true;
                clearTimeout(timer);
                resolve(0);
            }
        });
    });
}

async function validateDeviceClock() {
    try {
        const offset = await fetchServerTimeOffset();
        // Allow up to 10 minutes (600,000ms) tolerance to avoid locking out students with minor system drift
        if (Math.abs(offset) > 600000) {
            const minutesOff = (Math.abs(offset) / 60000).toFixed(1);
            const direction = offset > 0 ? 'behind' : 'ahead of';
            return {
                valid: false,
                offset,
                message: `Device Clock Desynchronized: Your device clock is ${minutesOff} minutes ${direction} official server time.\n\nPlease set your computer or phone clock to "Automatic Time" in your system settings before taking this quiz.`
            };
        }
        return { valid: true, offset };
    } catch {
        return { valid: true, offset: 0 };
    }
}

async function getServerTime() {
    try {
        const offset = await fetchServerTimeOffset();
        return Date.now() + offset;
    } catch {
        return Date.now();
    }
}

function togglePrivacyBlur(e) {
    if (!isQuizActive) return;
    document.body.classList.toggle('privacy-blur', e.type === 'blur');
}

function handlePrintScreen(e) {
    if (isQuizActive && e.key === 'PrintScreen') {
        showToast('Screenshots are disabled during the examination.', 'warning');
    }
}

let pendingRetakeContext = null;

function openRetakeModal(context) {
    pendingRetakeContext = context;
    const reasonInput = document.getElementById('retake-reason-input');
    if (reasonInput) reasonInput.value = '';
    const modal = document.getElementById('retake-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeRetakeModal() {
    pendingRetakeContext = null;
    const modal = document.getElementById('retake-modal');
    if (modal) modal.classList.add('hidden');
}

function confirmRetakeQuiz() {
    const reasonInput = document.getElementById('retake-reason-input');
    const reason = reasonInput ? reasonInput.value.trim() : '';
    if (!reason) {
        alert('Please provide a reason for retaking the exam.');
        if (reasonInput) reasonInput.focus();
        return;
    }

    if (!pendingRetakeContext) return;
    const ctx = { ...pendingRetakeContext, isRetake: true, retakeReason: reason };
    closeRetakeModal();

    // Clear local storage locks & persistence for this quiz/student
    try {
        localStorage.removeItem(ctx.quizId);
        const pKey = `quiz_progress_${ctx.quizId}_${ctx.studentId}`;
        localStorage.removeItem(pKey);
    } catch (e) { }

    // Reset attempt counters
    focusLostCount = 0;
    isHandlingFocusLoss = false;

    proceedWithQuizExecution(ctx);
}

async function startQuiz() {
    let quizId = document.getElementById('student-quiz-id').value.trim();
    quizId = quizId.replace(/^Quiz ID:\s*/i, '');
    const firstName = document.getElementById('student-first-name').value.trim();
    const lastName = document.getElementById('student-last-name').value.trim();
    const studentInstitutionalId = document.getElementById('student-id-field').value.trim();

    // Get Year and Section
    const yearSelect = document.getElementById('student-year');
    const sectionSelect = document.getElementById('student-section-select');
    const yearVal = yearSelect.value;
    const sectionVal = sectionSelect.value;

    // Combine them (e.g. "3A" or "4TAB")
    const section = (yearVal && sectionVal) ? `${yearVal}${sectionVal}` : '';

    let secretKey = document.getElementById('student-secret-key').value.trim();
    secretKey = secretKey.replace(/^Secret Key:\s*/i, '');

    if (isDevToolsOpen()) { alert('Close DevTools.'); return; }
    if (!quizId || !firstName || !lastName || !section || !secretKey || !studentInstitutionalId) {
        alert('Please fill in all fields.');
        return;
    }

    const sanitizedInstId = studentInstitutionalId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedName = `${lastName}_${firstName}`.replace(/[^a-zA-Z0-9_]/g, '');
    const studentId = `${sanitizedInstId}_${sanitizedName}`.replace(/^[_-]+|[_-]+$/g, '') || `student_${Date.now()}`;
    const context = {
        quizId, firstName, lastName, studentInstitutionalId, yearVal, sectionVal, section, secretKey, studentId,
        isRetake: false, retakeReason: ''
    };

    showLoading();
    try {
        // Validate device clock sync
        const clockCheck = await validateDeviceClock();
        if (!clockCheck.valid) {
            hideLoading();
            alert(clockCheck.message);
            return;
        }

        const snap = await database.ref(`results/${quizId}/${studentId}`).once('value');

        // If there is NO submission in the cloud database, any old local submission record
        // on this machine is either obsolete or was reset by the instructor. Clear it!
        if (!snap.exists()) {
            try {
                localStorage.removeItem(quizId);
                localStorage.removeItem(`quiz_progress_${quizId}_${studentId}`);
            } catch (_) { }
        }

        const localRecord = localStorage.getItem(quizId);
        const hasSubmitted = snap.exists() || (localRecord && (Date.now() - JSON.parse(localRecord).timestamp < 10800000));

        if (hasSubmitted) {
            hideLoading();
            openRetakeModal(context);
            return;
        }

        proceedWithQuizExecution(context);
    } catch (err) {
        hideLoading();
        alert('Error validating student session: ' + err.message);
    }
}

async function proceedWithQuizExecution(ctx) {
    const { quizId, firstName, lastName, studentInstitutionalId, yearVal, sectionVal, section, secretKey, studentId, isRetake, retakeReason } = ctx;
    showLoading();
    try {
        const quizSnap = await database.ref('quizzes/' + quizId).once('value');
        const data = quizSnap.val();
        if (!data) {
            hideLoading();
            alert('Quiz not found in cloud database. Please verify the Quiz ID with your teacher.');
            return;
        }

        let decrypted;
        try {
            decrypted = await decryptData(data.encryptedQuizData, secretKey);
        } catch (decryptErr) {
            hideLoading();
            alert('Decryption failed: Incorrect secret key. Please check the access key provided by your teacher.');
            return;
        }

        quizData = JSON.parse(decrypted);

        // Validate and thoroughly sanitize quizData.questions structure
        if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
            hideLoading();
            alert('This quiz contains no questions or has corrupted data. Please contact your instructor.');
            return;
        }

        // Densify and normalize each question: guaranteed text, array of options, and valid correctAnswer
        quizData.questions = Array.from(quizData.questions)
            .filter(q => q && typeof q === 'object')
            .map((q, idx) => {
                const text = (q.text || q.question || q.title || `Question ${idx + 1}`).toString().trim();
                let options = q.options;
                if (!Array.isArray(options)) {
                    if (typeof options === 'string') {
                        options = options.split('|').map(o => o.trim()).filter(Boolean);
                    } else if (options && typeof options === 'object') {
                        options = Object.values(options).filter(Boolean);
                    } else {
                        options = ['Option 1', 'Option 2'];
                    }
                }
                const cleanOpts = Array.from(options)
                    .filter(opt => opt !== undefined && opt !== null)
                    .map(opt => typeof opt === 'object' && opt.text ? String(opt.text).trim() : String(opt).trim())
                    .filter(Boolean);
                const finalOptions = cleanOpts.length >= 2 ? cleanOpts : ['Option 1', 'Option 2'];
                const ca = parseInt(q.correctAnswer, 10);
                const finalCorrectAnswer = (!isNaN(ca) && ca >= 0 && ca < finalOptions.length) ? ca : 0;
                return {
                    text,
                    options: finalOptions,
                    correctAnswer: finalCorrectAnswer,
                    figure: q.figure || ''
                };
            });

        if (quizData.questions.length === 0) {
            hideLoading();
            alert('No valid questions found in this quiz. Please contact your instructor.');
            return;
        }

        const serverTime = await getServerTime();
        const quizExpiry = parseExpiryTimestamp(quizData.expiry);
        // Strict Check: active or expired?
        if (quizExpiry && serverTime > quizExpiry) {
            hideLoading();
            alert('This quiz has expired and is no longer accepting submissions.');
            return;
        }

        hideLoading();
        persistenceKey = `quiz_progress_${quizData.id}_${studentId}`;

        const countdownDuration = parseInt(quizData.instructionCountdown, 10);
        const safeCountdown = (!isNaN(countdownDuration) && countdownDuration > 0) ? countdownDuration : 5;

        showInstructionModal(safeCountdown, () => {
            try {
                quizData.student = {
                    firstName,
                    lastName,
                    section,
                    institutionalId: studentInstitutionalId,
                    isRetake: !!isRetake,
                    retakeReason: retakeReason || ''
                };
                quizData.secretKey = secretKey;

                // Persistence: Check for existing session (only if not retake)
                let savedState = (!isRetake) ? localStorage.getItem(persistenceKey) : null;

                if (savedState) {
                    try {
                        const state = JSON.parse(savedState);
                        const durationMs = (quizData.duration > 0) ? (quizData.duration * 60000) : 0;
                        const elapsedMs = Date.now() - (state.startTime || 0);

                        // Check if previous session expired while away
                        if (durationMs > 0 && elapsedMs >= durationMs) {
                            console.warn("Saved session has expired; starting fresh session.");
                            localStorage.removeItem(persistenceKey);
                            savedState = null;
                        } else {
                            // Restore shuffled order if it exists
                            if (state.questions && Array.isArray(state.questions) && state.questions.length > 0) {
                                quizData.questions = state.questions
                                    .filter(q => q && typeof q === 'object')
                                    .map((q, idx) => ({
                                        text: (q.text || `Question ${idx + 1}`).toString(),
                                        options: Array.isArray(q.options) ? q.options.filter(Boolean) : ['Option 1', 'Option 2'],
                                        correctAnswer: (typeof q.correctAnswer === 'number') ? q.correctAnswer : (quizData.questions[idx]?.correctAnswer || 0),
                                        figure: q.figure || ''
                                    }));
                            } else if (quizData.randomizeOrder !== false) {
                                shuffleQuiz(quizData);
                            }

                            // Validate basic integrity
                            if (state.answers && Array.isArray(state.answers) && state.answers.length === quizData.questions.length) {
                                console.log("Restoring active session...");
                                quizStartTime = state.startTime;
                                studentAnswers = state.answers;
                                flaggedQuestions = new Set(state.flagged || []);
                                focusLostCount = state.attempts || 0;
                                if (focusLostCount > 0) {
                                    isHandlingFocusLoss = true;
                                    setTimeout(() => isHandlingFocusLoss = false, 1000);
                                }
                            } else {
                                studentAnswers = new Array(quizData.questions.length).fill(null);
                                flaggedQuestions = new Set();
                                quizStartTime = Date.now();
                            }
                        }
                    } catch (e) {
                        console.error("Error restoring state", e);
                        savedState = null;
                    }
                }

                if (!savedState) {
                    // New session: Apply question pooling (sampleCount) with deterministic seed per student
                    if (quizData.sampleCount && quizData.sampleCount > 0 && quizData.sampleCount < quizData.questions.length) {
                        const seedStr = `${quizData.id}_${studentInstitutionalId}`;
                        let seed = 0;
                        for (let c = 0; c < seedStr.length; c++) {
                            seed = ((seed << 5) - seed) + seedStr.charCodeAt(c);
                            seed |= 0;
                        }
                        seed = Math.abs(seed);
                        const pseudoRandom = () => {
                            seed = (seed * 9301 + 49297) % 233280;
                            return (seed < 0 ? seed + 233280 : seed) / 233280;
                        };
                        for (let i = quizData.questions.length - 1; i > 0; i--) {
                            const r = pseudoRandom();
                            const j = Math.max(0, Math.min(i, Math.floor(r * (i + 1))));
                            [quizData.questions[i], quizData.questions[j]] = [quizData.questions[j], quizData.questions[i]];
                        }
                        quizData.questions = quizData.questions.slice(0, quizData.sampleCount);
                    }

                    // Shuffle question options & final order if randomizeOrder is enabled
                    if (quizData.randomizeOrder !== false) {
                        shuffleQuiz(quizData);
                    }

                    studentAnswers = new Array(quizData.questions.length).fill(null);
                    flaggedQuestions = new Set();
                    quizStartTime = Date.now();
                    saveProgress(); // Initial save to lock in the sample and shuffle order
                }

                if (studentSection) studentSection.classList.add('hidden');
                if (quizSection) quizSection.classList.remove('hidden');
                const titleEl = document.getElementById('quiz-title-display');
                if (titleEl) titleEl.textContent = quizData.title || 'Quiz';

                if (isRetake) {
                    showToast('Retake Session: A 10% deduction will be applied to your final score.', 'warning');
                }

                updateStudentPalette();
                displayQuestion(0);

                const quizExpiryTs = parseExpiryTimestamp(quizData.expiry);
                if (quizData.duration > 0 || quizExpiryTs) {
                    startQuizTimer(quizData.duration, quizExpiryTs, quizStartTime);
                }

                // Forensic Watermarking
                generateWatermark(firstName, lastName, section, studentInstitutionalId);
                document.body.classList.add('quiz-active');

                // Clear Clipboard
                clearClipboard();

                isQuizActive = true;
                window.addEventListener('blur', handleFocusLoss);
                document.addEventListener('visibilitychange', handleVisibilityChange);
                window.addEventListener('blur', togglePrivacyBlur);
                window.addEventListener('focus', togglePrivacyBlur);
                document.addEventListener('keyup', handlePrintScreen);

                // Enforce Fullscreen
                if (document.documentElement && document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen blocked:', e));
                }
                document.addEventListener('fullscreenchange', handleFullscreenChange);

                // Print Disruption
                window.onbeforeprint = () => {
                    if (isQuizActive) {
                        handleFocusLoss(); // Log as violation
                        return false;
                    }
                };

                startDevToolsDetection();
                startWatermarkRotation(firstName, lastName, section, studentInstitutionalId);

                // Show attempts widget
                if (attemptsWidget) {
                    attemptsWidget.classList.remove('hidden');
                    updateAttemptsDisplay();
                    if (focusLostCount > 0) expandWidget();
                }

                // Save Session Logic (Auto-Login Data)
                localStorage.setItem('quizable_active_session', JSON.stringify({
                    quizId, firstName, lastName,
                    studentInstitutionalId,
                    yearVal: yearVal || (document.getElementById('student-year')?.value || '1'),
                    sectionVal: sectionVal || (document.getElementById('student-section-select')?.value || 'A'),
                    section, secretKey,
                    timestamp: Date.now()
                }));
            } catch (err) {
                console.error("Error executing quiz after countdown:", err);
                alert("Failed to initialize quiz: " + err.message);
                if (studentSection) studentSection.classList.remove('hidden');
                if (quizSection) quizSection.classList.add('hidden');
            }
        });
    } catch (err) {
        hideLoading();
        alert('Failed to start quiz: ' + err.message);
    }
}

function updateStudentPalette() {
    if (!quizData || !quizData.questions) return;
    const grid = document.getElementById('student-palette-grid');
    if (!grid) return;

    let answered = 0;
    let flagged = 0;
    const total = quizData.questions.length;

    grid.innerHTML = '';
    for (let i = 0; i < total; i++) {
        const isAnswered = studentAnswers[i] !== null;
        const isFlag = flaggedQuestions.has(i);
        const isCurrent = (i === currentQuestionIndex);

        if (isAnswered) answered++;
        if (isFlag) flagged++;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `palette-item ${isAnswered ? 'answered' : 'unanswered'} ${isFlag ? 'flagged' : ''} ${isCurrent ? 'current' : ''}`;
        btn.title = `Question ${i + 1}: ${isAnswered ? 'Answered' : 'Unanswered'}${isFlag ? ' (Flagged)' : ''}`;
        btn.setAttribute('aria-label', `Question ${i + 1}`);

        btn.innerHTML = `<span>${i + 1}</span>${isFlag ? '<span class="palette-flag-icon">🚩</span>' : ''}`;

        btn.onclick = () => {
            displayQuestion(i);
        };
        grid.appendChild(btn);
    }

    const answeredEl = document.getElementById('palette-count-answered');
    const flaggedEl = document.getElementById('palette-count-flagged');
    const unansweredEl = document.getElementById('palette-count-unanswered');
    if (answeredEl) answeredEl.textContent = answered;
    if (flaggedEl) flaggedEl.textContent = flagged;
    if (unansweredEl) unansweredEl.textContent = Math.max(0, total - answered);
}

window.toggleFlagQuestion = function (index) {
    if (flaggedQuestions.has(index)) {
        flaggedQuestions.delete(index);
        showToast(`Unflagged Question ${index + 1}`, 'info');
    } else {
        flaggedQuestions.add(index);
        showToast(`Flagged Question ${index + 1} for review`, 'warning');
    }
    const flagBtn = document.getElementById(`flag-btn-${index}`);
    const isFlagged = flaggedQuestions.has(index);
    if (flagBtn) {
        flagBtn.className = `btn btn-sm ${isFlagged ? 'btn-flagged' : 'btn-outline'}`;
        flagBtn.innerHTML = `<span>${isFlagged ? '🚩 Flagged' : '🏳️ Flag for Review'}</span>`;
        flagBtn.title = isFlagged ? 'Remove flag' : 'Flag this question for review';
    }
    updateStudentPalette();
    saveProgress();
};

function displayQuestion(index) {
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) return;
    if (index < 0) index = 0;
    if (index >= quizData.questions.length) index = quizData.questions.length - 1;

    currentQuestionIndex = index;
    const q = quizData.questions[index];
    if (!q) return;

    if (!Array.isArray(q.options)) {
        if (typeof q.options === 'string') {
            q.options = q.options.split('|').map(o => o.trim()).filter(Boolean);
        } else {
            q.options = [];
        }
    }

    const isFlagged = flaggedQuestions ? flaggedQuestions.has(index) : false;
    const reviewEl = document.getElementById('quiz-review');
    if (reviewEl) reviewEl.classList.add('hidden');
    const container = document.getElementById('quiz-questions');
    if (container) container.classList.remove('hidden');

    const progressEl = document.getElementById('quiz-progress');
    if (progressEl && quizData.questions.length > 0) {
        progressEl.style.width = `${((index + 1) / quizData.questions.length) * 100}%`;
    }

    container.innerHTML = `
        <div class="quiz-question">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                <h3 style="margin:0;">Question ${index + 1} of ${quizData.questions.length}</h3>
                <button type="button" id="flag-btn-${index}" class="btn btn-sm ${isFlagged ? 'btn-flagged' : 'btn-outline'}" onclick="toggleFlagQuestion(${index})" title="${isFlagged ? 'Remove flag' : 'Flag this question for review'}">
                    <span>${isFlagged ? '🚩 Flagged' : '🏳️ Flag for Review'}</span>
                </button>
            </div>
            <p style="font-size:1.1rem; margin-bottom:15px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(q ? (q.text || '') : '')}</p>
            ${q.figure ? `<div class="quiz-figure" style="margin-bottom:20px;">${sanitizeFigure(q.figure)}</div>` : ''}
            <div class="quiz-options" role="radiogroup" aria-label="Question choices">
                ${q.options.map((opt, i) => `
                    <div class="quiz-option ${studentAnswers[index] === i ? 'selected' : ''}" 
                         data-index="${i}" 
                         role="radio" 
                         tabindex="0" 
                         aria-checked="${studentAnswers[index] === i ? 'true' : 'false'}" 
                         style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(opt)}</div>
                `).join('')}
            </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <button class="btn btn-outline" ${index === 0 ? 'disabled' : ''} id="prev-btn">Previous</button>
            <button class="btn btn-outline btn-sm" id="jump-review-btn" style="color:var(--info);" title="View all answers overview">Review Answers</button>
            ${index === quizData.questions.length - 1
            ? '<button class="btn btn-info" id="review-btn">Finish & Review</button>'
            : '<button class="btn btn-primary" id="next-btn">Next</button>'}
        </div>
    `;

    const selectOption = (el) => {
        container.querySelectorAll('.quiz-option').forEach(o => {
            o.classList.remove('selected');
            o.setAttribute('aria-checked', 'false');
        });
        el.classList.add('selected');
        el.setAttribute('aria-checked', 'true');
        studentAnswers[index] = parseInt(el.dataset.index);
        saveProgress();
        updateStudentPalette();
    };

    container.querySelectorAll('.quiz-option').forEach(el => {
        el.onclick = () => selectOption(el);
        el.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                selectOption(el);
            }
        };
    });

    const prev = document.getElementById('prev-btn');
    if (prev) prev.onclick = () => displayQuestion(index - 1);
    const next = document.getElementById('next-btn');
    if (next) next.onclick = () => displayQuestion(index + 1);
    const review = document.getElementById('review-btn');
    if (review) review.onclick = () => showReviewPage();
    const jumpReview = document.getElementById('jump-review-btn');
    if (jumpReview) jumpReview.onclick = () => showReviewPage();

    updateStudentPalette();
}

function showReviewPage() {
    document.getElementById('quiz-questions').classList.add('hidden');
    const review = document.getElementById('quiz-review');
    review.classList.remove('hidden');

    review.innerHTML = `
        <h2>Review Answers</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:15px; margin-bottom:30px;" role="navigation" aria-label="Question review list">
            ${quizData.questions.map((q, i) => {
                const isAnswered = studentAnswers[i] !== null;
                const isFlagged = flaggedQuestions.has(i);
                return `
                <div role="button" tabindex="0" onclick="displayQuestion(${i})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();displayQuestion(${i});}" style="padding:15px; border-radius:10px; cursor:pointer; border:1.5px solid ${isAnswered ? 'var(--success)' : 'var(--danger)'}; background:${isAnswered ? '#f0fdf4' : '#fef2f2'}; position:relative;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong>Q${i + 1}</strong>
                        ${isFlagged ? '<span style="font-size:0.75rem; background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-weight:700; border:1px solid #fde68a;">🚩 Flagged</span>' : ''}
                    </div>
                    <div style="margin-top:6px; font-size:0.85rem; font-weight:600; color:${isAnswered ? 'var(--success)' : 'var(--danger)'};">
                        ${isAnswered ? '✓ Answered' : '✗ Missing'}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
        <div style="display:flex; justify-content:space-between;">
            <button class="btn btn-outline" onclick="displayQuestion(${quizData.questions.length - 1})">Back</button>
            <button class="btn btn-success" id="submit-btn" style="padding:15px 40px;">Final Submit</button>
        </div>
    `;
    document.getElementById('submit-btn').onclick = () => submitQuiz();
    updateStudentPalette();
}

function startQuizTimer(mins, expiry, startTime) {
    if (timerInterval) clearInterval(timerInterval);
    timerDisplay.classList.remove('hidden');

    const durationMs = mins > 0 ? mins * 60000 : 0;
    const expiryTimestamp = parseExpiryTimestamp(expiry);

    let targetEndTime = 0;
    if (durationMs > 0 && expiryTimestamp) {
        targetEndTime = Math.min(startTime + durationMs, expiryTimestamp);
    } else if (durationMs > 0) {
        targetEndTime = startTime + durationMs;
    } else if (expiryTimestamp) {
        targetEndTime = expiryTimestamp;
    }

    if (targetEndTime <= 0) return;

    let isTimerSubmitting = false;

    const updateTimer = async () => {
        if (isTimerSubmitting || !isQuizActive) return;

        const now = Date.now();
        const diff = targetEndTime - now;

        if (diff <= 0) {
            isTimerSubmitting = true;
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            showConfirmationModal('Time is up!', 'The examination time has expired. Submitting your quiz now.', () => submitQuiz(true), true);
            return;
        }

        // Low Time Warning (Under 60 seconds)
        if (diff <= 60000) {
            timerDisplay.classList.add('timer-warning');
        } else {
            timerDisplay.classList.remove('timer-warning');
        }

        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerDisplay.textContent = `Time Left: ${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopQuizTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function startDevToolsDetection() {
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) return; // Prevent mobile GC pauses from false-triggering violations
    devToolsInterval = setInterval(() => {
        const start = performance.now();
        debugger;
        if (performance.now() - start > 220) handleFocusLoss();
    }, 3000);
}

function stopDevToolsDetection() { if (devToolsInterval) clearInterval(devToolsInterval); }

function handleFocusLoss() {
    if (isClearingClipboard) return;
    if (isQuizActive && !isHandlingFocusLoss) {
        if (Date.now() - quizStartTime < 3000) return; // 3-second grace period
        isHandlingFocusLoss = true;
        focusLostCount++;

        updateAttemptsDisplay();
        clearClipboard();

        // Update remaining attempts in modal warning
        const remainingEl = document.getElementById('remaining-attempts');
        if (remainingEl) remainingEl.textContent = Math.max(0, MAX_ATTEMPTS - focusLostCount);

        // Show Full Screen Warning
        if (tabWarning) tabWarning.classList.remove('hidden');

        // Show/Expand Widget
        if (focusLostCount < MAX_ATTEMPTS) {
            expandWidget();
        }

        if (focusLostCount >= MAX_ATTEMPTS) {
            if (tabWarning) tabWarning.classList.add('hidden');
            showToast('Security violation threshold reached. Finalizing submission...', 'warning');
            submitQuiz(true);
        }

        setTimeout(() => isHandlingFocusLoss = false, 1500);
    }
}

function expandWidget() {
    if (!attemptsWidget) return;

    // Set message
    attemptsText.textContent = `${focusLostCount} attempts to cheat, you will get disqualified on ${MAX_ATTEMPTS}`;

    attemptsWidget.classList.add('expanded');

    // Clear existing timeout
    if (widgetTimeout) clearTimeout(widgetTimeout);

    // Auto collapse after 5 seconds
    widgetTimeout = setTimeout(() => {
        attemptsWidget.classList.remove('expanded');
    }, 5000);
}

function handleFullscreenChange() {
    if (isQuizActive && document.fullscreenElement !== undefined && !document.fullscreenElement) {
        // User exited fullscreen
        if (Date.now() - quizStartTime < 1000) return; // Grace period

        isHandlingFocusLoss = true;
        focusLostCount++;
        updateAttemptsDisplay();

        // Show Full Screen Warning
        if (tabWarning) tabWarning.classList.remove('hidden');
        expandWidget();

        if (focusLostCount < MAX_ATTEMPTS) {
            attemptsText.textContent = "Fullscreen Exited! Return immediately. " + attemptsText.textContent;
            attemptsWidget.classList.add('expanded');
        } else {
            if (tabWarning) tabWarning.classList.add('hidden');
            alert('Attempts exceeded (Fullscreen Exit). Finalizing submission...');
            submitQuiz(true);
        }
        setTimeout(() => isHandlingFocusLoss = false, 100);
    }
}

function returnToQuiz() { tabWarning.classList.add('hidden'); }
function updateAttemptsDisplay() {
    if (attemptsNumber) attemptsNumber.textContent = focusLostCount;
    // Old counter fallback
    if (attemptsCount) attemptsCount.textContent = focusLostCount;
    if (remainingAttempts) remainingAttempts.textContent = MAX_ATTEMPTS - focusLostCount;
    saveProgress();
}

function saveProgress() {
    if (!persistenceKey || !quizData || !Array.isArray(quizData.questions)) return;
    // Strip correctAnswer from questions before caching in localStorage
    const sanitizedQuestions = quizData.questions
        .filter(q => q && typeof q === 'object')
        .map(q => ({
            text: (q && q.text) ? q.text : '',
            options: (q && Array.isArray(q.options)) ? q.options.filter(o => o !== undefined && o !== null) : [],
            figure: (q && q.figure) ? q.figure : ''
        }));
    const state = {
        startTime: quizStartTime,
        answers: studentAnswers,
        attempts: focusLostCount,
        flagged: Array.from(flaggedQuestions || []),
        questions: sanitizedQuestions // Safe structure without answer keys
    };
    try {
        localStorage.setItem(persistenceKey, JSON.stringify(state));
    } catch (e) {
        console.warn("Failed to cache quiz state:", e);
    }
}

// function startQuizTimer(mins, expiry) { // Old signature
function showConfirmationModal(title, msg, onConfirm, isAlert = false) {
    const titleEl = document.getElementById('modal-title') || modalTitle;
    const msgEl = document.getElementById('modal-message') || modalMessage;
    const confirmBtn = document.getElementById('modal-confirm-btn') || modalConfirmBtn;
    const cancelBtn = document.getElementById('modal-cancel-btn') || modalCancelBtn;
    const modal = document.getElementById('confirmation-modal') || confirmationModal;

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;

    if (confirmBtn) {
        confirmBtn.innerText = isAlert ? "OK" : "Confirm";
        confirmBtn.onclick = () => {
            if (modal) modal.classList.add('hidden');
            if (onConfirm) onConfirm();
        };
    }

    if (cancelBtn) {
        cancelBtn.classList.toggle('hidden', isAlert);
        cancelBtn.onclick = () => {
            if (modal) modal.classList.add('hidden');
        };
    }

    if (modal) modal.classList.remove('hidden');
}

function submitQuiz(auto = false) {
    if (!quizData) return;
    const exec = () => {
        let score = 0;
        const detail = (quizData.questions || []).map((q, i) => {
            if (!q) return null;
            const correct = studentAnswers[i] === q.correctAnswer;
            if (correct) score++;
            return {
                questionText: q.text || '',
                studentAnswerText: (studentAnswers[i] !== null && Array.isArray(q.options)) ? (q.options[studentAnswers[i]] || 'N/A') : 'N/A',
                correctAnswerText: Array.isArray(q.options) ? (q.options[q.correctAnswer] || 'N/A') : 'N/A',
                isCorrect: correct
            };
        }).filter(Boolean);

        const rawScore = score;
        const totalQuestions = quizData.questions.length;
        const rawPercentage = (rawScore / totalQuestions) * 100;
        const isRetake = !!quizData.student?.isRetake;
        const penaltyPercent = isRetake ? 10 : 0;

        // Final percentage deducted by 10% if retake
        const finalPercentage = Math.max(0, parseFloat((rawPercentage - penaltyPercent).toFixed(1)));
        // Final score (points) corresponding to final percentage
        const finalScore = parseFloat(((finalPercentage / 100) * totalQuestions).toFixed(2));

        const res = {
            student: quizData.student,
            quizTitle: quizData.title,
            subject: quizData.subject,
            score: finalScore,
            rawScore: rawScore,
            totalQuestions: totalQuestions,
            rawPercentage: parseFloat(rawPercentage.toFixed(1)),
            finalPercentage: finalPercentage,
            penaltyPercent: penaltyPercent,
            detailedAnswers: detail,
            quizId: quizData.id,
            securityViolations: focusLostCount, // Track tab switches
            isRetake: isRetake,
            retakeReason: quizData.student?.retakeReason || '',
            submittedAt: Date.now(),
            timeTakenMs: Date.now() - quizStartTime
        };
        window.studentResultsDataForPdf = res;

        const showScore = quizData.showResultsToStudent;
        const showAnswerSummary = quizData.showAnswerSummary !== false;

        if (showScore || showAnswerSummary) {
            document.getElementById('submission-success-message').classList.add('hidden');
            const summary = document.getElementById('student-score-summary');

            // Rich Feedback Calculation based on final percentage
            let gradeLabel = 'Participant';
            let gradeColor = 'var(--text-muted)';

            if (finalPercentage >= 90) { gradeLabel = 'Excellent!'; gradeColor = 'var(--success)'; }
            else if (finalPercentage >= 75) { gradeLabel = 'Good Job!'; gradeColor = 'var(--primary)'; }
            else if (finalPercentage >= 50) { gradeLabel = 'Fair'; gradeColor = 'var(--warning)'; }
            else { gradeLabel = 'Needs Improvement'; gradeColor = 'var(--danger)'; }

            let penaltyNotice = '';
            if (isRetake) {
                penaltyNotice = `
                    <div style="margin-top:12px; padding:8px 14px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; font-size:0.85rem; color:#991b1b; display:inline-block; line-height:1.4;">
                        ⚠️ <strong>10% Retake Penalty Applied:</strong> Raw Score: ${rawScore}/${totalQuestions} (${parseFloat(rawPercentage.toFixed(1))}%) &rarr; Final: ${finalScore}/${totalQuestions} (${finalPercentage}%)
                    </div>
                `;
            }

            const scoreHtml = showScore ? `
                <div style="text-align:center; padding:30px; background:var(--bg-body); border-radius:15px; margin-bottom:20px;">
                    <div style="font-size:3rem; font-weight:800; color:var(--primary);">${finalScore} / ${totalQuestions}</div>
                    <div style="font-size:1.5rem; font-weight:700; color:${gradeColor}; margin-top:5px;">${gradeLabel} (${finalPercentage}%)</div>
                    ${penaltyNotice}
                    <div style="color:var(--text-muted); margin-top:5px;">Final Result</div>
                </div>
            ` : '';

            const answerHtml = showAnswerSummary ? detail.map((a, i) => `
                <div class="quiz-question" style="border-left:5px solid ${a.isCorrect ? 'var(--success)' : 'var(--danger)'};">
                    <strong>Q${i + 1}</strong>: <span style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(a.questionText)}</span><br>
                    Your Answer: <span style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(a.studentAnswerText)}</span>
                    ${!a.isCorrect ? `<br><span style="color:var(--success); font-weight:600;">Correct Answer:</span> <span style="white-space: pre-wrap; word-break: break-word; color:var(--success);">${escapeHtml(a.correctAnswerText)}</span>` : ''}
                </div>
            `).join('') : '';

            summary.innerHTML = scoreHtml + answerHtml;
            summary.classList.remove('hidden');
        } else {
            document.getElementById('student-score-summary').classList.add('hidden');
            document.getElementById('submission-success-message').classList.remove('hidden');
        }

        const studentPdfBtn = document.getElementById('download-student-pdf-btn');
        if (studentPdfBtn) studentPdfBtn.classList.add('hidden');

        quizSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        flaggedQuestions.clear();
        try { localStorage.setItem(quizData.id, JSON.stringify({ timestamp: Date.now() })); } catch { }

        if (quizData.saveResultsToCloud !== false) {
            showLoading();
            encryptData(JSON.stringify(res), quizData.secretKey).then(enc => {
                const instId = (quizData.student?.institutionalId || '').replace(/[^a-zA-Z0-9_-]/g, '');
                const namePart = `${quizData.student?.lastName || ''}_${quizData.student?.firstName || ''}`.replace(/[^a-zA-Z0-9_]/g, '');
                const id = (instId ? `${instId}_${namePart}` : namePart).replace(/^[_-]+|[_-]+$/g, '') || `student_${Date.now()}`;
                
                // Keep emergency local backup until confirmation
                localStorage.setItem(`backup_submission_${quizData.id}`, JSON.stringify(res));

                const retryBtn = document.getElementById('retry-cloud-submission-btn');
                const saveToCloud = () => {
                    showLoading();
                    database.ref(`results/${quizData.id}/${id}`).set(enc).then(() => {
                        hideLoading();
                        showToast('Exam successfully submitted to the cloud!', 'success');
                        if (retryBtn) retryBtn.classList.add('hidden');
                        // Clear persistence & session ONLY after confirmed write
                        if (persistenceKey) localStorage.removeItem(persistenceKey);
                        localStorage.removeItem('quizable_active_session');
                        localStorage.removeItem(`backup_submission_${quizData.id}`);
                    }).catch(err => {
                        hideLoading();
                        console.error('Submission error:', err);
                        alert(`Network error saving to cloud: ${err.message}. Your answers are preserved in local storage. Click "Retry Cloud Submission" once connected or "Download Results (PDF)"!`);
                        if (retryBtn) {
                            retryBtn.classList.remove('hidden');
                            retryBtn.onclick = saveToCloud;
                        }
                        const pdfBtn = document.getElementById('download-student-pdf-btn');
                        if (pdfBtn) pdfBtn.classList.remove('hidden');
                    });
                };
                saveToCloud();
            }).catch(err => {
                hideLoading();
                console.error('Encryption error:', err);
            });
        } else {
            // Offline/local only quiz
            if (persistenceKey) localStorage.removeItem(persistenceKey);
            localStorage.removeItem('quizable_active_session');
        }

        // Celebration!
        if (window.confetti) {
            const duration = 3000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

            const randomInRange = (min, max) => Math.random() * (max - min) + min;

            const interval = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);
                // since particles fall down, start a bit higher than random
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
            }, 250);
        }
    };

    if (auto) exec();
    else {
        const missing = studentAnswers.filter(a => a === null).length;
        if (missing > 0) {
            showConfirmationModal(
                'Unanswered Questions',
                `You still have ${missing} unanswered question${missing > 1 ? 's' : ''}.\n\nAre you sure you want to finish and submit your quiz now?`,
                exec,
                false
            );
        } else {
            showConfirmationModal('Submit Quiz?', 'Are you sure you want to submit your answers?', exec);
        }
    }
}

function downloadStudentResultsAsPdf() {
    const res = window.studentResultsDataForPdf;
    if (!res) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header & Branding
    doc.setFontSize(24);
    doc.setTextColor(16, 185, 129); // var(--primary)
    doc.text('Performance Report', 14, 22);

    doc.setFontSize(14);
    doc.setTextColor(6, 78, 59); // var(--text-main)
    doc.text(res.quizTitle, 14, 32);

    // Student Info Card-like section
    doc.setDrawColor(209, 250, 229); // var(--border)
    doc.setFillColor(240, 253, 244); // Light emerald
    doc.roundedRect(14, 40, 182, 35, 3, 3, 'FD');

    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139); // var(--text-muted)
    doc.text('STUDENT INFORMATION', 18, 47);

    doc.setFontSize(13);
    doc.setTextColor(6, 78, 59);
    doc.text(`${res.student.lastName}, ${res.student.firstName}`, 18, 55);
    const durationStr = res.timeTakenMs ? (res.timeTakenMs / 60000).toFixed(1) + 'm' : 'N/A';
    doc.text(`ID: ${res.student.institutionalId || 'N/A'} | Section: ${res.student.section} | Duration: ${durationStr}`, 18, 62);
    doc.text(`Submitted: ${res.submittedAt ? new Date(res.submittedAt).toLocaleString() : 'N/A'}`, 18, 69);

    // Score Circle/Badge representation
    const percentage = ((res.score / res.totalQuestions) * 100).toFixed(1);
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('FINAL SCORE', 150, 47);

    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129);
    doc.text(`${res.score}/${res.totalQuestions}`, 150, 58);

    doc.setFontSize(12);
    doc.text(`${percentage}%`, 150, 68);

    // Detailed Table
    doc.autoTable({
        head: [['#', 'Question', 'Your Answer', 'Status']],
        body: res.detailedAnswers.map((a, i) => [
            i + 1,
            a.questionText,
            a.studentAnswerText,
            a.isCorrect ? 'Correct ✓' : 'Incorrect ✗'
        ]),
        startY: 85,
        headStyles: { fillColor: [16, 185, 129] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 85 }
    });

    // Footer
    const finalY = doc.lastAutoTable.finalY || 85;
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text('Generatd by Quizable - Secure Modern Quiz Platform', 14, finalY + 15);

    doc.save(`${res.student.firstName}_${res.student.lastName}_Results.pdf`);
}

function restartQuiz() {
    location.reload(); // Simple restart
}

// Initialization
window.onload = function () {
    initializeApp();
    const downloadPdfBtn = document.getElementById('download-student-pdf-btn');
    if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', downloadStudentResultsAsPdf);

    // Admin Search
    const adminSearchInput = document.getElementById('admin-search-input');
    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', debounce(filterAdminQuizzes, 300));
    }
};

// Global Exposure for Inline HTML Handlers
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthTab = switchAuthTab;
window.handleAuthLogin = handleAuthLogin;
window.handleAuthRegister = handleAuthRegister;
window.handleAuthReset = handleAuthReset;
window.handleTeacherLogout = handleTeacherLogout;
window.showStudentPortal = showStudentPortal;
window.showTeacherMenu = showTeacherMenu;
window.showCreateQuiz = showCreateQuiz;
window.showViewResults = showViewResults;
window.adminLogout = adminLogout;
window.exportAugust2026Excel = exportAugust2026Excel;
window.exportCurrentTeacherQuizExcel = exportCurrentTeacherQuizExcel;
window.exportAdminQuizResultsExcel = exportAdminQuizResultsExcel;

// --- CRYPTO HELPERS ---
const keyCache = new Map();

function uint8ToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function base64ToUint8(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function getKey(password, salt) {
    let saltHex = '';
    for (let i = 0; i < salt.length; i++) {
        saltHex += salt[i].toString(16).padStart(2, '0');
    }
    const cacheKey = `${password}:${saltHex}`;
    if (keyCache.has(cacheKey)) {
        return keyCache.get(cacheKey);
    }

    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    const derivedKey = await window.crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    if (keyCache.size > 200) {
        const iter = keyCache.keys();
        for (let i = 0; i < 50; i++) {
            keyCache.delete(iter.next().value);
        }
    }
    keyCache.set(cacheKey, derivedKey);
    return derivedKey;
}

async function encryptData(data, password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await getKey(password, salt);
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(data));
    const encArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(salt.length + iv.length + encArray.length);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(encArray, salt.length + iv.length);
    return uint8ToBase64(combined);
}

async function decryptData(str, password) {
    const arr = base64ToUint8(str);
    const salt = arr.slice(0, 16);
    const iv = arr.slice(16, 28);
    const data = arr.slice(28);
    const key = await getKey(password, salt);
    const dec = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
}

// System Encryption (Derived using shared system vault with multi-tier backward compatibility)
const SYSTEM_VAULT_KEY = "quizable_system_vault_v3";

function getSystemKey() {
    return SYSTEM_VAULT_KEY;
}

async function systemEncrypt(data) {
    return encryptData(data, SYSTEM_VAULT_KEY);
}

async function systemDecrypt(data, creatorUid = null) {
    const candidates = [
        SYSTEM_VAULT_KEY,
        creatorUid ? `quizable_auth_${creatorUid}` : null,
        auth.currentUser ? `quizable_auth_${auth.currentUser.uid}` : null,
        "quizable_session_shield_v2",
        "quizable_internal_v1_secure_node"
    ].filter(Boolean);

    for (const key of candidates) {
        try {
            return await decryptData(data, key);
        } catch (_) {
            // try next candidate
        }
    }
    throw new Error("Unable to decrypt system metadata with available keys.");
}

// --- Dynamic Watermark Utility ---
let watermarkInterval = null;
function startWatermarkRotation(f, l, s, id) {
    // Rotation logic: Updates the watermark slightly every 30 seconds
    // to prevent students from using old screenshots as "proof" of progress.
    watermarkInterval = setInterval(() => {
        if (isQuizActive) {
            generateWatermark(f, l, s, id);
        }
    }, 30000);
}

function stopWatermarkRotation() {
    if (watermarkInterval) clearInterval(watermarkInterval);
}

// --- LINK SHARING HELPERS ---

function generateQuizLink(id, key, isTeacher = false) {
    const payload = JSON.stringify({ i: id, k: key });
    // Simple obfuscation: Base64
    const encoded = btoa(payload);
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('q', encoded);
    if (isTeacher) url.searchParams.set('part', 'teacher');

    return url.toString();
}

function showQuizCreatedModal(studentLink, teacherLink) {
    const modal = document.getElementById('quiz-created-modal');
    if (!modal) {
        alert("Quiz Created!\n\nStudent Link: " + studentLink + "\nTeacher Link: " + teacherLink);
        return;
    }

    // Student Link Setup
    const studentLinkEl = document.getElementById('quiz-share-link');
    const studentCopyBtn = document.getElementById('copy-link-btn');
    studentLinkEl.href = studentLink;
    studentLinkEl.textContent = studentLink;
    studentCopyBtn.textContent = 'Copy Student Link';

    // Teacher Link Setup
    const teacherLinkEl = document.getElementById('teacher-share-link');
    const teacherCopyBtn = document.getElementById('copy-teacher-link-btn');
    teacherLinkEl.href = teacherLink;
    teacherLinkEl.textContent = teacherLink;
    teacherCopyBtn.textContent = 'Copy Teacher Link';

    modal.classList.remove('hidden');

    // Setup Copy Handlers
    const setupCopy = (btn, text, label) => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.onclick = () => {
            navigator.clipboard.writeText(text).then(() => {
                showToast(`${label} copied!`, 'success');
                newBtn.textContent = 'Copied!';
                setTimeout(() => newBtn.textContent = `Copy ${label}`, 2000);
            }).catch(err => {
                console.error('Copy failed', err);
                prompt(`Copy ${label}:`, text);
            });
        };
    };

    setupCopy(studentCopyBtn, studentLink, 'Student Link');
    setupCopy(teacherCopyBtn, teacherLink, 'Teacher Link');
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
