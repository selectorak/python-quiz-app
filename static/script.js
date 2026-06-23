/* ===== 状态 ===== */
let questions = [];
let answers = {};
let currentIndex = 0;
let timerInterval = null;
let secondsElapsed = 0;
let submitted = false;
let abortController = null;
let currentBank = 'classic';
let isTimedMode = false;
let timeLimitSeconds = 600;  // 默认 10 分钟
let timedOut = false;

/* ===== DOM 引用 ===== */
const $id   = s => document.getElementById(s);
const $sel  = s => document.querySelector(s);
const $all  = s => document.querySelectorAll(s);

const configSection  = $id('config-section');
const quizSection    = $id('quiz-section');
const resultSection  = $id('result-section');
const wrongSection   = $id('wrong-section');
const historySection = $id('history-section');
const startBtn       = $id('start-btn');
const resumeBtn      = $id('resume-btn');
const retryBtn       = $id('retry-btn');
const wrongRetryBtn  = $id('wrong-retry-btn');
const wrongClearBtn  = $id('wrong-clear-btn');
const historyClearBtn = $id('history-clear-btn');
const prevBtn        = $id('prev-btn');
const nextBtn        = $id('next-btn');
const submitBtn      = $id('submit-btn');
const bankSelect     = $id('bank-select');
const bankInfo       = $id('bank-info');
const countSelect    = $id('count-select');
const topicSelect    = $id('topic-select');
const difficultySelect = $id('difficulty-select');
const searchInput      = $id('search-input');
const searchBtn        = $id('search-btn');
const searchResultInfo = $id('search-result-info');
const timedModeCheck   = $id('timed-mode');
const timeLimitSelect  = $id('time-limit-select');
const progressText   = $id('progress-text');
const progressFill   = $id('progress-fill');
const timerDisplay   = $id('timer-display');
const questionCnt    = $id('question-container');
const navList        = $id('question-nav-list');
const scoreDisplay   = $id('score-display');
const reviewCnt      = $id('review-container');
const wrongCnt       = $id('wrong-container');
const wrongCount     = $id('wrong-count');
const historyCnt     = $id('history-container');
const loadingOverlay = $id('loading-overlay');
const loadingText    = $id('loading-text');
let loadingCounter = 0;  // 嵌套请求计数

/* ===== 工具 ===== */
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const STORAGE_KEY_SESSION = 'quiz_session';
const STORAGE_KEY_HISTORY = 'quiz_history';

function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/** 将选项数组随机打乱，返回 { shuffled, mapping } */
function shuffleOptions(options) {
    const indices = options.map((_, i) => i);
    // Fisher-Yates 洗牌
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return {
        shuffled: indices.map(i => options[i]),
        mapping: indices,  // mapping[newIdx] = oldIdx
    };
}

/** 难度标签 HTML */
function difficultyBadge(diff) {
    if (diff === 'hard') return '<span class="diff-badge diff-hard">困难</span>';
    if (diff === 'medium') return '<span class="diff-badge diff-medium">中等</span>';
    return '';
}

/* ===== 计时器（支持正向计时和倒计时） ===== */
function startTimer() {
    stopTimer();
    secondsElapsed = 0;
    timedOut = false;
    isTimedMode = timedModeCheck.checked;
    timeLimitSeconds = parseInt(timeLimitSelect.value) * 60;

    if (isTimedMode) {
        // 倒计时模式
        timerDisplay.textContent = `⏱ ${formatTime(timeLimitSeconds)}`;
        timerInterval = setInterval(() => {
            const remaining = timeLimitSeconds - secondsElapsed;
            secondsElapsed++;
            if (remaining <= 0) {
                timerDisplay.textContent = '⏱ 00:00';
                stopTimer();
                timedOut = true;
                if (!submitted) autoSubmitDueToTimeout();
                return;
            }
            // 剩余 < 60s 闪烁警示
            const cls = remaining <= 60 ? 'timer-warning' : '';
            timerDisplay.className = cls;
            timerDisplay.textContent = `⏱ ${formatTime(remaining)}`;
        }, 1000);
    } else {
        // 正向计时
        timerDisplay.textContent = '⏱ 00:00';
        timerDisplay.className = '';
        timerInterval = setInterval(() => {
            secondsElapsed++;
            timerDisplay.textContent = `⏱ ${formatTime(secondsElapsed)}`;
        }, 1000);
    }
}

