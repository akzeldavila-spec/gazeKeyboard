// TrialManager.js
// Handles all trial generation, randomization, and chart configuration

class TrialManager {
    constructor() {
        // Charts organized by (delta, S) combinations
        // Naming: delta_S (delta as fraction numerator for clarity)
        // List of chart objects 
        this.charts = [
            // S=8 variants
            {
                id: 'delta0_S8',
                delta: 0, S: 8,
                sample: 'stimuli/FourFour.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/RedFour.png',
                result2: 'stimuli/BlueFour.png',
                largerpoints: 4,
                smallerpoints: 4
            },
            {
                id: 'delta05_S8',
                delta: 0.5, S: 8,
                sample: 'stimuli/SixTwo.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/SixOption.png',
                result2: 'stimuli/TwoOption.png',
                largerpoints: 6,
                smallerpoints: 2
            },
            {
                id: 'delta025_S8',
                delta: 0.25, S: 8,
                sample: 'stimuli/FiveThreeChart.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/FiveOption.png',
                result2: 'stimuli/ThreeOption.png',
                largerpoints: 5,
                smallerpoints: 3
            },

            // S=16 variants
            {
                id: 'delta0_S16',
                delta: 0, S: 16,
                sample: 'stimuli/EightEight.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/RedFour.png',
                result2: 'stimuli/BlueFour.png',
                largerpoints: 8,
                smallerpoints: 8
            },
            {
                id: 'delta05_S16',
                delta: 0.5, S: 16,
                sample: 'stimuli/TwelveFour.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/SixOption.png',
                result2: 'stimuli/TwoOption.png',
                largerpoints: 12,
                smallerpoints: 4
            },
            {
                id: 'delta025_S16',
                delta: 0.25, S: 16,
                sample: 'stimuli/TenSix.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/FiveOption.png',
                result2: 'stimuli/ThreeOption.png',
                largerpoints: 10,
                smallerpoints: 6
            },
            {
                id: 'delta075_S16',
                delta: 0.75, S: 16,
                sample: 'stimuli/FourteenTwo.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/SevenOption.png',
                result2: 'stimuli/OneOption.png',
                largerpoints: 14,
                smallerpoints: 2
            },

            // S=32 variants
            {
                id: 'delta05_S32',
                delta: 0.5, S: 32,
                sample: 'stimuli/TwentyFourEight.png',
                choice1: 'stimuli/RedOption.png',
                choice2: 'stimuli/BlueOption.png',
                result1: 'stimuli/SixOption.png',
                result2: 'stimuli/TwoOption.png',
                largerpoints: 24,
                smallerpoints: 8
            }
        ];

        //list of symbol objects, with id and path for rendering and identification
        this.symbols = [
            { id: 1, path: 'stimuli/Anticoordination.png' },  
            { id: 2, path: 'stimuli/Coordination.png' },       
            { id: 3, path: 'stimuli/Compete.png' }
        ];

        this.trialSequence = [];
        this.currentTrialIndex = 0;

        // Phase boundary indices (set after generation)
        this.phase1Start = 0;
        this.phase2Start = 120;
        this.phase3Start = null;

        this.currentPhaseNum = 1;
    }

    buildTrialTiming() {
        return {
            baselineDuration: 1000,
            sampleDuration: 1000,
            delayDuration: 1000,
            decisionDuration: 2000,
            feedbackDuration: 2000,
            postFeedbackDelayDuration: 1000
        };
    }

    // Get chart by id string
    getChart(id) {
        return this.charts.find(c => c.id === id);
    }

    // Generate a block: all combos of chartIds x symbols x locationPairs x repeats, shuffled
    // locationPairs: number of counterbalanced location pairs (2 = up/down + down/up OR left/right + right/left)
    // Each "location counterbalance" = one pair (choice1, choice2), giving 4 total combos across 2 axes
    generateBlock(chartIds, repeats) {
        let allPositionCombos = [
            ['up', 'down'],
            ['down', 'up'],
            ['left', 'right'],
            ['right', 'left']
        ];

        let trials = [];

        for (let rep = 0; rep < repeats; rep++) {
            for (let ci = 0; ci < chartIds.length; ci++) {
                let chart = this.getChart(chartIds[ci]);
                // Shuffle position combos for each chart each rep
                let combos = this.shuffleArray(allPositionCombos);
                for (let pi = 0; pi < combos.length; pi++) {
                    for (let si = 0; si < this.symbols.length; si++) {
                        trials.push({
                            chartId: chart.id,
                            chart: chart,
                            choice1Position: combos[pi][0],
                            choice2Position: combos[pi][1],
                            symbol: this.symbols[si],
                            repetition: rep + 1,
                            timing: this.buildTrialTiming()
                        });
                    }
                }
            }
        }

        return this.shuffleArray(trials);
    }

    // Generate full 2-phase trial sequence
    generateTrials() {
        this.trialSequence = [];

        // --- PHASE 1: Training (120 trials) ---
        let phase1ChartIds = ['delta0_S8', 'delta05_S8', 'delta0_S16', 'delta05_S16'];
        let phase1Trials = this.generatePhase1Block(phase1ChartIds, 2);
        this.phase1Start = 0;

        // --- CATCH TRIAL 1 (1 trial, between phase 1 and phase 2) ---
        let catchTrial1 = this.generateCatchTrials(phase1ChartIds); 

        // --- PHASE 2: Testing (120 trials) ---
        let phase2ChartIds = ['delta025_S8', 'delta025_S16', 'delta075_S16', 'delta05_S32'];
        let phase2Trials = this.generatePhase1Block(phase2ChartIds, 2);
        this.phase2Start = phase1Trials.length + catchTrial1.length;

        this.phase3Start = null;
        this.trialSequence = [...phase1Trials, ...catchTrial1, ...phase2Trials];
        this.currentTrialIndex = 0;

        console.log('Trial sequence generated:',
            'Phase 1:', phase1Trials.length, 'trials |',
            'Catch 1:', catchTrial1.length, 'trial |',
            'Phase 2:', phase2Trials.length, 'trials |',
            'Total:', this.trialSequence.length
        );

        return this.trialSequence;
    }

