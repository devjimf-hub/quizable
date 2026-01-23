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

// Global variables
let quizData = null;
let currentQuestionIndex = 0;
let studentAnswers = [];
let focusLostCount = 0;
let isQuizActive = false;
let isHandlingFocusLoss = false; // Flag to prevent double counting
const MAX_ATTEMPTS = 3;
let timerInterval = null;
let devToolsInterval = null; // For DevTools detection
let allStudentResults = []; // To store all results for a quiz
let processedStudentResults = []; // To store results for PDF export
let quizStartTime = 0;

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

// Initialize based on URL parameters
function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    tabWarning.classList.add('hidden');
    // attemptsCounter.classList.add('hidden'); // Removed old element logic if needed, but keeping for safety
    if (attemptsWidget) attemptsWidget.classList.add('hidden');
    timerDisplay.classList.add('hidden');
    confirmationModal.classList.add('hidden');
    instructionModal.classList.add('hidden');
    document.getElementById('export-pdf-btn').classList.add('hidden');

    const part = urlParams.get('part');

    if (part === 'teacher') {
        showTeacherMenu();
    } else {
        teacherMenu.classList.add('hidden');
        teacherCreateSection.classList.add('hidden');
        teacherResultsSection.classList.add('hidden');
        studentSection.classList.remove('hidden');

        // Auto-Login Check
        checkAutoLogin();
    }
}

function checkAutoLogin() {
    const activeSession = localStorage.getItem('quizable_active_session');
    if (activeSession) {
        try {
            const session = JSON.parse(activeSession);
            // Check if session is recent (e.g., less than 4 hours)
            if (Date.now() - session.timestamp < 14400000) {
                console.log("Found active session, auto-logging in...");

                // Populate fields
                document.getElementById('student-quiz-id').value = session.quizId;
                document.getElementById('student-first-name').value = session.firstName;
                document.getElementById('student-last-name').value = session.lastName;
                document.getElementById('student-year').value = session.yearVal || '1'; // Default backup
                document.getElementById('student-section-select').value = session.sectionVal || 'A';
                document.getElementById('student-secret-key').value = session.secretKey;

                // Trigger Start
                startQuiz();
            }
        } catch (e) {
            console.error("Auto-login failed:", e);
        }
    }
}

function showTeacherMenu() {
    teacherMenu.classList.remove('hidden');
    teacherCreateSection.classList.add('hidden');
    teacherResultsSection.classList.add('hidden');
    studentSection.classList.add('hidden');
    quizSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    document.getElementById('quiz-navigator').classList.add('hidden');
}

function showCreateQuiz() {
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
    teacherMenu.classList.add('hidden');
    teacherResultsSection.classList.remove('hidden');
    loadTeacherHistory();
}