function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

async function autoSubmitDueToTimeout() {
    alert('⏰ 时间到！系统将自动提交当前答案。');
    submitBtn.disabled = true;
    submitBtn.textContent = '时间到，提交中...';
    try {
        const resp = await fetchWithTimeout('/api/submit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, bank: currentBank }),
            _loadingText: '正在批改答案...',
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `错误 (${resp.status})`);
        const data = await resp.json();
        clearSession();
        const wrongItems = data.results.filter(r => !r.correct);
        if (wrongItems.length > 0) {
            await fetch('/api/wrong', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: wrongItems }) });
        }
        saveScoreHistory(data);
        showResults(data);
        renderWrongQuestions();
    } catch (err) {
        console.error('超时提交失败:', err);
        alert('自动提交失败，请手动提交。');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交答卷';
    }
}

/* ===== 全局加载状态 ===== */
function showLoading(text) {
    loadingCounter++;
    loadingText.textContent = text || '加载中...';
    loadingOverlay.style.display = 'flex';
}
function hideLoading() {
    loadingCounter--;
    if (loadingCounter <= 0) {
        loadingCounter = 0;
        loadingOverlay.style.display = 'none';
    }
}

/* ===== 请求（带超时 + 加载状态） ===== */
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    abortController?.abort();
    abortController = new AbortController();
    showLoading(options._loadingText || '加载中...');
    const timer = setTimeout(() => abortController.abort(), timeoutMs);
    try {
        const resp = await fetch(url, { ...options, signal: abortController.signal });
        clearTimeout(timer);
        return resp;
    } catch (err) { clearTimeout(timer); throw err; }
    finally { hideLoading(); }
}

/* ===== 加载题库列表 ===== */
async function loadBanks() {
    try {
        const resp = await fetchWithTimeout('/api/banks');
        const data = await resp.json();
        bankSelect.innerHTML = '';
        data.banks.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.key;
            opt.textContent = `${b.label}（${b.count} 题）`;
            bankSelect.appendChild(opt);
        });
        onBankChange();
    } catch (err) { console.error('加载题库列表失败:', err); }
}

function onBankChange() {
    const bank = bankSelect.value;
    const opt = bankSelect.selectedOptions[0];
    bankInfo.textContent = opt ? `已选：${opt.textContent}` : '';
    currentBank = bank;
    loadTopics(bank);
}
bankSelect.addEventListener('change', onBankChange);

async function loadTopics(bank) {
    try {
        const resp = await fetchWithTimeout(`/api/topics?bank=${bank}`);
        if (!resp.ok) return;
        const data = await resp.json();
        topicSelect.innerHTML = '<option value="">全部主题</option>';
        data.topics.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.textContent = t;
            topicSelect.appendChild(opt);
        });
    } catch (err) { console.error('加载主题列表失败:', err); }
}

/* 骨架屏 — 题目加载占位 */
function renderSkeleton() {
    questionCnt.innerHTML = `
        <div class="skeleton-block">
            <div class="skeleton skeleton-line-sm"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line" style="width:75%"></div>
            <div class="skeleton skeleton-line" style="width:50%"></div>
            <div style="margin-top:20px;">
                <div class="skeleton skeleton-option"></div>
                <div class="skeleton skeleton-option"></div>
                <div class="skeleton skeleton-option" style="width:70%"></div>
            </div>
        </div>
    `;
    questionCnt.style.opacity = '1';
}

