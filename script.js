/**
 * script.js — ProctorAI Exam Behavior Tracker + Webcam Head Detection
 *
 * Features:
 *   1. WEBCAM GATE — exam won't start without webcam permission
 *   2. 5-STRIKE RULE — 5 total violations = auto-submit and exit
 *   3. Copy/Paste BLOCKED on text answers with violation warning
 *   4. Tab switch, idle time, answer changes, head movements tracked
 *   5. MediaPipe Face Mesh for head pose detection
 *   6. Supports both MCQ and writing (text) questions
 */
(function () {
    "use strict";

    const MAX_VIOLATIONS = 5;

    // ── State ────────────────────────────────────────────────────────────
    const state = {
        currentQuestion: 0,
        totalQuestions:   0,
        answers:          {},      // MCQ answers
        textAnswers:      {},      // Text question answers
        answerChanges:    0,
        tabSwitches:      0,
        copyPasteCount:   0,
        idleTime:         0,
        headMovements:    0,
        violationCount:   0,       // total violations (all types)
        questionTimes:    [],
        questionStart:    Date.now(),
        lastActivity:     Date.now(),
        submitted:        false,
        faceDetected:     false,
        lastHeadOk:       true,
        webcamReady:      false,
        examStarted:      false,
    };

    // ── DOM References ───────────────────────────────────────────────────
    const questionBlocks  = document.querySelectorAll(".question-block");
    const prevBtn         = document.getElementById("prevBtn");
    const nextBtn         = document.getElementById("nextBtn");
    const submitBtn       = document.getElementById("submitBtn");
    const dotsContainer   = document.getElementById("questionDots");
    const timerText       = document.getElementById("timerText");
    const alertContainer  = document.getElementById("alertContainer");
    const currentQNum     = document.getElementById("currentQNum");
    const webcamGate      = document.getElementById("webcamGate");
    const examStatusBar   = document.getElementById("examStatusBar");
    const examLayout      = document.getElementById("examLayout");
    const violationOverlay = document.getElementById("violationOverlay");
    const violationDetail  = document.getElementById("violationDetail");
    const vCountEl        = document.getElementById("vCount");

    // Monitoring sidebar
    const metricTabs     = document.getElementById("metricTabs");
    const metricIdle     = document.getElementById("metricIdle");
    const metricChanges  = document.getElementById("metricChanges");
    const metricCopy     = document.getElementById("metricCopy");
    const metricHead     = document.getElementById("metricHead");
    const metricHeadSide = document.getElementById("metricHeadSide");
    const faceStatus     = document.getElementById("faceStatus");
    const threatFill     = document.getElementById("threatFill");
    const threatText     = document.getElementById("threatText");
    const webcamStatus   = document.getElementById("webcamStatus");

    state.totalQuestions = questionBlocks.length;

    // ══════════════════════════════════════════════════════════════════════
    // VIOLATION SYSTEM — 5 strikes = auto-submit
    // ══════════════════════════════════════════════════════════════════════

    function addViolation(reason) {
        if (state.submitted) return;
        state.violationCount++;
        if (vCountEl) vCountEl.textContent = state.violationCount;

        // Flash the counter red
        const counter = document.getElementById("violationCounter");
        if (counter) {
            counter.classList.add("v-flash");
            setTimeout(() => counter.classList.remove("v-flash"), 600);
        }

        showAlert(`⚠ VIOLATION ${state.violationCount}/5 — ${reason}`);

        if (state.violationCount >= MAX_VIOLATIONS) {
            autoSubmitExam();
        }
    }

    async function autoSubmitExam() {
        if (state.submitted) return;
        state.submitted = true;

        // Show violation overlay
        if (violationOverlay) {
            violationOverlay.style.display = "flex";
            if (violationDetail) {
                violationDetail.textContent = `Violations: Tab switches (${state.tabSwitches}), Copy/Paste (${state.copyPasteCount}), Head moves (${state.headMovements})`;
            }
        }

        // Send the exam data
        await sendExamData(true);

        // Stop webcam
        const videoEl = document.getElementById("webcamVideo");
        if (videoEl && videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(t => t.stop());
        }

        // Redirect after delay
        setTimeout(() => {
            window.location.href = "/result";
        }, 4000);
    }

    // ══════════════════════════════════════════════════════════════════════
    // WEBCAM GATE — must allow webcam before exam starts
    // ══════════════════════════════════════════════════════════════════════

    window.requestWebcam = function() {
        const gateStatus = document.getElementById("gateStatus");
        const enableBtn  = document.getElementById("enableCamBtn");

        enableBtn.textContent = "[ INITIALIZING... ]";
        enableBtn.classList.add("loading");

        navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: "user" } })
            .then(stream => {
                const videoEl = document.getElementById("webcamVideo");
                videoEl.srcObject = stream;
                videoEl.play();
                state.webcamReady = true;

                // Hide gate, show exam
                webcamGate.style.display = "none";
                examStatusBar.style.display = "flex";
                examLayout.style.display = "flex";
                state.examStarted = true;
                state.questionStart = Date.now();

                // Initialize face mesh after webcam is ready
                setTimeout(initFaceMesh, 500);
            })
            .catch(err => {
                console.error("Webcam denied:", err);
                if (gateStatus) {
                    gateStatus.textContent = "❌ CAMERA ACCESS DENIED — You cannot take this exam without webcam.";
                    gateStatus.style.color = "var(--red)";
                }
                enableBtn.textContent = "[ TRY AGAIN ]";
                enableBtn.classList.remove("loading");
            });
    };

    // ══════════════════════════════════════════════════════════════════════
    // QUESTION NAVIGATION
    // ══════════════════════════════════════════════════════════════════════

    // Initialize dots
    for (let i = 0; i < state.totalQuestions; i++) {
        const dot = document.createElement("div");
        dot.className = "q-dot" + (i === 0 ? " active" : "");
        dot.title = `Question ${i + 1}`;
        dot.addEventListener("click", () => goToQuestion(i));
        dotsContainer.appendChild(dot);
    }

    function goToQuestion(index) {
        // Save current text answer before navigating
        saveCurrentTextAnswer();

        const elapsed = (Date.now() - state.questionStart) / 1000;
        state.questionTimes[state.currentQuestion] =
            (state.questionTimes[state.currentQuestion] || 0) + elapsed;

        questionBlocks[state.currentQuestion].style.display = "none";
        questionBlocks[index].style.display = "block";
        state.currentQuestion = index;
        state.questionStart = Date.now();

        currentQNum.textContent = index + 1;
        updateDots();
        updateNavButtons();
    }

    function saveCurrentTextAnswer() {
        const block = questionBlocks[state.currentQuestion];
        if (block && block.dataset.type === "text") {
            const qid = block.dataset.qid;
            const textarea = document.getElementById("textq" + qid);
            if (textarea) {
                state.textAnswers[qid] = textarea.value;
            }
        }
    }

    function updateDots() {
        const dots = dotsContainer.children;
        for (let i = 0; i < dots.length; i++) {
            const block = questionBlocks[i];
            const qid = parseInt(block.dataset.qid);
            const isText = block.dataset.type === "text";
            const answered = isText ? !!state.textAnswers[qid] : !!state.answers[qid];

            dots[i].classList.toggle("active", i === state.currentQuestion);
            dots[i].classList.toggle("answered", answered);
        }
    }

    function updateNavButtons() {
        prevBtn.disabled = state.currentQuestion === 0;
        if (state.currentQuestion === state.totalQuestions - 1) {
            nextBtn.style.display   = "none";
            submitBtn.style.display = "inline-flex";
        } else {
            nextBtn.style.display   = "inline-flex";
            submitBtn.style.display = "none";
        }
    }

    prevBtn.addEventListener("click", () => {
        if (state.currentQuestion > 0) goToQuestion(state.currentQuestion - 1);
    });
    nextBtn.addEventListener("click", () => {
        if (state.currentQuestion < state.totalQuestions - 1)
            goToQuestion(state.currentQuestion + 1);
    });

    // ── MCQ Answer Tracking ──────────────────────────────────────────────
    document.querySelectorAll('.option-card input[type="radio"]').forEach((radio) => {
        radio.addEventListener("change", function () {
            const qid = this.name.replace("q", "");
            if (state.answers[qid] && state.answers[qid] !== this.value) {
                state.answerChanges++;
                updateMetrics();
            }
            state.answers[qid] = this.value;
            updateDots();
        });
    });

    // ── Text Answer Character Count ──────────────────────────────────────
    document.querySelectorAll(".text-answer").forEach((textarea) => {
        const qid = textarea.id.replace("textq", "");
        textarea.addEventListener("input", function () {
            state.textAnswers[qid] = this.value;
            const countEl = document.getElementById("charCount" + qid);
            if (countEl) countEl.textContent = this.value.length + " characters";
            updateDots();
        });
    });

    // ══════════════════════════════════════════════════════════════════════
    // COPY / PASTE BLOCKING — with violation counter
    // ══════════════════════════════════════════════════════════════════════

    ["copy", "cut", "paste"].forEach(evt => {
        document.addEventListener(evt, function (e) {
            if (state.submitted || !state.examStarted) return;
            e.preventDefault();
            state.copyPasteCount++;
            updateMetrics();
            addViolation(`${evt.toUpperCase()} attempt blocked!`);
        });
    });

    // Also block via keyboard shortcuts on textareas
    document.addEventListener("keydown", function(e) {
        if (!state.examStarted || state.submitted) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V' || e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) {
            // Only block on text answer areas
            if (e.target.classList.contains("text-answer")) {
                e.preventDefault();
                state.copyPasteCount++;
                updateMetrics();
                addViolation(`Keyboard ${e.key.toUpperCase()} shortcut blocked!`);
            }
        }
    });

    // ── Tab Switch Detection ─────────────────────────────────────────────
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && !state.submitted && state.examStarted) {
            state.tabSwitches++;
            updateMetrics();
            addViolation("Tab switch detected!");
        }
    });

    // ── Idle Time Tracking ───────────────────────────────────────────────
    ["mousemove", "keydown", "click", "scroll"].forEach((evt) => {
        document.addEventListener(evt, () => { state.lastActivity = Date.now(); });
    });

    setInterval(() => {
        if (state.submitted || !state.examStarted) return;
        const idleSecs = (Date.now() - state.lastActivity) / 1000;
        if (idleSecs > 3) {
            state.idleTime += 1;
            updateMetrics();
        }
    }, 1000);

    // ── Timer Display ────────────────────────────────────────────────────
    setInterval(() => {
        if (state.submitted || !state.examStarted) return;
        const elapsed = Math.floor((Date.now() - state.questionStart) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
        const s = String(elapsed % 60).padStart(2, "0");
        timerText.textContent = `${m}:${s}`;
    }, 500);

    // ── Update Metrics ───────────────────────────────────────────────────
    function updateMetrics() {
        if (metricTabs)     metricTabs.textContent     = state.tabSwitches;
        if (metricIdle)     metricIdle.textContent     = Math.round(state.idleTime) + "s";
        if (metricChanges)  metricChanges.textContent  = state.answerChanges;
        if (metricCopy)     metricCopy.textContent     = state.copyPasteCount;
        if (metricHead)     metricHead.textContent     = state.headMovements;
        if (metricHeadSide) metricHeadSide.textContent = state.headMovements;

        const score = state.tabSwitches * 3 + state.copyPasteCount * 5 +
                      state.headMovements * 2 + Math.floor(state.idleTime / 15);
        const pct = Math.min(score * 2, 100);
        if (threatFill) {
            threatFill.style.width = pct + "%";
            if (pct < 30) { threatFill.style.background = "var(--green)"; threatText.textContent = "LOW"; threatText.style.color = "var(--green)"; }
            else if (pct < 60) { threatFill.style.background = "var(--amber)"; threatText.textContent = "MEDIUM"; threatText.style.color = "var(--amber)"; }
            else { threatFill.style.background = "var(--red)"; threatText.textContent = "HIGH"; threatText.style.color = "var(--red)"; }
        }
    }

    // ── Alert Banners ────────────────────────────────────────────────────
    function showAlert(message) {
        const banner = document.createElement("div");
        banner.className = "alert-banner";
        banner.textContent = message;
        alertContainer.appendChild(banner);
        setTimeout(() => banner.remove(), 4000);
    }

    // ══════════════════════════════════════════════════════════════════════
    // WEBCAM + MEDIAPIPE FACE MESH — Head Pose Detection
    // ══════════════════════════════════════════════════════════════════════

    const YAW_THRESHOLD   = 25;
    const PITCH_THRESHOLD = 20;
    let lastHeadEventTime = 0;
    const HEAD_COOLDOWN_MS = 2000;

    function initFaceMesh() {
        const videoEl = document.getElementById("webcamVideo");
        const canvasEl = document.getElementById("webcamOverlay");
        const canvasCtx = canvasEl ? canvasEl.getContext("2d") : null;

        if (typeof FaceMesh === "undefined") {
            if (webcamStatus) webcamStatus.textContent = "FACE MESH LOADING...";
            setTimeout(initFaceMesh, 500);
            return;
        }

        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        faceMesh.onResults(function(results) {
            if (!canvasCtx) return;
            canvasEl.width  = results.image.width  || 320;
            canvasEl.height = results.image.height || 240;
            canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);

            if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
                state.faceDetected = false;
                if (faceStatus) { faceStatus.textContent = "NO"; faceStatus.className = "metric-val face-no"; }

                const now = Date.now();
                if (now - lastHeadEventTime > HEAD_COOLDOWN_MS) {
                    state.headMovements++;
                    lastHeadEventTime = now;
                    updateMetrics();
                    addViolation("Face not detected — look at the screen!");
                }
                return;
            }

            state.faceDetected = true;
            if (faceStatus) { faceStatus.textContent = "YES"; faceStatus.className = "metric-val face-ok"; }
            if (webcamStatus) webcamStatus.textContent = "ACTIVE";

            const landmarks = results.multiFaceLandmarks[0];
            canvasCtx.strokeStyle = "rgba(0, 255, 65, 0.5)";
            canvasCtx.lineWidth = 1;
            drawFaceOutline(canvasCtx, canvasEl, landmarks);

            const noseTip  = landmarks[1];
            const chin     = landmarks[152];
            const leftEye  = landmarks[33];
            const rightEye = landmarks[263];
            const forehead = landmarks[10];

            const eyeMidX = (leftEye.x + rightEye.x) / 2;
            const eyeDist = Math.abs(rightEye.x - leftEye.x);
            const yawRatio = (noseTip.x - eyeMidX) / (eyeDist || 0.001);
            const yaw = yawRatio * 90;

            const faceMidY = (forehead.y + chin.y) / 2;
            const faceHeight = Math.abs(chin.y - forehead.y);
            const pitchRatio = (noseTip.y - faceMidY) / (faceHeight || 0.001);
            const pitch = pitchRatio * 90;

            const lookingAway = Math.abs(yaw) > YAW_THRESHOLD || pitch > PITCH_THRESHOLD;

            if (lookingAway) {
                canvasCtx.fillStyle = "rgba(255, 45, 85, 0.3)";
                canvasCtx.fillRect(0, 0, canvasEl.width, canvasEl.height);
                canvasCtx.fillStyle = "#ff2d55";
                canvasCtx.font = "bold 12px 'Share Tech Mono', monospace";
                canvasCtx.fillText("⚠ LOOK AT SCREEN", 10, 20);
            } else {
                canvasCtx.fillStyle = "#00ff41";
                canvasCtx.font = "10px 'Share Tech Mono', monospace";
                canvasCtx.fillText("✓ OK", 10, 16);
            }

            const now = Date.now();
            if (lookingAway && state.lastHeadOk && now - lastHeadEventTime > HEAD_COOLDOWN_MS) {
                state.headMovements++;
                lastHeadEventTime = now;
                updateMetrics();
                addViolation("Head movement — face the screen!");
            }
            state.lastHeadOk = !lookingAway;
        });

        // Process frames
        async function processFrame() {
            if (!state.submitted) {
                await faceMesh.send({ image: videoEl });
            }
            requestAnimationFrame(processFrame);
        }
        processFrame();
        if (webcamStatus) webcamStatus.textContent = "ACTIVE";
    }

    function drawFaceOutline(ctx, canvas, landmarks) {
        const faceOval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
        ctx.beginPath();
        for (let i = 0; i < faceOval.length; i++) {
            const pt = landmarks[faceOval[i]];
            const x = pt.x * canvas.width;
            const y = pt.y * canvas.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // ══════════════════════════════════════════════════════════════════════
    // EXAM SUBMISSION
    // ══════════════════════════════════════════════════════════════════════

    async function sendExamData(isAutoSubmit) {
        // Save current text answer
        saveCurrentTextAnswer();

        // Record time for last question
        const elapsed = (Date.now() - state.questionStart) / 1000;
        state.questionTimes[state.currentQuestion] =
            (state.questionTimes[state.currentQuestion] || 0) + elapsed;

        const totalTime = state.questionTimes.reduce((a, b) => a + (b || 0), 0);
        const avgTime = state.totalQuestions > 0 ? totalTime / state.totalQuestions : 0;

        const payload = {
            answers:              state.answers,
            text_answers:         state.textAnswers,
            time_per_question:    parseFloat(avgTime.toFixed(2)),
            tab_switch_count:     state.tabSwitches,
            idle_time:            parseFloat(state.idleTime.toFixed(2)),
            answer_change_count:  state.answerChanges,
            copy_paste_attempts:  state.copyPasteCount,
            head_movement_count:  state.headMovements,
            violation_count:      state.violationCount,
            auto_submitted:       isAutoSubmit,
        };

        try {
            await fetch("/submit_exam", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } catch (err) {
            console.error("Submission error:", err);
        }
    }

    submitBtn.addEventListener("click", async () => {
        if (state.submitted) return;
        state.submitted = true;
        submitBtn.disabled = true;
        submitBtn.textContent = "[ SUBMITTING... ]";

        await sendExamData(false);

        // Stop webcam
        const videoEl = document.getElementById("webcamVideo");
        if (videoEl && videoEl.srcObject) {
            videoEl.srcObject.getTracks().forEach(t => t.stop());
        }

        window.location.href = "/result";
    });

    // ── Matrix Rain for exam page ────────────────────────────────────────
    (function(){
        const canvas = document.getElementById('matrix-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let W, H, cols, drops;
        const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*ﾊﾋｼﾀﾁﾃﾄﾘｳｺﾈ';
        const FS = 14;
        function init() {
            W = canvas.width = window.innerWidth;
            H = canvas.height = window.innerHeight;
            cols = Math.floor(W / FS);
            drops = Array.from({length: cols}, () => Math.random() * -80);
        }
        function draw() {
            ctx.fillStyle = 'rgba(2,13,2,0.055)';
            ctx.fillRect(0, 0, W, H);
            for (let i = 0; i < cols; i++) {
                const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
                const y = drops[i] * FS;
                ctx.fillStyle = '#afffcf';
                ctx.font = `bold ${FS}px "Share Tech Mono",monospace`;
                ctx.fillText(ch, i * FS, y);
                ctx.fillStyle = i % 5 === 0 ? '#00ff41' : '#00881a';
                ctx.font = `${FS}px "Share Tech Mono",monospace`;
                ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * FS, y - FS);
                if (y > H && Math.random() > 0.975) drops[i] = 0;
                drops[i] += 0.5;
            }
        }
        init();
        setInterval(draw, 45);
        window.addEventListener('resize', init);
    })();

})();
