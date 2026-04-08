// QuizPhase.js
// Comprehension quiz shown after the instruction demo and before session ID entry.
// Tests 2 scenarios per condition (coordination, anti-coordination, competition).
// Wrong answers repeat until correct. On completion, calls onComplete().

class QuizPhase {

    // ── QUIZ QUESTIONS ──────────────────────────────────────────────────────────
    // Each question shows a chart image, describes what both players chose and
    // who chose first, then asks the user "How many points did YOU earn?"
    //
    // yourChoice / partnerChoice: 'left' | 'right' | 'up' | 'down'
    //   choice1Position on every chart in TrialManager maps to largerpoints,
    //   choice2Position maps to smallerpoints.
    //
    // correctPoints is computed from the condition rules:
    //   Coordination   (1): DIFFERENT choices → both earn points
    //   Anti-coord     (2): SAME choice       → both earn points
    //   Competition    (3): FIRST to choose   → only that player earns points
    // ───────────────────────────────────────────────────────────────────────────
    static QUESTIONS = [
        // ── COORDINATION (need SAME choice) ──
        {
            conditionLabel: 'Same  (+)',
            symbolId:       2,
            chartId:        'delta05_S8',       // 6 vs 2
            choice1Position:'left',
            choice2Position:'right',
            yourChoice:     'left',             // same as partner → coordination succeeds
            partnerChoice:  'left',
            youFirst:       true,
            correctPoints:  6,
            scenarioLines: [
                'The cue is  +  (Same).',
                'You picked the LEFT slice  (worth 6 pts).',
                'Your partner also picked the LEFT slice  (worth 6 pts).',
                'You chose first.',
                '',
                'How many points did YOU earn?',
            ],
        },
        {
            conditionLabel: 'Same  (+)',
            symbolId:       2,
            chartId:        'delta05_S8',       // 6 vs 2
            choice1Position:'left',
            choice2Position:'right',
            yourChoice:     'left',             // different → coordination fails → 0
            partnerChoice:  'right',
            youFirst:       true,
            correctPoints:  0,
            scenarioLines: [
                'The cue is  +  (Same).',
                'You picked the LEFT slice  (worth 6 pts).',
                'Your partner picked the RIGHT slice  (worth 2 pts).',
                'You chose first.',
                '',
                'How many points did YOU earn?',
            ],
        },

        // ── ANTI-COORDINATION (need DIFFERENT choices) ──
        {
            conditionLabel: 'Different (×)',
            symbolId:       1,
            chartId:        'delta025_S8',      // 5 vs 3
            choice1Position:'up',
            choice2Position:'down',
            yourChoice:     'up',               // different from partner → succeeds
            partnerChoice:  'down',
            youFirst:       false,
            correctPoints:  5,
            scenarioLines: [
                'The cue is  ×  (Different).',
                'You picked the UP slice  (worth 5 pts).',
                'Your partner picked the DOWN slice  (worth 3 pts).',
                'Your partner chose first.',
                '',
                'How many points did YOU earn?',
            ],
        },
        {
            conditionLabel: 'Different (×)',
            symbolId:       1,
            chartId:        'delta05_S8',       // 6 vs 2
            choice1Position:'left',
            choice2Position:'right',
            yourChoice:     'left',             // same → anti-coord fails → 0
            partnerChoice:  'left',
            youFirst:       true,
            correctPoints:  0,
            scenarioLines: [
                'The cue is  ×  (Different).',
                'You picked the LEFT slice  (worth 6 pts).',
                'Your partner also picked the LEFT slice  (worth 6 pts).',
                'You chose first.',
                '',
                'How many points did YOU earn?',
            ],
        },

        // -- COMPETITION (order only matters when SAME slice is picked) --
        {
            conditionLabel: 'Quicker (triangle)',
            symbolId:       3,
            chartId:        'delta05_S8',
            choice1Position:'left',
            choice2Position:'right',
            yourChoice:     'left',             // different slices -> both earn, order irrelevant
            partnerChoice:  'right',
            youFirst:       false,
            correctPoints:  6,
            scenarioLines: [
                'The cue is triangle (Quicker).',
                'You picked the LEFT slice  (worth 6 pts).',
                'Your partner picked the RIGHT slice  (worth 2 pts).',
                'Your partner chose first.',
                '',
                'How many points did YOU earn?',
            ],
        },
        {
            conditionLabel: 'Quicker (triangle)',
            symbolId:       3,
            chartId:        'delta05_S8',
            choice1Position:'left',
            choice2Position:'right',
            yourChoice:     'left',             // same slice, you first -> you earn
            partnerChoice:  'left',
            youFirst:       true,
            correctPoints:  6,
            scenarioLines: [
                'The cue is triangle (Quicker).',
                'You picked the LEFT slice  (worth 6 pts).',
                'Your partner also picked the LEFT slice  (worth 6 pts).',
                'You chose first.',
                '',
                'How many points did YOU earn?',
            ],
        },
        {
            conditionLabel: 'Quicker (triangle)',
            symbolId:       3,
            chartId:        'delta025_S8',
            choice1Position:'up',
            choice2Position:'down',
            yourChoice:     'up',               // same slice, partner first -> you earn 0
            partnerChoice:  'up',
            youFirst:       false,
            correctPoints:  0,
            scenarioLines: [
                'The cue is triangle (Quicker).',
                'You picked the UP slice  (worth 5 pts).',
                'Your partner also picked the UP slice  (worth 5 pts).',
                'Your partner chose first.',
                '',
                'How many points did YOU earn?',
            ],
        },
    ];
    // ───────────────────────────────────────────────────────────────────────────