async function loadQuestions(count, topic, difficulty, bank, keyword) {
    try {
        const params = new URLSearchParams({ count, bank });
        if (topic) params.set('topic', topic);
        if (difficulty) params.set('difficulty', difficulty);
        if (keyword) params.set('keyword', keyword);
        renderSkeleton();  // 显示骨架屏
        const resp = await fetchWithTimeout(`/api/questions?${params}`, { _loadingText: '正在加载题目...' });
        if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({}));
            throw new Error(errBody.error || `服务器错误 (${resp.status})`);
        }
        const data = await resp.json();
        currentBank = data.bank || bank;
        return data.questions;
    } catch (err) {
        if (err.name === 'AbortError') alert('请求超时，请检查网络后重试。');
        else { console.error('加载题目失败:', err); alert('加载题目失败：' + err.message); }
        return [];
    }
}

/* ===== 渲染题目 ===== */
function renderQuestion(index) {
    try {
        const q = questions[index];
        if (!q) return;

        progressText.textContent = `第 ${index + 1} / ${questions.length} 题`;
        updateProgressBar();

        let html = `<div class="question-block active">`;
        // 难度标签
        html += `<div class="question-meta">${difficultyBadge(q.difficulty)}</div>`;
        html += `<div class="question-text">${renderQuestionText(q.question)}</div>`;
        html += `<ul class="options-list" id="options-list">`;
        q.options.forEach((opt, oi) => {
            const selected = answers[q.id] === oi ? 'selected' : '';
            html += `
            <li class="option-item ${selected}" data-opt-index="${oi}" data-qid="${q.id}">
                <span class="option-label">${LETTERS[oi]}</span>
                <span class="option-text">${escapeHtml(opt)}</span>
            </li>`;
        });
        html += `</ul>`;
        html += `<div class="explanation-box" id="expl-${q.id}"></div>`;
        html += `</div>`;

        questionCnt.style.opacity = '0';
        setTimeout(() => { questionCnt.innerHTML = html; questionCnt.style.opacity = '1'; }, 120);
        updateNavButtons();
        renderNav();
    } catch (err) {
        console.error('renderQuestion 出错:', err);
        questionCnt.innerHTML = `<p style="color:red;padding:20px;">渲染题目时出错：${escapeHtml(err.message)}</p>`;
    }
}

function updateProgressBar() {
    if (!progressFill) return;
    const answered = Object.keys(answers).length;
    const total = questions.length;
    progressFill.style.width = `${total > 0 ? (answered / total * 100) : 0}%`;
}

