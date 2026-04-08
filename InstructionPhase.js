// InstructionPhase.js
// Runs a guided instruction sequence before the main experiment.
// Shows one demo trial for each of the three conditions using predetermined choices.
// Integrates with the existing ImageLoader, TrialManager, and CONFIG.

class InstructionPhase {

    // ── CONFIGURE DEMO RESPONSES HERE ──────────────────────────────────────────
    // One entry per condition, shown in this order.
    // yourChoice / partnerChoice must each be one of:
    //   choice1Position  OR  choice2Position  for that trial.
    // Positions: 'up' | 'down' | 'left' | 'right'
    // ───────────────────────────────────────────────────────────────────────────
    static DEMO_TRIALS = [
        {
            conditionLabel:   'Same (+)',
            symbolId:         1,                    // + symbol
            chartId:          'delta05_S8',          // 6 vs 2 points
            choice1Position:  'left',
            choice2Position:  'right',
            yourChoice:       'left',               // ← edit freely
            partnerChoice:    'right',              // ← edit freely
            descriptionLines: [
                'SAME SLICE  (+)',
                '',
                'You and your partner must pick SAME slices.',
                'Only then do both players earn points.',
            ],
        },
        {
            conditionLabel:   'Difference (×)',
            symbolId:         2,                    // × symbol
            chartId:          'delta05_S8',
            choice1Position:  'up',
            choice2Position:  'down',
            yourChoice:       'up',                 // ← edit freely
            partnerChoice:    'up',                 // ← edit freely (same = points for anti-coord)
            descriptionLines: [
                'DIFFERENT SLICES (×)',
                '',
                'You and your partner must pick the DIFFERENT slice.',
                'Only then do both players earn points.',
            ],
        },
        {
            conditionLabel:   'QUICKER (△)',
            symbolId:         3,                    // △ symbol
            chartId:          'delta05_S8',
            choice1Position:  'left',
            choice2Position:  'right',
            yourChoice:       'left',               // ← edit freely
            partnerChoice:    'right',              // ← edit freely
            descriptionLines: [
                'QUICKER SLICE  (△)',
                '',
                'Only the FIRST player to choose earns points.',
                'In this demo you respond first.',
            ],
        },
    ];
    // ───────────────────────────────────────────────────────────────────────────


    // ── TEXT PAGES SHOWN BEFORE THE DEMOS ──────────────────────────────────────
    static INTRO_PAGES = [
        'Welcome to the experiment!\n\nYou and a partner will see a pie chart\nshowing how points can be split between you.\n\nUse the ARROW KEYS to choose a colored slice.\n\nPress SPACE to continue.',
        'There are three types of trials.\nEach trial type is shown by a different cue symbol.\nThe cue tells you the rules for earning points.\n\nPress SPACE to see each game type.',
    ];
    // ───────────────────────────────────────────────────────────────────────────


    constructor(canvas, ctx, imageLoader, trialManager) {
        this.canvas       = canvas;
        this.ctx          = ctx;
        this.imageLoader  = imageLoader;
        this.trialManager = trialManager;
        this.onComplete   = null;

        // Internal state
        this._state          = 'intro';
        this._introPageIdx   = 0;
        this._demoIdx        = 0;
        this._subPhaseStart  = 0;
        this._keyPressed     = '';
        this._animId         = null;
        this._keyHandler     = (e) => { this._keyPressed = e.key.toLowerCase(); };
    }


    // ── PUBLIC API ──────────────────────────────────────────────────────────────

    /** Call this to begin the instruction phase.
     *  @param {Function} onComplete  called when the player presses SPACE on the final page */
    start(onComplete) {
        this.onComplete = onComplete;
        document.addEventListener('keydown', this._keyHandler);
        this._setState('intro');
        this._animId = requestAnimationFrame(() => this._loop());
    }


    // ── INTERNAL HELPERS ────────────────────────────────────────────────────────

    _setState(s) {
        this._state         = s;
        this._subPhaseStart = Date.now();
    }

    _elapsed()  { return Date.now() - this._subPhaseStart; }

    _consumeKey() {
        let k = this._keyPressed;
        this._keyPressed = '';
        return k;
    }

    _getDemo()  { return InstructionPhase.DEMO_TRIALS[this._demoIdx]; }