    // Generate a single catch trial using a random chart from the given pool
    generateCatchTrials(chartIds, catchKey = 'g') {
        let positionCombos = [['up', 'down'], ['left', 'right']];
        let chartId = chartIds[Math.floor(Math.random() * chartIds.length)];
        let chart = this.getChart(chartId);
        let symbol = this.symbols[Math.floor(Math.random() * this.symbols.length)];
        let posCombo = positionCombos[Math.floor(Math.random() * positionCombos.length)];
        return [{
            chartId: chart.id,
            chart: chart,
            choice1Position: posCombo[0],
            choice2Position: posCombo[1],
            symbol: symbol,
            repetition: 0,
            timing: this.buildTrialTiming(),
            isCatchTrial: true,
            catchKey: catchKey
        }];
    }

    // Generate a phase block: nCharts * 3 symbols * 4 posCombos * repeats
    // All 4 combos used so each color appears at every position exactly once per repeat.
    generatePhase1Block(chartIds, repeats) {
        let positionCombos = [
            ['up', 'down'],
            ['down', 'up'],
            ['left', 'right'],
            ['right', 'left']
        ];

        let trials = [];

        for (let rep = 0; rep < repeats; rep++) {
            let repTrials = [];
            for (let ci = 0; ci < chartIds.length; ci++) {
                let chart = this.getChart(chartIds[ci]);
                for (let pi = 0; pi < positionCombos.length; pi++) {
                    for (let si = 0; si < this.symbols.length; si++) {
                        repTrials.push({
                            chartId: chart.id,
                            chart: chart,
                            choice1Position: positionCombos[pi][0],
                            choice2Position: positionCombos[pi][1],
                            symbol: this.symbols[si],
                            repetition: rep + 1,
                            timing: this.buildTrialTiming()
                        });
                    }
                }
            }
            trials.push(...this.shuffleArray(repTrials));
        }

        return trials;
    }

    // Get current phase number (1 or 2)
    getCurrentPhase() {
        let idx = this.currentTrialIndex;
        if (idx < this.phase2Start) return 1;
        return 2;
    }

    // Get current trial
    getCurrentTrial() {
        return this.trialSequence[this.currentTrialIndex];
    }

    // Move to next trial
    nextTrial() {
        this.currentTrialIndex++;
    }

    // Check if there are more trials
    hasMoreTrials() {
        return this.currentTrialIndex < this.trialSequence.length;
    }

    // Check if the current trial is the first in a new phase
    isPhaseTransition() {
        return (
            this.currentTrialIndex === this.phase2Start
        );
    }

    // Get total number of trials
    getTotalTrials() {
        return this.trialSequence.length;
    }

    // Get current trial number (1-indexed)
    getCurrentTrialNumber() {
        return this.currentTrialIndex + 1;
    }

    // Get position coordinates on canvas
    getPositionCoords(position, canvasWidth, canvasHeight) {
        if (position === 'up') {
            return { x: canvasWidth / 2, y: 150 };
        } else if (position === 'down') {
            return { x: canvasWidth / 2, y: canvasHeight - 150 };
        } else if (position === 'left') {
            return { x: 200, y: canvasHeight / 2 };
        } else if (position === 'right') {
            return { x: canvasWidth - 200, y: canvasHeight / 2 };
        }
        return { x: canvasWidth / 2, y: canvasHeight / 2 };
    }

    // Shuffle array (Fisher-Yates)
    shuffleArray(array) {
        let shuffled = array.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            let temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }
        return shuffled;
    }

    // Serialize trials for Firebase upload
    serializeTrials() {
        return this.trialSequence.map(trial => ({
            chartId: trial.chartId,
            choice1Position: trial.choice1Position,
            choice2Position: trial.choice2Position,
            symbolId: trial.symbol.id,
            repetition: trial.repetition,
            timing: trial.timing,
            isCatchTrial: trial.isCatchTrial || false,
            catchKey: trial.catchKey || null
        }));
    }

    // Load trials from serialized Firebase data
    loadTrialsFromData(serializedTrials) {
        this.trialSequence = serializedTrials.map(trialData => {
            let chart = this.charts.find(c => c.id === trialData.chartId);
            return {
                chartId: trialData.chartId,
                chart: chart,
                choice1Position: trialData.choice1Position,
                choice2Position: trialData.choice2Position,
                symbol: this.symbols.find(s => s.id === trialData.symbolId),
                repetition: trialData.repetition,
                timing: trialData.timing || this.buildTrialTiming(),
                isCatchTrial: trialData.isCatchTrial || false,
                catchKey: trialData.catchKey || null
            };
        });

        // Recompute phase boundaries from the loaded sequence.
        // Catch trial 1 sits between phase 1 and phase 2.
        let catchPositions = [];
        for (let i = 0; i < this.trialSequence.length; i++) {
            if (this.trialSequence[i].isCatchTrial) {
                catchPositions.push(i);
            }
        }
        if (catchPositions.length >= 1) {
            this.phase2Start = catchPositions[0] + 1;
        } else {
            this.phase2Start = 120;
        }
        this.phase3Start = null;

        this.currentTrialIndex = 0;
        console.log('Trials loaded from Firebase:', this.trialSequence.length, 'trials');
    }
}