/* ===== 题号导航面板 ===== */
function renderNav() {
    if (!navList) return;
    var total = questions.length;
    if (total === 0) { navList.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < total; i++) {
        var q = questions[i];
        var isCurrent = i === currentIndex;
        var isAnswered = q && answers[q.id] !== undefined;
        var cls = 'nav-item';
        if (isCurrent) cls += ' nav-current';
        if (isAnswered) cls += ' nav-answered';
        html += '<div class="' + cls + '" data-nav-index="' + i + '">' + (i + 1) + '</div>';
    }
    navList.innerHTML = html;
    var currentEl = navList.querySelector('.nav-current');
    if (currentEl) currentEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

navList.addEventListener('click', function(e) {
    var item = e.target.closest('.nav-item');
    if (!item || submitted) return;
    var idx = parseInt(item.dataset.navIndex);
    if (!isNaN(idx) && idx >= 0 && idx < questions.length) {
        currentIndex = idx;
        renderQuestion(currentIndex);
        renderNav();
    }
});

function renderQuestionText(text) {
    try {
        let result = '', inCode = false;
        const lines = text.split('\n');
        for (const line of lines) {
            if (line.replace(/^\s*/, '').startsWith('```')) {
                result += inCode ? '</pre>' : '<pre>';
                inCode = !inCode;
            } else {
                result += (inCode ? '' : '') + escapeHtml(line) + '\n';
            }
        }
        let rendered = '', i = 0;
        while (i < result.length) {
            const preStart = result.indexOf('<pre>', i);
            if (preStart === -1) { rendered += result.slice(i).replace(/\n/g, '<br>'); break; }
            rendered += result.slice(i, preStart).replace(/\n/g, '<br>');
            const preEnd = result.indexOf('</pre>', preStart);
            if (preEnd === -1) { rendered += result.slice(preStart); break; }
            rendered += result.slice(preStart, preEnd + 6);
            i = preEnd + 6;
        }
        return rendered;
    } catch (err) { return escapeHtml(text); }
}

/* ===== 选中选项 ===== */
function selectOption(qid, idx) {
    if (submitted) return;
    answers[qid] = idx;
    $all('.option-item').forEach(el => {
        if (el.dataset.qid === qid) el.classList.toggle('selected', parseInt(el.dataset.optIndex) === idx);
    });
    const q = questions.find(qq => qq.id === qid);
    if (q) q.selected = idx;
    updateProgressBar();
    renderNav();
    saveSession();
}

questionCnt.addEventListener('click', (e) => {
    const item = e.target.closest('.option-item');
    if (!item || submitted) return;
    const qid = item.dataset.qid, idx = parseInt(item.dataset.optIndex);
    if (qid !== undefined && !isNaN(idx)) selectOption(qid, idx);
});

/* ===== 导航 ===== */
function updateNavButtons() {
    prevBtn.disabled = currentIndex === 0;
    const isLast = currentIndex === questions.length - 1;
    nextBtn.style.display = isLast ? 'none' : '';
    submitBtn.style.display = isLast ? '' : 'none';
}
function goToPrev() { if (currentIndex > 0) { currentIndex--; renderQuestion(currentIndex); renderNav(); } }
function goToNext() { if (currentIndex < questions.length - 1) { currentIndex++; renderQuestion(currentIndex); renderNav(); } }

/* ===== 提交 ===== */
async function submitQuiz() {
    const unanswered = questions.filter(q => answers[q.id] === undefined);
    if (unanswered.length > 0) {
        if (!confirm(`还有 ${unanswered.length} 题未作答，确定提交吗？`)) return;
    }
    submitBtn.disabled = true; submitBtn.textContent = '批改中...';
    stopTimer();
    try {
        const resp = await fetchWithTimeout('/api/submit', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers, bank: currentBank }),
            _loadingText: '正在批改答案...',
        });
        if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `错误 (${resp.status})`);
        const data = await resp.json();
        clearSession();
        // 错题提交到服务端
        const wrongItems = data.results.filter(r => !r.correct);
        if (wrongItems.length > 0) {
            await fetch('/api/wrong', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: wrongItems }) });
        }
        // 保存成绩历史
        saveScoreHistory(data);
        showResults(data);
        renderWrongQuestions();
    } catch (err) {
        if (err.name === 'AbortError') alert('请求超时，请重试。');
        else { console.error('提交失败:', err); alert('提交失败：' + err.message); }
        submitBtn.disabled = false; submitBtn.textContent = '提交答卷';
    }
}

/* ===== 成绩历史 ===== */
function saveScoreHistory(data) {
    try {
        const history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
        history.push({
            date: new Date().toLocaleString(),
            score: data.score_pct,
            correct: data.correct_count,
            total: data.total,
            passed: data.passed,
            bank: currentBank,
        });
        // 保留最近 50 条
        if (history.length > 50) history.splice(0, history.length - 50);
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    } catch (e) {}
}

function renderScoreHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY) || '[]');
        if (history.length === 0) {
            historyCnt.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">暂无记录</p>';
            return;
        }

        // 统计
        const total = history.length;
        const avg = history.reduce((s, h) => s + h.score, 0) / total;
        const best = Math.max(...history.map(h => h.score));
        const passed = history.filter(h => h.passed).length;

        let html = `<div class="history-stats">
            <span class="history-stat">📊 共 ${total} 次</span>
            <span class="history-stat">📈 平均 ${avg.toFixed(1)}%</span>
            <span class="history-stat">🏆 最高 ${best}%</span>
            <span class="history-stat">✅ 合格 ${passed}/${total}</span>
        </div>`;

        // 最近 10 条柱状图
        const recent = history.slice(-10);
        html += `<div class="history-chart">`;
        recent.forEach((h, i) => {
            const barHeight = Math.max(h.score, 4);
            const barClass = h.passed ? 'hist-bar-pass' : 'hist-bar-fail';
            html += `<div class="hist-col" title="${h.date} — ${h.score}% (${h.correct}/${h.total})">
                <div class="hist-bar ${barClass}" style="height:${barHeight}%"></div>
                <div class="hist-label">${h.score}%</div>
            </div>`;
        });
        html += `</div>`;

        // 最近 5 条详情
        html += `<table class="history-table"><tr><th>时间</th><th>分数</th><th>正确</th><th>结果</th></tr>`;
        [...history].reverse().slice(0, 5).forEach(h => {
            html += `<tr>
                <td>${escapeHtml(h.date)}</td>
                <td>${h.score}%</td>
                <td>${h.correct}/${h.total}</td>
                <td class="${h.passed ? 'review-result-correct' : 'review-result-wrong'}">${h.passed ? '✅' : '❌'}</td>
            </tr>`;
        });
        html += `</table>`;

        historyCnt.innerHTML = html;
    } catch (e) {
        historyCnt.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">暂无记录</p>';
    }
}

/* ===== 显示结果 ===== */
function showResults(data) {
    submitted = true;
    quizSection.style.display = 'none';
    resultSection.style.display = 'block';

    const passClass = data.passed ? 'score-pass' : 'score-fail';
    const passText = data.passed ? '✅ 合格' : '❌ 未合格（60% 及格线）';
    scoreDisplay.innerHTML = `
        <div class="score-big ${passClass}">${data.score_pct}%</div>
        <div class="score-label">${data.correct_count} / ${data.total} 正确</div>
        <div class="score-label ${passClass}" style="margin-top:6px;font-weight:600;">${passText}</div>
        <div class="score-label" style="margin-top:4px;font-size:0.85rem;">用时 ${formatTime(secondsElapsed)}</div>
    `;

    let html = '';
    data.results.forEach((r, i) => {
        const statusClass = r.correct ? 'review-result-correct' : 'review-result-wrong';
        const statusText = r.correct ? '✅ 正确' : '❌ 错误';
        const selectedLetter = r.selected !== undefined && r.selected !== null ? LETTERS[r.selected] : '未选';
        const correctLetter = LETTERS[r.answer];

        html += `<div class="review-item" style="animation-delay:${i * 0.03}s">
            ${difficultyBadge(r.difficulty)}
            <div class="review-q">${renderQuestionText(r.question)}</div>
            <div class="review-meta">
                <span class="${statusClass}">${statusText}</span>
                &nbsp;· 你的答案：${selectedLetter} &nbsp;· 正确答案：${correctLetter}
            </div>
            <ul class="options-list">`;

        r.options.forEach((opt, oi) => {
            let cls = '';
            if (oi === r.answer) cls = 'correct-answer';
            else if (oi === r.selected && !r.correct) cls = 'wrong-answer';
            else if (oi === r.selected) cls = 'correct-answer';
            html += `<li class="option-item ${cls}" style="cursor:default;"><span class="option-label">${LETTERS[oi]}</span><span class="option-text">${escapeHtml(opt)}</span></li>`;
        });

        html += `</ul>
            <div class="explanation-box show"><strong>📖 解析：</strong> ${escapeHtml(r.explanation)}</div>
        </div>`;
    });

    reviewCnt.innerHTML = html;
    setTimeout(() => resultSection.scrollIntoView({ behavior: 'smooth' }), 100);
}