// Attach Auto-Save to Main Inputs
['quiz-title', 'quiz-subject', 'quiz-duration', 'quiz-expiry', 'secret-key', 'show-results-to-student', 'save-results-to-cloud', 'randomize-order'].forEach(id => {
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
    // Keep last 5
    if (newHistory.length > 5) newHistory.pop();
    localStorage.setItem('quizable_teacher_history', JSON.stringify(newHistory));
}

function loadTeacherHistory() {
    const history = JSON.parse(localStorage.getItem('quizable_teacher_history') || '[]');
    const container = document.getElementById('recent-quizzes-container');
    const list = document.getElementById('recent-quizzes-list');

    if (history.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    list.innerHTML = history.map(h => `
        <div class="card" style="padding:15px; margin-bottom:0; display:flex; justify-content:space-between; align-items:center;">
            <div onclick="fillCredentials('${h.id}', '${h.key}')" style="cursor:pointer; flex-grow:1;">
                <div style="font-weight:600;">${h.title}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(h.timestamp).toLocaleDateString()}</div>
            </div>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-outline" style="padding:5px; border-radius:6px;" onclick="copyToClipboard('${h.id}', 'Quiz ID copied!')" title="Copy ID">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                </button>
                <button class="btn btn-outline" style="padding:5px; border-radius:6px; color:var(--danger);" onclick="deleteFromHistory('${h.id}')" title="Delete from history">
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
    const threshold = 160;

    // Method 1: Debugger delay
    const start = performance.now();
    debugger;
    if (performance.now() - start > threshold) return true;

    // Method 2: Window size difference (detects docked DevTools)
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;

    return widthDiff || heightDiff;
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
            <textarea class="question-text" placeholder="What is the result of...?" rows="3">${text}</textarea>
        </div>
        
        <details class="form-group figure-collapsible" ${figure ? 'open' : ''}>
            <summary class="figure-summary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                Add Figure / Illustration (HTML/SVG)
            </summary>
            <div class="figure-editor-layout">
                <div class="figure-input-wrapper">
                    <textarea class="question-figure" placeholder="e.g. <svg>...</svg> or <b>Code Snippet</b>" rows="3">${figure}</textarea>
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
        figurePreview.innerHTML = val || '<small style="color:var(--text-muted)">Figure Preview</small>';
    };

    // Initial load
    if (figure) refreshEditorFigure();

    // Auto-save and live preview logic
    questionDiv.addEventListener('input', (e) => {
        if (e.target.classList.contains('question-figure')) refreshEditorFigure();
        if (previewContainer.classList.contains('active')) updateLivePreview(questionDiv);
        saveDraft();
    });

    updateQuestionNumbers();
}

function addOptionInput(container, value = '', isCorrect = false) {
    const index = container.children.length;
    const div = document.createElement('div');
    div.className = 'option-input-group';
    div.innerHTML = `
        <span class="option-index-badge ${isCorrect ? 'correct' : ''}" title="Set as correct answer">${index}</span>
        <input type="text" class="option-val" placeholder="Possible answer..." value="${value}">
        <span class="remove-option-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </span>
    `;
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

    // Save draft on every keystroke
    div.querySelector('.option-val').addEventListener('input', saveDraft);
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
        <p style="font-size:1.1rem; margin-bottom:15px;">${text || '<i style="color:var(--text-muted)">No question text...</i>'}</p>
        ${figure ? `<div class="quiz-figure" style="margin-bottom:20px;">${figure}</div>` : ''}
        <div class="quiz-options">
            ${options.map((opt, i) => `
                <div class="quiz-option" style="cursor:default;">${opt || '<i style="color:var(--text-muted)">Empty option...</i>'}</div>
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

function clearClipboard() {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(' ').catch(() => { });
        }
    } catch (e) { }
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
    const quizTitle = document.getElementById('quiz-title').value;
    const quizSubject = document.getElementById('quiz-subject').value;
    const quizDuration = parseFloat(document.getElementById('quiz-duration').value) || 0;
    const quizExpiry = document.getElementById('quiz-expiry').value;
    const instructionCountdownDuration = parseInt(document.getElementById('instruction-countdown-duration').value) || 30;
    const showResultsToStudent = document.getElementById('show-results-to-student').checked;
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
        expiry: quizExpiry ? new Date(quizExpiry).getTime() : null,
        instructionCountdown: instructionCountdownDuration,
        showResultsToStudent, saveResultsToCloud, randomizeOrder,
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
    encryptData(JSON.stringify(quiz), secretKey).then(encrypted => {
        database.ref('quizzes/' + quiz.id).set({ encryptedQuizData: encrypted }).then(() => {
            hideLoading();
            const credentials = `Quiz Title: ${quizTitle}\nQuiz ID: ${quiz.id}\nSecret Key: ${secretKey}`;
            saveTeacherHistory(quizTitle, quiz.id, secretKey); // Save to history
            const blob = new Blob([credentials], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quiz_credentials_${quizTitle.replace(/\s+/g, '_')}.txt`;
            a.click();
            resetQuizForm();
            showConfirmationModal('Quiz Saved!', 'Quiz ID and Secret Key file downloaded.', null);
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
    const draft = {
        title: document.getElementById('quiz-title').value,
        subject: document.getElementById('quiz-subject').value,
        duration: document.getElementById('quiz-duration').value,
        expiry: document.getElementById('quiz-expiry').value,
        secretKey: document.getElementById('secret-key').value,
        showResults: document.getElementById('show-results-to-student').checked,
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
        document.getElementById('secret-key').value = draft.secretKey || '';
        document.getElementById('show-results-to-student').checked = draft.showResults !== false;
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
            document.getElementById('modify-show-results').checked = quizDetails.showResultsToStudent !== false;

            if (quizDetails.expiry) {
                const date = new Date(quizDetails.expiry);
                const offset = date.getTimezoneOffset() * 60000;
                const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
                modifyExpiryInput.value = localISOTime;
            } else {
                modifyExpiryInput.value = '';
            }

            document.getElementById('update-quiz-settings-btn').onclick = () => {
                const newDuration = parseFloat(document.getElementById('modify-quiz-duration').value) || 0;
                const newExpiryStr = modifyExpiryInput.value;
                const showResults = document.getElementById('modify-show-results').checked;
                updateQuizSettings(quizId, secretKey, { duration: newDuration, expiry: newExpiryStr, showResultsToStudent: showResults }, quizDetails);
            };
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

        const promises = Object.values(encryptedResults).map(data =>
            decryptData(data, secretKey).then(JSON.parse).catch(() => null)
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
                    <div class="student-result-card" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                        <div>
                            <div style="font-weight:600;">${res.student.lastName}, ${res.student.firstName}</div>
                            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                                ID: ${res.student.institutionalId || 'N/A'} | Section: ${res.student.section}
                            </div>
                            ${res.securityViolations > 0 ? `<div style="font-size:0.7rem; color:var(--danger); font-weight:700; margin-top:4px;">⚠️ ${res.securityViolations} Security Violations</div>` : ''}
                        </div>
                        <div style="text-align:right;">
                            <div style="color:var(--primary); font-weight:800; font-size:1.2rem;">${res.score}/${res.totalQuestions}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted);">${res.timeTakenMs ? (res.timeTakenMs / 60000).toFixed(1) + 'm' : 'N/A'} | ${submissionDate}</div>
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
    if (!confirm('Are you sure you want to update the quiz settings?')) return;

    showLoading();
    try {
        // Update the fields in the quiz object
        if (newSettings.hasOwnProperty('duration')) currentQuizData.duration = newSettings.duration;
        if (newSettings.hasOwnProperty('expiry')) {
            currentQuizData.expiry = newSettings.expiry ? new Date(newSettings.expiry).getTime() : null;
        }
        if (newSettings.hasOwnProperty('showResultsToStudent')) {
            currentQuizData.showResultsToStudent = newSettings.showResultsToStudent;
        }

        // Re-encrypt the entire quiz data
        const encrypted = await encryptData(JSON.stringify(currentQuizData), secretKey);

        // Save back to Firebase
        await database.ref('quizzes/' + quizId).update({
            encryptedQuizData: encrypted
        });

        hideLoading();
        showConfirmationModal('Success!', 'Quiz settings have been updated.', null, true);
    } catch (error) {
        hideLoading();
        alert('Failed to update quiz settings: ' + error.message);
    }
}

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

    doc.save(`${res0.quizTitle}_Full_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}

function shuffleQuiz(quiz) {
    for (let i = quiz.questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [quiz.questions[i], quiz.questions[j]] = [quiz.questions[j], quiz.questions[i]];
    }
    quiz.questions.forEach(q => {
        const correctText = q.options[q.correctAnswer];
        for (let i = q.options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
        }
        q.correctAnswer = q.options.indexOf(correctText);
    });
}

function showInstructionModal(duration, onComplete) {
    instructionModal.classList.remove('hidden');
    let count = duration;
    instructionCountdown.textContent = count;
    const timer = setInterval(() => {
        count--;
        instructionCountdown.textContent = count;
        if (count <= 0) {
            clearInterval(timer);
            instructionModal.classList.add('hidden');
            if (onComplete) onComplete();
        }
    }, 1000);
}

async function getServerTime() {
    try {
        const offsetSnap = await database.ref(".info/serverTimeOffset").once("value");
        return Date.now() + (offsetSnap.val() || 0);
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
        alert('Screenshots not allowed.');
    }
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
    if (!quizId || !firstName || !lastName || !section || !secretKey || !studentInstitutionalId) { alert('Fill all fields.'); return; }

    const studentId = `${lastName}_${firstName}`.replace(/[^a-zA-Z0-9_]/g, '');

    showLoading();
    try {
        const snap = await database.ref(`results/${quizId}/${studentId}`).once('value');
        if (snap.exists()) {
            hideLoading();
            alert('Already submitted.');
            return;
        }

        const quizSnap = await database.ref('quizzes/' + quizId).once('value');
        const data = quizSnap.val();
        if (!data) {
            hideLoading();
            alert('Quiz not found.');
            return;
        }

        const decrypted = await decryptData(data.encryptedQuizData, secretKey);
        quizData = JSON.parse(decrypted);

        const serverTime = await getServerTime();
        // Strict Check: active or expired?
        if (quizData.expiry && serverTime > quizData.expiry) {
            hideLoading();
            alert('This quiz has expired and is no longer accepting submissions.');
            return;
        }

        const record = localStorage.getItem(quizData.id);
        if (record && (Date.now() - JSON.parse(record).timestamp < 10800000)) {
            hideLoading();
            alert('Already submitted (local record).');
            return;
        }

        hideLoading();
        showInstructionModal(quizData.instructionCountdown, () => {
            if (quizData.randomizeOrder !== false) shuffleQuiz(quizData);
            quizData.student = { firstName, lastName, section, institutionalId: studentInstitutionalId };
            quizData.secretKey = secretKey;

            // Persistence: Check for existing session
            persistenceKey = `quiz_progress_${quizData.id}_${studentId}`;
            const savedState = localStorage.getItem(persistenceKey);

            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    // Validate basic integrity
                    if (state.answers && state.answers.length === quizData.questions.length) {
                        console.log("Restoring session...");
                        quizStartTime = state.startTime;
                        studentAnswers = state.answers;
                        focusLostCount = state.attempts || 0;
                        // If we restore attempts, update display immediately
                        if (focusLostCount > 0) {
                            isHandlingFocusLoss = true; // prevent double trigger on load
                            setTimeout(() => isHandlingFocusLoss = false, 1000);
                        }
                    } else {
                        // Invalid state, start fresh
                        studentAnswers = new Array(quizData.questions.length).fill(null);
                        quizStartTime = Date.now();
                    }
                } catch (e) {
                    console.error("Error restoring state", e);
                    studentAnswers = new Array(quizData.questions.length).fill(null);
                    quizStartTime = Date.now();
                }
            } else {
                studentAnswers = new Array(quizData.questions.length).fill(null);
                quizStartTime = Date.now();
            }

            studentSection.classList.add('hidden');
            quizSection.classList.remove('hidden');
            document.getElementById('quiz-title-display').textContent = quizData.title;
            displayQuestion(0);

            // If restoring, we might need to adjust the timer duration passed
            // The timer function uses "end = Date.now() + duration", but we want "end = startTime + duration"
            // So we need to handle this in startQuizTimer or pass the calculated end time.
            // Let's modify startQuizTimer to accept an absolute End Time optionally or handle it via logic.
            // Actually, easier: pass persistence-aware arguments.

            if (quizData.duration > 0 || quizData.expiry) {
                startQuizTimer(quizData.duration, quizData.expiry, quizStartTime); // Changed signature
            }

            // quizStartTime = Date.now(); // REMOVED: Managed above
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
            document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen blocked:', e));
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

            // Show new widget
            if (attemptsWidget) {
                attemptsWidget.classList.remove('hidden');
                updateAttemptsDisplay();
                // If we restored attempts, maybe show the widget?
                if (focusLostCount > 0) expandWidget();
            }

            // Save Session Logic (Auto-Login Data)
            localStorage.setItem('quizable_active_session', JSON.stringify({
                quizId, firstName, lastName,
                yearVal, sectionVal, secretKey,
                timestamp: Date.now()
            }));

        });
    } catch (err) {
        hideLoading();
        alert('Failed to start quiz: ' + err.message);
    }
}

function displayQuestion(index) {
    currentQuestionIndex = index;
    const q = quizData.questions[index];
    document.getElementById('quiz-review').classList.add('hidden');
    const container = document.getElementById('quiz-questions');
    container.classList.remove('hidden');

    document.getElementById('quiz-progress').style.width = `${((index + 1) / quizData.questions.length) * 100}%`;

    container.innerHTML = `
        <div class="quiz-question">
            <h3>Question ${index + 1} of ${quizData.questions.length}</h3>
            <p style="font-size:1.1rem; margin-bottom:15px;">${q.text}</p>
            ${q.figure ? `<div class="quiz-figure" style="margin-bottom:20px;">${q.figure}</div>` : ''}
            <div class="quiz-options">
                ${q.options.map((opt, i) => `
                    <div class="quiz-option ${studentAnswers[index] === i ? 'selected' : ''}" data-index="${i}">${opt}</div>
                `).join('')}
            </div>
        </div>
        <div style="display:flex; justify-content:space-between;">
            <button class="btn btn-outline" ${index === 0 ? 'disabled' : ''} id="prev-btn">Previous</button>
            ${index === quizData.questions.length - 1
            ? '<button class="btn btn-info" id="review-btn">Review Answers</button>'
            : '<button class="btn btn-primary" id="next-btn">Next</button>'}
        </div>
    `;

    container.querySelectorAll('.quiz-option').forEach(el => {
        el.onclick = () => {
            container.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
            el.classList.add('selected');
            studentAnswers[index] = parseInt(el.dataset.index);
            saveProgress();
        };
    });

    const prev = document.getElementById('prev-btn');
    if (prev) prev.onclick = () => displayQuestion(index - 1);
    const next = document.getElementById('next-btn');
    if (next) next.onclick = () => displayQuestion(index + 1);
    const review = document.getElementById('review-btn');
    if (review) review.onclick = () => showReviewPage();
}

function showReviewPage() {
    document.getElementById('quiz-questions').classList.add('hidden');
    const review = document.getElementById('quiz-review');
    review.classList.remove('hidden');

    review.innerHTML = `
        <h2>Review Answers</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:15px; margin-bottom:30px;">
            ${quizData.questions.map((q, i) => `
                <div onclick="displayQuestion(${i})" style="padding:15px; border-radius:10px; cursor:pointer; border:1px solid ${studentAnswers[i] !== null ? 'var(--success)' : 'var(--danger)'}; background:${studentAnswers[i] !== null ? '#f0fdf4' : '#fef2f2'};">
                    <strong>Q${i + 1}</strong>: ${studentAnswers[i] !== null ? 'Answered' : 'Missing'}
                </div>
            `).join('')}
        </div>
        <div style="display:flex; justify-content:space-between;">
            <button class="btn btn-outline" onclick="displayQuestion(${quizData.questions.length - 1})">Back</button>
            <button class="btn btn-success" id="submit-btn" style="padding:15px 40px;">Final Submit</button>
        </div>
    `;
    document.getElementById('submit-btn').onclick = () => submitQuiz();
}

// function startQuizTimer(mins, expiry) { // Old signature
function startQuizTimer(mins, expiry, startTime) {
    timerDisplay.classList.remove('hidden');
    // Calculate End Time: Strictly use Server Time logic if possible, but localized start time + duration works for duration-based.
    // For Fixed Expiry, we must compare against current Time.

    // Logic: The "End Time" is determined once.
    let absoluteEndTime = startTime + (mins * 60000);

    // If strict expiry date is set, it overrides duration if it's sooner
    if (expiry && expiry < absoluteEndTime) absoluteEndTime = expiry;

    // If duration is 0 but expiry exists, use expiry
    if (mins === 0 && expiry) absoluteEndTime = expiry;

    timerInterval = setInterval(async () => {
        // Use local time for smooth UI updates (seconds ticking), but fallback to server check?
        // Checking server time every second is too heavy.
        // We'll trust local time for UI, but if local time "jumps" (cheat attempt), we catch it?
        // Better: We rely on the "Absolute End Time" vs "Current Time".
        // If user changes system clock, 'Date.now()' changes.
        // To strictly prevent system clock hacks, we need 'performance.now()' relative to a trusted start,
        // OR fetch server time offset periodically.

        // Lightweight approach: We already calculate 'diff'.
        const now = Date.now();
        const diff = absoluteEndTime - now;

        if (diff <= 0) {
            clearInterval(timerInterval);
            showConfirmationModal('Time is up!', 'The quiz has expired. Submitting now.', () => submitQuiz(true), true);
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

        // Periodic Server Check (every 30s) to detect system clock manipulation
        if (s % 30 === 0) {
            const serverNow = await getServerTime();
            if (serverNow > absoluteEndTime) {
                clearInterval(timerInterval);
                showConfirmationModal('Time is up!', 'Quiz expired (Server Time).', () => submitQuiz(true), true);
            }
        }
    }, 1000);
}

function stopQuizTimer() { if (timerInterval) clearInterval(timerInterval); }

function startDevToolsDetection() {
    devToolsInterval = setInterval(() => {
        const start = performance.now();
        debugger;
        if (performance.now() - start > 160) handleFocusLoss();
    }, 2000);
}

function stopDevToolsDetection() { if (devToolsInterval) clearInterval(devToolsInterval); }

function handleFocusLoss() {
    if (isQuizActive && !isHandlingFocusLoss) {
        if (Date.now() - quizStartTime < 2000) return; // Grace period
        isHandlingFocusLoss = true;
        focusLostCount++;

        updateAttemptsDisplay();
        clearClipboard();

        // Show Full Screen Warning
        if (tabWarning) tabWarning.classList.remove('hidden');

        // Show/Expand Widget
        if (focusLostCount < MAX_ATTEMPTS) {
            expandWidget();
        }

        if (focusLostCount >= MAX_ATTEMPTS) {
            if (tabWarning) tabWarning.classList.add('hidden');
            alert('Attempts exceeded (Security Violation). Finalizing submission...');
            submitQuiz(true);
        }

        setTimeout(() => isHandlingFocusLoss = false, 1000);
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
    if (isQuizActive && !document.fullscreenElement) {
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
    if (!persistenceKey || !isQuizActive) return;
    const state = {
        startTime: quizStartTime,
        answers: studentAnswers,
        attempts: focusLostCount
    };
    localStorage.setItem(persistenceKey, JSON.stringify(state));
}

// function startQuizTimer(mins, expiry) { // Old signature
function showConfirmationModal(title, msg, onConfirm, isAlert = false) {
    modalTitle.textContent = title;
    modalMessage.textContent = msg;
    const conf = modalConfirmBtn.cloneNode(true);
    modalConfirmBtn.replaceWith(conf);
    const canc = modalCancelBtn.cloneNode(true);
    modalCancelBtn.replaceWith(canc);

    conf.innerText = isAlert ? "OK" : "Confirm";
    canc.classList.toggle('hidden', isAlert);

    conf.onclick = () => { confirmationModal.classList.add('hidden'); if (onConfirm) onConfirm(); };
    canc.onclick = () => confirmationModal.classList.add('hidden');
    confirmationModal.classList.remove('hidden');
}

function submitQuiz(auto = false) {
    if (!quizData) return;
    const exec = () => {
        let score = 0;
        const detail = quizData.questions.map((q, i) => {
            const correct = studentAnswers[i] === q.correctAnswer;
            if (correct) score++;
            return {
                questionText: q.text, figure: q.figure,
                studentAnswerText: studentAnswers[i] !== null ? q.options[studentAnswers[i]] : 'N/A',
                correctAnswerText: q.options[q.correctAnswer],
                isCorrect: correct
            };
        });

        const res = {
            student: quizData.student, quizTitle: quizData.title,
            subject: quizData.subject, score, totalQuestions: quizData.questions.length,
            detailedAnswers: detail, quizId: quizData.id,
            securityViolations: focusLostCount, // Track tab switches
            submittedAt: Date.now(),
            timeTakenMs: Date.now() - quizStartTime
        };
        window.studentResultsDataForPdf = res;

        if (quizData.showResultsToStudent) {
            document.getElementById('submission-success-message').classList.add('hidden');
            const summary = document.getElementById('student-score-summary');

            // Rich Feedback Calculation
            const percentage = Math.round((score / res.totalQuestions) * 100);
            let gradeLabel = 'Participant';
            let gradeColor = 'var(--text-muted)';

            if (percentage >= 90) { gradeLabel = 'Excellent!'; gradeColor = 'var(--success)'; }
            else if (percentage >= 75) { gradeLabel = 'Good Job!'; gradeColor = 'var(--primary)'; }
            else if (percentage >= 50) { gradeLabel = 'Fair'; gradeColor = 'var(--warning)'; }
            else { gradeLabel = 'Needs Improvement'; gradeColor = 'var(--danger)'; }

            summary.innerHTML = `
                <div style="text-align:center; padding:30px; background:var(--bg-body); border-radius:15px; margin-bottom:20px;">
                    <div style="font-size:3rem; font-weight:800; color:var(--primary);">${score} / ${res.totalQuestions}</div>
                    <div style="font-size:1.5rem; font-weight:700; color:${gradeColor}; margin-top:5px;">${gradeLabel} (${percentage}%)</div>
                    <div style="color:var(--text-muted); margin-top:5px;">Final Result</div>
                </div>
                ${detail.map((a, i) => `
                    <div class="quiz-question" style="border-left:5px solid ${a.isCorrect ? 'var(--success)' : 'var(--danger)'};">
                        <strong>Q${i + 1}</strong>: ${a.questionText}<br>
                        Your Answer: ${a.studentAnswerText}
                    </div>
                `).join('')}
            `;
            summary.classList.remove('hidden');
            document.getElementById('download-student-pdf-btn').classList.remove('hidden');
        } else {
            document.getElementById('submission-success-message').classList.remove('hidden');
        }

        quizSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        try { localStorage.setItem(quizData.id, JSON.stringify({ timestamp: Date.now() })); } catch { }

        if (quizData.saveResultsToCloud !== false) {
            showLoading();
            encryptData(JSON.stringify(res), quizData.secretKey).then(enc => {
                const id = `${quizData.student.lastName}_${quizData.student.firstName}`.replace(/[^a-zA-Z0-9_]/g, '');
                database.ref(`results/${quizData.id}/${id}`).set(enc).then(() => {
                    hideLoading();
                }).catch(err => {
                    hideLoading();
                    console.error('Submission error:', err);
                });
            }).catch(err => {
                hideLoading();
                console.error('Encryption error:', err);
            });
        }

        isQuizActive = false;
        document.body.classList.remove('quiz-active');
        window.onbeforeprint = null;
        clearClipboard();

        window.removeEventListener('blur', handleFocusLoss);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('blur', togglePrivacyBlur);
        window.removeEventListener('focus', togglePrivacyBlur);
        document.removeEventListener('keyup', handlePrintScreen);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => { });

        stopDevToolsDetection();
        stopWatermarkRotation();
        stopQuizTimer();
        if (attemptsWidget) attemptsWidget.classList.add('hidden');
        timerDisplay.classList.add('hidden');

        // Clear Persistence
        if (persistenceKey) localStorage.removeItem(persistenceKey);
        // Clear Active Session
        localStorage.removeItem('quizable_active_session');

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
            // Replaced alert with Modal
            showConfirmationModal('Incomplete Quiz', `You haven't answered all questions yet! (${missing} remaining)`, null, true);
        }
        else showConfirmationModal('Submit Quiz?', 'Are you sure you want to submit your answers?', exec);
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
    document.getElementById('download-student-pdf-btn').addEventListener('click', downloadStudentResultsAsPdf);
};

// --- CRYPTO HELPERS ---
async function getKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    return window.crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function encryptData(data, password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await getKey(password, salt);
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(data));
    const arr = new Uint8Array([...salt, ...iv, ...new Uint8Array(encrypted)]);
    return btoa(String.fromCharCode.apply(null, arr));
}

async function decryptData(str, password) {
    const arr = new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));
    const salt = arr.slice(0, 16);
    const iv = arr.slice(16, 28);
    const data = arr.slice(28);
    const key = await getKey(password, salt);
    const dec = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
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