    constructor(canvas, ctx, imageLoader, trialManager) {
        this.canvas      = canvas;
        this.ctx         = ctx;
        this.imageLoader = imageLoader;
        this.trialManager = trialManager;
        this.onComplete  = null;

        this._qIdx       = 0;       // current question index
        this._state      = 'question'; // 'question' | 'correct' | 'wrong'
        this._stateStart = 0;
        this._animId     = null;

        // HTML input overlay
        this._inputEl    = null;
        this._errorMsg   = '';
    }



    start(onComplete) {
        this.onComplete = onComplete;
        this._buildInput();
        this._showQuestion();
        this._animId = requestAnimationFrame(() => this._loop());
    }


    // ── INPUT ELEMENT ────────────────────────────────────────────────────────────

    _buildInput() {
        // Create a number input + submit button that floats over the canvas
        let wrap = document.createElement('div');
        wrap.id = 'quiz-input-wrap';
        wrap.style.cssText = [
            'position:absolute',
            'display:flex',
            'gap:8px',
            'align-items:center',
            'font-family:Arial,sans-serif',
        ].join(';');

        let input = document.createElement('input');
        input.type = 'number';
        input.min  = '0';
        input.placeholder = 'your points';
        input.style.cssText = [
            'width:110px',
            'padding:6px 10px',
            'font-size:18px',
            'border:2px solid #333',
            'border-radius:4px',
            'text-align:center',
        ].join(';');

        let btn = document.createElement('button');
        btn.textContent = 'Submit';
        btn.style.cssText = [
            'padding:6px 18px',
            'font-size:18px',
            'background:#222',
            'color:#fff',
            'border:none',
            'border-radius:4px',
            'cursor:pointer',
        ].join(';');

        btn.addEventListener('click', () => this._handleSubmit());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._handleSubmit();
        });

        wrap.appendChild(input);
        wrap.appendChild(btn);
        document.body.appendChild(wrap);

        this._inputEl  = input;
        this._inputWrap = wrap;

        this._repositionInput();
    }

    _repositionInput() {
        // Place the input just below the canvas
        let rect = this.canvas.getBoundingClientRect();
        this._inputWrap.style.left = rect.left + 'px';
        this._inputWrap.style.top  = (rect.top + rect.height + 12) + 'px';
    }

    _removeInput() {
        if (this._inputWrap && this._inputWrap.parentNode) {
            this._inputWrap.parentNode.removeChild(this._inputWrap);
        }
    }

    _handleSubmit() {
        let raw = this._inputEl.value.trim();
        if (raw === '') return;

        let answer = parseInt(raw, 10);
        let q = this._currentQ();

        if (answer === q.correctPoints) {
            this._errorMsg = '';
            this._setState('correct');
        } else {
            this._errorMsg = '✗  Incorrect. The answer was ' + q.correctPoints + ' pts.  Try again.';
            this._inputEl.value = '';
            this._setState('wrong');
        }
    }


    // ── STATE HELPERS ────────────────────────────────────────────────────────────

    _currentQ() { return QuizPhase.QUESTIONS[this._qIdx]; }

    _setState(s) {
        this._state      = s;
        this._stateStart = Date.now();
    }

    _showQuestion() {
        this._setState('question');
        this._errorMsg = '';
        if (this._inputEl) this._inputEl.value = '';
    }

    _advance() {
        this._qIdx++;
        if (this._qIdx >= QuizPhase.QUESTIONS.length) {
            this._finish();
        } else {
            this._showQuestion();
        }
    }

    _finish() {
        this._removeInput();
        cancelAnimationFrame(this._animId);
        if (this.onComplete) this.onComplete();
    }


    // ── MAIN LOOP ────────────────────────────────────────────────────────────────

    _loop() {
        let ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);

        switch (this._state) {
            case 'question':
            case 'wrong':
                this._renderQuestion();
                break;

            case 'correct':
                this._renderQuestion();
                this._renderCorrectOverlay();
                // Auto-advance after 1 s
                if (Date.now() - this._stateStart >= 1000) {
                    this._advance();
                }
                break;
        }

        this._animId = requestAnimationFrame(() => this._loop());
    }


    // ── RENDERERS ────────────────────────────────────────────────────────────────

    _renderQuestion() {
        let q   = this._currentQ();
        let ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;

        // ── Top bar: condition label + progress ──
        ctx.fillStyle = '#222222';
        ctx.fillRect(0, 0, w, 40);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(q.conditionLabel, w / 2, 20);

        ctx.textAlign = 'right';
        ctx.font = '13px Arial';
        ctx.fillText(
            'Question ' + (this._qIdx + 1) + ' / ' + QuizPhase.QUESTIONS.length,
            w - 12, 20
        );

        // ── Symbol icon (top-left) ──
        let symImg = this.imageLoader.getSymbolImage(q.symbolId);
        if (symImg) ctx.drawImage(symImg, 12, 52, 32, 32);

        // ── Chart image (sample view, centred) ──
        let chartImg = this.imageLoader.getChartImage(q.chartId, 'sample');
        let iw = 180, ih = 180;
        let chartX = w / 2 - iw / 2;
        let chartY = 55;
        if (chartImg) ctx.drawImage(chartImg, chartX, chartY, iw, ih);

        // Points total above chart
        let chart = this.trialManager.charts.find(c => c.id === q.chartId);
        if (chart) {
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Total: ' + (chart.largerpoints + chart.smallerpoints), w / 2, chartY - 14);
        }

        // ── Scenario text ──
        let lineH  = 26;
        let startY = chartY + ih + 30;
        ctx.fillStyle    = '#000000';
        ctx.font         = '19px Arial';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < q.scenarioLines.length; i++) {
            let line = q.scenarioLines[i];
            // Bold the last non-empty line (the question itself)
            if (i === q.scenarioLines.length - 1) {
                ctx.font = 'bold 20px Arial';
            }
            ctx.fillText(line, w / 2, startY + i * lineH);
        }

        // ── Error message ──
        if (this._errorMsg) {
            ctx.fillStyle = '#CC0000';
            ctx.font      = 'bold 17px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this._errorMsg, w / 2, startY + q.scenarioLines.length * lineH + 20);
        }

        // ── Reposition input in case window scrolled ──
        this._repositionInput();
    }

    _renderCorrectOverlay() {
        let ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.fillStyle = 'rgba(0, 120, 0, 0.18)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#006400';
        ctx.font      = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✓  Correct!', w / 2, h / 2);
    }
}