    _getChart(chartId)   { return this.trialManager.charts.find(c => c.id === chartId); }

    _getSymbolImg(symId) { return this.imageLoader.getSymbolImage(symId); }

    _stop() {
        document.removeEventListener('keydown', this._keyHandler);
        cancelAnimationFrame(this._animId);
        if (this.onComplete) this.onComplete();
    }

    // Advance to next demo or final screen after a demo's feedback ends
    _advanceDemoOrFinish() {
        this._demoIdx++;
        if (this._demoIdx < InstructionPhase.DEMO_TRIALS.length) {
            this._setState('demo_intro');
        } else {
            this._setState('done');
        }
    }


    // ── MAIN LOOP ───────────────────────────────────────────────────────────────

    _loop() {
        let ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;

        // Clear canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);

        let key     = this._consumeKey();
        let elapsed = this._elapsed();

        switch (this._state) {

            // ---- Text intro pages (press SPACE to advance) ----
            case 'intro':
                this._renderIntroPage(InstructionPhase.INTRO_PAGES[this._introPageIdx]);
                if (key === ' ') {
                    this._introPageIdx++;
                    if (this._introPageIdx >= InstructionPhase.INTRO_PAGES.length) {
                        this._setState('demo_intro');
                    } else {
                        this._subPhaseStart = Date.now(); // reset timer, stay in 'intro'
                    }
                }
                break;

            // ---- Condition description page (press SPACE to watch demo) ----
            case 'demo_intro':
                this._renderDemoIntro(this._getDemo());
                if (key === ' ') this._setState('baseline');
                break;

            // ---- Demo trial phases (auto-timed, mirroring real experiment) ----
            case 'baseline':
                this._renderBaseline();
                this._renderAnnotationBar('Baseline — the cue symbol shows the trial type');
                if (elapsed >= CONFIG.baselineDuration) this._setState('sample');
                break;

            case 'sample':
                this._renderSample();
                this._renderAnnotationBar('Sample — see the total points and their split');
                if (elapsed >= CONFIG.sampleDuration) this._setState('delay');
                break;

            case 'delay':
                this._renderDelay();
                this._renderAnnotationBar('Delay — prepare your response');
                if (elapsed >= CONFIG.delayDuration) this._setState('decision');
                break;

            case 'decision':
                // Show the choices immediately; reveal the pre-set choice after 800 ms
                this._renderDecision(elapsed >= 800);
                this._renderAnnotationBar('Decision — choose a slice with the arrow keys');
                if (elapsed >= CONFIG.decisionDuration) this._setState('feedback');
                break;

            case 'feedback':
                this._renderFeedback();
                this._renderAnnotationBar('Feedback — see what both players chose and earned');
                if (elapsed >= CONFIG.feedbackDuration) this._advanceDemoOrFinish();
                break;

            // ---- Final page ----
            case 'done':
                this._renderDone();
                if (key === ' ') { this._stop(); return; }
                break;
        }

        this._animId = requestAnimationFrame(() => this._loop());
    }


    // ── RENDER HELPERS ──────────────────────────────────────────────────────────

