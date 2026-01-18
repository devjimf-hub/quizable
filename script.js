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

// Initialize based on URL parameters
function initializeApp() {
    const urlParams = new URLSearchParams(window.location.search);
    tabWarning.classList.add('hidden');
    attemptsCounter.classList.add('hidden');
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
    }
}

function showTeacherMenu() {
    teacherMenu.classList.remove('hidden');
    teacherCreateSection.classList.add('hidden');
    teacherResultsSection.classList.add('hidden');
    studentSection.classList.add('hidden');
    quizSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
}

function showCreateQuiz() {
    teacherMenu.classList.add('hidden');
    teacherCreateSection.classList.remove('hidden');
    if (document.getElementById('questions-container').children.length === 0) {
        addQuestion();
    }
}

function showViewResults() {
    teacherMenu.classList.add('hidden');
    teacherResultsSection.classList.remove('hidden');
}

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
            this.value = this.value.trim();
        });
    }
});

function isDevToolsOpen() {
    const threshold = 160;
    const start = performance.now();
    debugger;
    const end = performance.now();
    return end - start > threshold;
}

// --- CHEATING PREVENTION ---
window.addEventListener('contextmenu', (e) => { if (isQuizActive) e.preventDefault(); });
['copy', 'cut', 'dragstart'].forEach(event => {
    window.addEventListener(event, (e) => { if (isQuizActive) e.preventDefault(); });
});
window.addEventListener('keydown', (e) => {
    if (isQuizActive && (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')))) {
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
    const options = questionData ? questionData.options.join(' | ') : '';
    const correctAnswer = questionData ? questionData.correctAnswer : 0;

    const questionDiv = document.createElement('div');
    questionDiv.className = 'quiz-question';
    questionDiv.innerHTML = `
        <h3>Question ${questionIndex + 1}</h3>
        <div class="form-group">
            <label>Question Text:</label>
            <textarea class="question-text" placeholder="Enter question text" rows="4"></textarea>
        </div>
        <div class="form-group">
            <label>Figure (optional, paste SVG/HTML here):</label>
            <textarea class="question-figure" placeholder="e.g., <svg>...</svg> or <img src=...>" rows="3"></textarea>
        </div>
        <div class="form-group">
            <label>Options (separated by |):</label>
            <input type="text" class="question-options" placeholder="Option A | Option B | Option C">
        </div>
        <div class="form-group">
            <label>Correct Answer Index (0, 1, 2...):</label>
            <input type="number" class="correct-answer" min="0" value="${correctAnswer}">
        </div>
        <button class="btn btn-danger remove-question">Remove Question</button>
    `;

    questionsContainer.appendChild(questionDiv);

    if (questionData) {
        questionDiv.querySelector('.question-text').value = text;
        questionDiv.querySelector('.question-figure').value = figure;
        questionDiv.querySelector('.question-options').value = options;
    }

    questionDiv.querySelector('.remove-question').addEventListener('click', function () {
        questionsContainer.removeChild(questionDiv);
        const questions = questionsContainer.querySelectorAll('.quiz-question');
        questions.forEach((q, index) => {
            q.querySelector('h3').textContent = `Question ${index + 1}`;
        });
    });
}

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
        const text = q.querySelector('.question-text').value;
        const figure = q.querySelector('.question-figure').value;
        const options = q.querySelector('.question-options').value.split('|').map(opt => opt.trim()).filter(Boolean);
        const correctAnswer = parseInt(q.querySelector('.correct-answer').value);

        if (text && options.length >= 2 && !isNaN(correctAnswer) && correctAnswer >= 0 && correctAnswer < options.length) {
            quiz.questions.push({ text, figure, options, correctAnswer });
        } else {
            alert(`Error in Question ${index + 1}.`);
            allValid = false;
        }
    });

    if (!allValid) return;

    showLoading();
    encryptData(JSON.stringify(quiz), secretKey).then(encrypted => {
        database.ref('quizzes/' + quiz.id).set({ encryptedQuizData: encrypted }).then(() => {
            hideLoading();
            const credentials = `Quiz Title: ${quizTitle}\nQuiz ID: ${quiz.id}\nSecret Key: ${secretKey}`;
            const blob = new Blob([credentials], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `quiz_credentials_${quizTitle.replace(/\s+/g, '_')}.txt`;
            a.click();
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

function handleViewResultsClick() {
    const quizId = document.getElementById('results-quiz-id').value.trim();
    const secretKey = document.getElementById('results-secret-key').value.trim();
    if (quizId && secretKey) fetchAndDisplayResults(quizId, secretKey);
}

async function fetchAndDisplayResults(quizId, secretKey) {
    const resultsDisplay = document.getElementById('student-results-display');
    const sectionContainer = document.getElementById('section-selector-container');

    showLoading();
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

            resultsDisplay.innerHTML = `
                <h3>Results (${list.length})</h3>
                ${list.map(res => `
                    <div class="student-result-card" style="display:flex; justify-content:space-between; padding:15px; border-bottom:1px solid #eee;">
                        <div><strong>${res.student.lastName}, ${res.student.firstName}</strong> (${res.student.section})</div>
                        <div style="color:var(--primary); font-weight:700;">${res.score}/${res.totalQuestions}</div>
                    </div>
                `).join('')}
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

function exportResultsToPdf() {
    if (processedStudentResults.length === 0) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const res0 = processedStudentResults[0];

    doc.setFontSize(18);
    doc.text(res0.quizTitle, 14, 22);
    doc.autoTable({
        head: [['Last Name', 'First Name', 'Section', 'Score']],
        body: processedStudentResults.map(r => [r.student.lastName, r.student.firstName, r.student.section, `${r.score}/${r.totalQuestions}`]),
        startY: 30
    });

    processedStudentResults.forEach(res => {
        doc.addPage();
        doc.text(`Detail: ${res.student.lastName}, ${res.student.firstName}`, 14, 20);
        doc.autoTable({
            head: [['#', 'Question', 'Student', 'Correct', 'Result']],
            body: res.detailedAnswers.map((a, i) => [i + 1, a.questionText, a.studentAnswerText, a.correctAnswerText, a.isCorrect ? '✓' : '✗']),
            startY: 30
        });
    });
    doc.save(`${res0.quizTitle}_Results.pdf`);
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
    const quizId = document.getElementById('student-quiz-id').value.trim();
    const firstName = document.getElementById('student-first-name').value.trim();
    const lastName = document.getElementById('student-last-name').value.trim();
    const section = document.getElementById('student-year-section').value.trim();
    const secretKey = document.getElementById('student-secret-key').value.trim();

    if (isDevToolsOpen()) { alert('Close DevTools.'); return; }
    if (!quizId || !firstName || !lastName || !section || !secretKey) { alert('Fill all fields.'); return; }

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
        if (quizData.expiry && serverTime > quizData.expiry) {
            hideLoading();
            alert('Quiz expired.');
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
            quizData.student = { firstName, lastName, section };
            quizData.secretKey = secretKey;
            studentAnswers = new Array(quizData.questions.length).fill(null);

            studentSection.classList.add('hidden');
            quizSection.classList.remove('hidden');
            document.getElementById('quiz-title-display').textContent = quizData.title;
            displayQuestion(0);

            if (quizData.duration > 0 || quizData.expiry) startQuizTimer(quizData.duration, quizData.expiry);

            quizStartTime = Date.now();
            isQuizActive = true;
            window.addEventListener('blur', handleFocusLoss);
            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('blur', togglePrivacyBlur);
            window.addEventListener('focus', togglePrivacyBlur);
            document.addEventListener('keyup', handlePrintScreen);

            // Enforce Fullscreen
            document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen blocked:', e));
            document.addEventListener('fullscreenchange', handleFullscreenChange);

            startDevToolsDetection();
            attemptsCounter.classList.remove('hidden');
            updateAttemptsDisplay();
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

function startQuizTimer(mins, expiry) {
    timerDisplay.classList.remove('hidden');
    let end = Date.now() + (mins * 60000);
    if (expiry && expiry < end) end = expiry;

    timerInterval = setInterval(() => {
        const diff = end - Date.now();
        if (diff <= 0) {
            clearInterval(timerInterval);
            alert('Time is up!');
            submitQuiz(true);
            return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerDisplay.textContent = `Time Left: ${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
        if (Date.now() - quizStartTime < 1000) return;
        isHandlingFocusLoss = true;
        focusLostCount++;
        updateAttemptsDisplay();
        if (focusLostCount <= MAX_ATTEMPTS) {
            tabWarning.classList.remove('hidden');
            remainingAttempts.textContent = MAX_ATTEMPTS - focusLostCount;
        } else {
            alert('Attempts exceeded (Tab Switching/DevTools).');
            submitQuiz(true);
        }
        setTimeout(() => isHandlingFocusLoss = false, 100);
    }
}

function handleFullscreenChange() {
    if (isQuizActive && !document.fullscreenElement) {
        // User exited fullscreen
        if (Date.now() - quizStartTime < 1000) return; // Grace period

        isHandlingFocusLoss = true;
        focusLostCount++;
        updateAttemptsDisplay();

        if (focusLostCount <= MAX_ATTEMPTS) {
            tabWarning.innerHTML = `
                <div style="font-size: 4rem; margin-bottom: 20px;">⚠️</div>
                <h2>Fullscreen Exited</h2>
                <p>You must stay in fullscreen mode.</p>
                <button id="return-to-quiz-fs" class="btn btn-primary">Return to Fullscreen</button>
            `;
            document.getElementById('return-to-quiz-fs').onclick = () => {
                document.documentElement.requestFullscreen();
                tabWarning.classList.add('hidden');
            };
            tabWarning.classList.remove('hidden');
        } else {
            alert('Attempts exceeded (Fullscreen Exit).');
            submitQuiz(true);
        }
        setTimeout(() => isHandlingFocusLoss = false, 100);
    }
}

function returnToQuiz() { tabWarning.classList.add('hidden'); }
function updateAttemptsDisplay() {
    attemptsCount.textContent = focusLostCount;
    attemptsCounter.textContent = `Attempts: ${focusLostCount}/${MAX_ATTEMPTS}`;
}

function showConfirmationModal(title, msg, onConfirm) {
    modalTitle.textContent = title;
    modalMessage.textContent = msg;
    const conf = modalConfirmBtn.cloneNode(true);
    modalConfirmBtn.replaceWith(conf);
    const canc = modalCancelBtn.cloneNode(true);
    modalCancelBtn.replaceWith(canc);

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
            detailedAnswers: detail, quizId: quizData.id
        };
        window.studentResultsDataForPdf = res;

        if (quizData.showResultsToStudent) {
            document.getElementById('submission-success-message').classList.add('hidden');
            const summary = document.getElementById('student-score-summary');
            summary.innerHTML = `
                <div style="text-align:center; padding:30px; background:var(--bg-body); border-radius:15px; margin-bottom:20px;">
                    <div style="font-size:3rem; font-weight:800; color:var(--primary);">${score} / ${res.totalQuestions}</div>
                    <div style="color:var(--text-muted);">Final Result</div>
                </div>
                ${detail.map((a, i) => `
                    <div class="quiz-question" style="border-left:5px solid ${a.isCorrect ? 'var(--success)' : 'var(--danger)'};">
                        <strong>Q${i + 1}</strong>: ${a.questionText}<br>
                        Your: ${a.studentAnswerText} | Correct: ${a.correctAnswerText}
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
        stopDevToolsDetection();
        stopQuizTimer();
        attemptsCounter.classList.add('hidden');
        timerDisplay.classList.add('hidden');
    };

    if (auto) exec();
    else {
        const missing = studentAnswers.filter(a => a === null).length;
        if (missing > 0) alert(`Answer all questions! (${missing} left)`);
        else showConfirmationModal('Submit?', 'Sure?', exec);
    }
}

function downloadStudentResultsAsPdf() {
    const res = window.studentResultsDataForPdf;
    if (!res) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(res.quizTitle, 14, 20);
    doc.text(`Student: ${res.student.firstName} ${res.student.lastName}`, 14, 30);
    doc.text(`Score: ${res.score}/${res.totalQuestions}`, 14, 40);
    doc.autoTable({
        head: [['#', 'Question', 'Your Answer', 'Result']],
        body: res.detailedAnswers.map((a, i) => [i + 1, a.questionText, a.studentAnswerText, a.isCorrect ? 'Correct' : 'Incorrect']),
        startY: 50
    });
    doc.save('My_Results.pdf');
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