/* ===== session 保活 ===== */
function saveSession() {
    try { localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ questions, answers, currentIndex, secondsElapsed, submitted: false, savedAt: Date.now(), bank: currentBank, isTimedMode, timeLimitSeconds })); } catch (e) {}
}
function clearSession() { localStorage.removeItem(STORAGE_KEY_SESSION); }
function loadSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_SESSION);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (Date.now() - s.savedAt > 2 * 60 * 60 * 1000) { clearSession(); return null; }
        return s;
    } catch (e) { clearSession(); return null; }
}
function restoreSession(session) {
    questions = session.questions || []; answers = session.answers || {};
    currentIndex = session.currentIndex || 0; secondsElapsed = session.secondsElapsed || 0;
    currentBank = session.bank || 'classic';
    isTimedMode = session.isTimedMode || false;
    timeLimitSeconds = session.timeLimitSeconds || 600;
    submitted = false;
    if (questions.length === 0) return;
    configSection.style.display = 'none'; quizSection.style.display = 'block';
    if (isTimedMode) {
        const remaining = timeLimitSeconds - secondsElapsed;
        timerDisplay.textContent = `⏱ ${formatTime(Math.max(remaining, 0))}`;
        if (remaining <= 0) { timerDisplay.textContent = '⏱ 00:00'; return; }
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const r = timeLimitSeconds - secondsElapsed;
            secondsElapsed++;
            if (r <= 0) { stopTimer(); timerDisplay.textContent = '⏱ 00:00'; if (!submitted) autoSubmitDueToTimeout(); return; }
            timerDisplay.className = r <= 60 ? 'timer-warning' : '';
            timerDisplay.textContent = `⏱ ${formatTime(r)}`;
        }, 1000);
    } else {
        timerDisplay.textContent = `⏱ ${formatTime(secondsElapsed)}`;
        clearInterval(timerInterval);
        timerInterval = setInterval(() => { secondsElapsed++; timerDisplay.textContent = `⏱ ${formatTime(secondsElapsed)}`; }, 1000);
    }
    renderQuestion(currentIndex);
    renderNav();
}

/* ===== 错题本 ===== */
async function renderWrongQuestions() {
    try {
        const resp = await fetch('/api/wrong');
        const data = await resp.json();
        const items = data.questions || [];
        if (items.length === 0) {
            wrongSection.style.display = 'block'; wrongCount.textContent = '(暂无错题)';
            wrongCnt.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:16px;">还没有错题记录，继续加油！</p>';
            return;
        }
        wrongSection.style.display = 'block'; wrongCount.textContent = `(${items.length} 题待复习)`;
        let html = '';
        items.forEach((r, i) => {
            const sl = r.selected !== undefined && r.selected !== null ? LETTERS[r.selected] : '未选';
            const cl = LETTERS[r.answer];
            html += `<div class="review-item" style="animation-delay:${i * 0.02}s">
                ${difficultyBadge(r.difficulty)}
                <div class="review-q">${renderQuestionText(r.question)}</div>
                <div class="review-meta">
                    <span class="review-result-wrong">❌ 错误</span>
                    &nbsp;· 你的答案：${sl} &nbsp;· 正确答案：${cl}
                    &nbsp;· <span class="wrong-count-badge">❌ 错 ${r.wrong_count || 1} 次</span>
                </div>
                <ul class="options-list">`;
            r.options.forEach((opt, oi) => {
                let cls = '';
                if (oi === r.answer) cls = 'correct-answer';
                else if (oi === r.selected && !r.correct) cls = 'wrong-answer';
                else if (oi === r.selected) cls = 'correct-answer';
                html += `<li class="option-item ${cls}" style="cursor:default;"><span class="option-label">${LETTERS[oi]}</span><span class="option-text">${escapeHtml(opt)}</span></li>`;
            });
            html += `</ul>
                <div class="explanation-box show"><strong>📖 解析：</strong> ${escapeHtml(r.explanation)}</div>
                <button class="btn btn-secondary wrong-remove-btn" style="margin-top:8px;font-size:0.82rem;padding:4px 12px;" data-qid="${r.id}">✕ 移除此题</button>
            </div>`;
        });
        wrongCnt.innerHTML = html;
        wrongCnt.querySelectorAll('.wrong-remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => { await fetch(`/api/wrong/${btn.dataset.qid}`, { method: 'DELETE' }); renderWrongQuestions(); });
        });
    } catch (err) { console.error('加载错题本失败:', err); }
}