    /** Dark banner at the top of the canvas describing the current phase */
    _renderAnnotationBar(text) {
        let ctx = this.ctx, w = this.canvas.width;
        ctx.fillStyle = 'rgba(0,0,0,0.70)';
        ctx.fillRect(0, 0, w, 36);
        ctx.fillStyle  = '#FFFFFF';
        ctx.font       = '15px Arial';
        ctx.textAlign  = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, 18);
    }

    /** Progress indicator — e.g. "Demo 1 / 3" — shown on demo trial sub-phases */
    _renderDemoProgress() {
        let ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        ctx.fillStyle  = '#888888';
        ctx.font       = '13px Arial';
        ctx.textAlign  = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(
            'Demo ' + (this._demoIdx + 1) + ' / ' + InstructionPhase.DEMO_TRIALS.length,
            w - 12, 10
        );
    }

    /** Multi-line centered text block */
    _drawCenteredText(text, centerY, font, color) {
        let ctx = this.ctx, w = this.canvas.width;
        ctx.fillStyle    = color || '#000000';
        ctx.font         = font  || '22px Arial';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        let lines   = text.split('\n');
        let lineH   = parseInt(font || '22') * 1.45;
        let startY  = centerY - (lines.length - 1) * lineH / 2;
        lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineH));
    }

    /** Legend in bottom-left corner (same as experiment.js renderLegend) */
    _renderLegend() {
        let ctx      = this.ctx;
        let symbols  = this.trialManager.symbols;
        let labels = {
            1: 'Anticoordination',
            2: 'Coordination',
            3: 'Competition'
        };
        let iconSize = 24, rowH = 32, x = 10;
        let startY   = this.canvas.height - symbols.length * rowH - 10;
        symbols.forEach((s, i) => {
            let img = this.imageLoader.getSymbolImage(s.id);
            let y   = startY + i * rowH;
            if (img) ctx.drawImage(img, x, y, iconSize, iconSize);
            ctx.fillStyle    = '#333333';
            ctx.font         = '14px Arial';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[s.id], x + iconSize + 8, y + iconSize / 2);
        });
    }


    // ── INDIVIDUAL STATE RENDERERS ───────────────────────────────────────────────

    _renderIntroPage(text) {
        this._drawCenteredText(text, this.canvas.height / 2, '22px Arial');
    }

    _renderDemoIntro(demo) {
        let ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;

        // Condition symbol icon centred near the top
        let symImg = this._getSymbolImg(demo.symbolId);
        if (symImg) ctx.drawImage(symImg, w / 2 - 20, 80, 40, 40);

        // Condition name
        ctx.fillStyle    = '#000000';
        ctx.font         = 'bold 26px Arial';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(demo.conditionLabel, w / 2, 150);

        // Description lines
        ctx.font = '20px Arial';
        demo.descriptionLines.forEach((line, i) => {
            ctx.fillText(line, w / 2, 220 + i * 34);
        });

        // Which demo number this is
        ctx.fillStyle = '#888888';
        ctx.font      = '15px Arial';
        ctx.fillText(
            'Demo ' + (this._demoIdx + 1) + ' of ' + InstructionPhase.DEMO_TRIALS.length,
            w / 2, h - 100
        );

        // Prompt
        ctx.fillStyle = '#555555';
        ctx.font      = '18px Arial';
        ctx.fillText('Press SPACE to watch the demo trial', w / 2, h - 60);
    }

    _renderBaseline() {
        let demo   = this._getDemo();
        let symImg = this._getSymbolImg(demo.symbolId);
        let cx = this.canvas.width / 2, cy = this.canvas.height / 2;
        if (symImg) this.ctx.drawImage(symImg, cx - 16, cy - 16, 32, 32);
        this._renderLegend();
        this._renderDemoProgress();
    }

    _renderSample() {
        let demo  = this._getDemo();
        let chart = this._getChart(demo.chartId);
        let img   = this.imageLoader.getChartImage(demo.chartId, 'sample');
        let iw = 128, ih = 128;
        let cx = this.canvas.width / 2, cy = this.canvas.height / 2;

        if (img) this.ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);

        if (chart) {
            this.ctx.fillStyle    = '#000000';
            this.ctx.font         = 'bold 16px Arial';
            this.ctx.textAlign    = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(
                'Total: ' + (chart.largerpoints + chart.smallerpoints),
                cx, cy - ih / 2 - 18
            );
        }
        this._renderDemoProgress();
    }

    _renderDelay() {
        let demo   = this._getDemo();
        let symImg = this._getSymbolImg(demo.symbolId);
        let cx = this.canvas.width / 2, cy = this.canvas.height / 2;
        if (symImg) this.ctx.drawImage(symImg, cx - 16, cy - 16, 32, 32);
        this._renderLegend();
        this._renderDemoProgress();
    }

    /** showChoice: reveal the predetermined choice (green border + label) */
    _renderDecision(showChoice) {
        let demo = this._getDemo();
        let ctx  = this.ctx, w = this.canvas.width, h = this.canvas.height;
        this._renderLegend();
        this._renderDemoProgress();

        let pos1 = this.trialManager.getPositionCoords(demo.choice1Position, w, h);
        let pos2 = this.trialManager.getPositionCoords(demo.choice2Position, w, h);
        let img1 = this.imageLoader.getChartImage(demo.chartId, 'choice1');
        let img2 = this.imageLoader.getChartImage(demo.chartId, 'choice2');

        if (img1) ctx.drawImage(img1, pos1.x - 64, pos1.y - 64, 128, 128);
        if (img2) ctx.drawImage(img2, pos2.x - 64, pos2.y - 64, 128, 128);

        if (showChoice) {
            // Your choice — green border
            let yourPos = this.trialManager.getPositionCoords(demo.yourChoice, w, h);
            ctx.strokeStyle = '#006400';
            ctx.lineWidth   = 4;
            ctx.strokeRect(yourPos.x - 68, yourPos.y - 68, 136, 136);
            ctx.fillStyle    = '#006400';
            ctx.font         = 'bold 14px Arial';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('YOU', yourPos.x, yourPos.y + 80);
        }
    }

    _renderFeedback() {
        let demo  = this._getDemo();
        let chart = this._getChart(demo.chartId);
        let ctx   = this.ctx, w = this.canvas.width, h = this.canvas.height;

        let leftX = w / 3, rightX = w * 2 / 3;
        let imageY      = h / 2 - 80;
        let pointsLabelY = h / 2 + 80;
        let earningsY   = h / 2 + 130;

        let p1 = chart.largerpoints, p2 = chart.smallerpoints;
        let yc = demo.yourChoice, pc = demo.partnerChoice;
        let c1 = demo.choice1Position;
        let sid = demo.symbolId;

        // Calculate points using same rules as experiment.js renderFeedback
        let yourPoints = 0, partnerPoints = 0;
        if (sid === 1) {            // coordination: need DIFFERENT choices
            if (yc !== pc) {
                yourPoints    = (yc === c1) ? p1 : p2;
                partnerPoints = (pc === c1) ? p1 : p2;
            }
        } else if (sid === 2) {     // anti-coord: need SAME choice
            if (yc === pc) {
                yourPoints    = (yc === c1) ? p1 : p2;
                partnerPoints = yourPoints;
            }
        } else if (sid === 3) {     // competition: in demo, you always win
            yourPoints    = (yc === c1) ? p1 : p2;
            partnerPoints = 0;
        }

        // ---- Your choice (left) ----
        let yourResultImg = (yc === c1)
            ? this.imageLoader.getChartImage(demo.chartId, 'result1')
            : this.imageLoader.getChartImage(demo.chartId, 'result2');
        let yourPtVal = (yc === c1) ? p1 : p2;

        if (yourResultImg) ctx.drawImage(yourResultImg, leftX - 100, imageY - 100, 200, 200);
        ctx.strokeStyle = '#006400'; ctx.lineWidth = 3;
        ctx.strokeRect(leftX - 100, imageY - 100, 200, 200);

        ctx.fillStyle = '#000000'; ctx.font = '20px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Points: ' + yourPtVal, leftX, pointsLabelY);

        ctx.fillStyle = '#006400';
        ctx.fillText('You got: ' + yourPoints + ' pts', leftX, earningsY);

        // ---- Partner choice (right) ----
        let partnerResultImg = (pc === c1)
            ? this.imageLoader.getChartImage(demo.chartId, 'result1')
            : this.imageLoader.getChartImage(demo.chartId, 'result2');
        let partnerPtVal = (pc === c1) ? p1 : p2;

        if (partnerResultImg) ctx.drawImage(partnerResultImg, rightX - 100, imageY - 100, 200, 200);
        ctx.strokeStyle = '#4B0082'; ctx.lineWidth = 1;
        ctx.strokeRect(rightX - 100, imageY - 100, 200, 200);

        ctx.fillStyle = '#000000';
        ctx.fillText('Points: ' + partnerPtVal, rightX, pointsLabelY);

        ctx.fillStyle = '#4B0082';
        ctx.fillText('Partner got: ' + partnerPoints + ' pts', rightX, earningsY);

        this._renderDemoProgress();
    }

    _renderDone() {
        this._drawCenteredText(
            'You have seen all three game types.\n\nWhen both you and your partner are ready,\nthe real experiment will begin.\n\nPress SPACE when you are ready.',
            this.canvas.height / 2,
            '22px Arial'
        );
    }
}