/* ===== 启动 ===== */
async function startQuiz(topicOverride, difficultyOverride) {
    try {
        let count = parseInt(countSelect.value);
        if (isNaN(count) || count <= 0) count = 0;  // "全部练习"或无效值 → 后端返回全部
        const topic = topicOverride !== undefined ? topicOverride : topicSelect.value;
        const difficulty = difficultyOverride !== undefined ? difficultyOverride : difficultySelect.value;
        const bank = bankSelect.value;
        const keyword = searchInput.value.trim();

        questions = []; answers = {}; currentIndex = 0; submitted = false;
        resultSection.style.display = 'none';
        submitBtn.disabled = false; submitBtn.textContent = '提交答卷';

        startBtn.disabled = true; startBtn.textContent = '加载中...';
        questions = await loadQuestions(count, topic, difficulty, bank, keyword);

        // 选项随机排序
        questions.forEach(q => {
            if (q.options && q.options.length > 0) {
                const { shuffled, mapping } = shuffleOptions(q.options);
                q.options = shuffled;
                q._shuffleMapping = mapping;  // 存储映射，批改时用
            }
        });

        startBtn.disabled = false; startBtn.textContent = '开始答题';
        if (questions.length === 0) return;
        configSection.style.display = 'none'; quizSection.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        renderQuestion(0); renderNav(); startTimer(); saveSession();
    } catch (err) {
        console.error('startQuiz 出错:', err); alert('出错了：' + err.message);
        startBtn.disabled = false; startBtn.textContent = '开始答题';
    }
}

async function startWrongQuiz() {
    try {
        const resp = await fetch('/api/wrong');
        const data = await resp.json();
        const wrongItems = data.questions || [];
        if (wrongItems.length === 0) { alert('没有错题需要重做！'); return; }
        questions = wrongItems.map(item => ({ id: item.id, question: item.question, options: item.options }));
        answers = {}; currentIndex = 0; submitted = false;
        resultSection.style.display = 'none'; configSection.style.display = 'none';
        quizSection.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        renderQuestion(0); renderNav(); startTimer();
    } catch (err) { console.error('加载错题失败:', err); alert('加载错题失败'); }
}

function resetToConfig() {
    stopTimer(); submitted = false;
    quizSection.style.display = 'none'; resultSection.style.display = 'none';
    configSection.style.display = 'block';
    startBtn.disabled = false; startBtn.textContent = '开始答题';
    questionCnt.innerHTML = '';
    renderWrongQuestions(); renderScoreHistory();
}

function checkResume() {
    const session = loadSession();
    if (session && session.questions && session.questions.length > 0) {
        resumeBtn.style.display = '';
        resumeBtn.addEventListener('click', () => { restoreSession(session); resumeBtn.style.display = 'none'; });
    }
}

/* ===== 事件绑定 ===== */
startBtn.addEventListener('click', () => startQuiz());
retryBtn.addEventListener('click', resetToConfig);
wrongRetryBtn.addEventListener('click', startWrongQuiz);
wrongClearBtn.addEventListener('click', async () => {
    if (!confirm('确定要清空所有错题记录吗？')) return;
    await fetch('/api/wrong', { method: 'DELETE' });
    renderWrongQuestions();
});
historyClearBtn.addEventListener('click', () => {
    if (!confirm('确定要清空所有成绩历史吗？')) return;
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    renderScoreHistory();
});
prevBtn.addEventListener('click', goToPrev);
nextBtn.addEventListener('click', goToNext);
submitBtn.addEventListener('click', submitQuiz);

// 搜索
searchBtn.addEventListener('click', () => startQuiz());
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') startQuiz(); });

document.addEventListener('DOMContentLoaded', () => {
    loadBanks();
    checkResume();
    renderWrongQuestions();
    renderScoreHistory();
});

/* ===== 键盘快捷键 ===== */
document.addEventListener('keydown', (e) => {
    if (quizSection.style.display === 'none') return;
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') goToPrev();
    else if (e.key === 'ArrowRight') goToNext();
    else if (e.key === 'Enter' && submitBtn.style.display !== 'none') submitQuiz();
    const num = parseInt(e.key);
    if (num >= 1 && num <= 6 && !submitted) {
        const items = $all('.option-item');
        if (items[num - 1]) items[num - 1].click();
    }
});
