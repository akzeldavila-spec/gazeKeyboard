// experiment.js
// Main experiment logic

// Configuration
const CONFIG = {
    canvasWidth: 1024,
    canvasHeight: 768,
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
    sampleDuration: 1000,
    delayDuration: 1000,
    decisionDuration: 2000,
    feedbackDuration: 2000,
    postFeedbackDelayDuration: 1000,
    baselineDuration: 1000,
    startingTrialIndex: 0,  // Set to 0 for first trial, 1 for second trial, etc. (0-indexed)
    skipQuiz: true,         // TO RESTORE QUIZ+INSTRUCTIONS: change both flags to false
    skipInstructions: true  // TO RESTORE INSTRUCTIONS SCREEN: change to false
};

// Global objects
let canvas, ctx;
let trialManager;
let imageLoader;
let currentPhase = 'instructions';
let keyPressed = '';
let phaseStartTime = 0;
let decisionMade = false;
let decisionUploaded = false;
let instructionsShown = false;
let sessionInfo = null;
let partnerChoice = null;
let partnerTimestamp = null;
let yourDecisionTimestamp = null;
let bothPlayersReady = false;
let experimentStartTime = null;
let clientServerTimeDiff = 0;
let playerPressedSpace = false;
let bothPlayersPressedSpace = false;
let checkingSpacePress = false;
let sessionCleared = false;
let experimentWallStartTime = null;
let decisionTimestampMs = null;
let decisionLog = [];
let phaseLog = [];
let decisionPhaseStartTime = null;
let partnerDecisionFetched = false;
let syncedPhaseStartTime = null;  // Set from Firebase timestamp so both devices use identical phaseStartTime
let trialSyncReceived = false;    // Guard against waitForTrialSyncAndStart snapshot firing twice

// Phase tracking array
let phaseDurations = [];

// Points tracking array
let userPoints = [];

// Lottery phase state
let lotteryTrialIndex = null;
let lotteryYourPoints = null;
let lotteryPartnerPoints = null;
let lotteryPartnerFetched = false;

// Seeded random using session ID (ensures same trial for both players)
function seededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }

    hash = Math.abs(hash);
    return (hash * 1664525 + 1013904223) & 0xffffffff;
}

function init() {
    console.log('Initializing experiment...');
 
    // Create canvas FIRST — needed before InstructionPhase can render
    canvas = document.createElement('canvas');
    canvas.width = CONFIG.canvasWidth;
    canvas.height = CONFIG.canvasHeight;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    canvas.style.backgroundColor = CONFIG.backgroundColor;
    document.getElementById('root').appendChild(canvas);
    ctx = canvas.getContext('2d');
 
    // Create managers needed for the demo
    trialManager = new TrialManager();
    imageLoader  = new ImageLoader();
    trialManager.generateTrials();
 
    // Preload images, then run the demo
    imageLoader.preloadChartImages(trialManager.charts, function() {
        imageLoader.preloadSymbolImages(trialManager.symbols, function() {
            function startSession() {
                // TO RESTORE INTRO+QUIZ: set skipQuiz: false in CONFIG
                sessionInfo = getSessionInfo();
                console.log('Session:', sessionInfo.sessionId, 'Player:', sessionInfo.playerNum);
                displayWaitingScreen();
                registerPlayerInSession();
                checkPlayersReady();
            }

            if (CONFIG.skipQuiz) {
                // Skipping instruction demo and quiz entirely
                startSession();
            } else {
                let instrPhase = new InstructionPhase(canvas, ctx, imageLoader, trialManager);
                instrPhase.start(function() {
                    let quizPhase = new QuizPhase(canvas, ctx, imageLoader, trialManager);
                    quizPhase.start(startSession);
                });
            }

        });
    });
}

function displayWaitingScreen() {
    ctx.fillStyle = CONFIG.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawText('Waiting for other player to join...\n\nSession ID: ' , '24px Arial', 'center');
}

function checkPlayersReady() {
    // Check if both players have joined the session
    db.collection('sessions').doc(sessionInfo.sessionId).get().then(function(doc) {
        if (doc.exists && doc.data().player1_joined && doc.data().player2_joined) {
            // Both players are ready, set experiment start time if not already set
            if (!doc.data().experimentStartTime) {
                db.collection('sessions').doc(sessionInfo.sessionId).set({
                    experimentStartTime: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).then(function() {
                    console.log('Experiment start time set');
                    // Wait a moment for the timestamp to be recorded, then start
                    setTimeout(startExperiment, 500);
                });
            } else {
                // Start time already set, proceed with experiment
                startExperiment();
            }
        } else {
            // Not ready yet, keep checking
            setTimeout(checkPlayersReady, 1000);
            displayWaitingScreen();
        }
    }).catch(function(error) {
        console.error('Error checking players ready:', error);
        setTimeout(checkPlayersReady, 1000);
    });
}

function registerPlayerInSession() {
    let updateData = {};
    updateData['player' + sessionInfo.playerNum + '_joined'] = true;
    
    db.collection('sessions').doc(sessionInfo.sessionId).set(updateData, { merge: true }).then(function() {
        console.log('Player ' + sessionInfo.playerNum + ' registered in session');
    }).catch(function(error) {
        console.error('Error registering player:', error);
    });
}

function startExperiment() {
    console.log('Both players ready! Starting experiment...');
    
    // Get the experiment start time from Firebase for synchronization
    db.collection('sessions').doc(sessionInfo.sessionId).get().then(function(doc) {
        if (doc.exists && doc.data().experimentStartTime) {
            // Calculate the difference between client time and server time
            let serverTimestamp = doc.data().experimentStartTime.toDate().getTime();
            let clientTime = Date.now();
            clientServerTimeDiff = serverTimestamp - clientTime;
            
            console.log('Server timestamp:', serverTimestamp);
            console.log('Client time:', clientTime);
            console.log('Time difference:', clientServerTimeDiff, 'ms');
            
            // Create managers
            trialManager = new TrialManager();
            imageLoader = new ImageLoader();
            
            // Player 1 generates and uploads trials, Player 2 downloads them
            // Player 1 generates and uploads trials, Player 2 downloads them
        if (sessionInfo.playerNum === 1) {
            // Player 1: Generate trials and upload to Firebase
            console.log('Player 1: Generating trial sequence...');
            trialManager.generateTrials();
            
            let serializedTrials = trialManager.serializeTrials();
            
            db.collection('sessions').doc(sessionInfo.sessionId).set({
                trialSequence: serializedTrials,
                trialsGenerated: true
            }, { merge: true }).then(function() {
                console.log('Player 1: Trial sequence uploaded to Firebase');
                
                // Player 1 also waits for confirmation that data is in Firebase
                // This ensures both players start at roughly the same time
                waitForTrialSequenceConfirmation();
                
            }).catch(function(error) {
                console.error('Error uploading trial sequence:', error);
            });
    
            } else {
                // Player 2: Wait for and download trials from Firebase
                console.log('Player 2: Waiting for trial sequence from Player 1...');
                waitForTrialSequence();
            }
        }
    }).catch(function(error) {
        console.error('Error getting experiment start time:', error);
    });
}

// Player 2 waits for Player 1 to upload the trial sequence (using real-time listener)
function waitForTrialSequence() {
    // Set up a real-time listener instead of polling
    let unsubscribe = db.collection('sessions').doc(sessionInfo.sessionId).onSnapshot(function(doc) {
        if (doc.exists && doc.data().trialsGenerated && doc.data().trialSequence) {
            console.log('Player 2: Trial sequence received from Firebase');
            let serializedTrials = doc.data().trialSequence;
            trialManager.loadTrialsFromData(serializedTrials);
            
            // Unsubscribe from listener once we have the data
            unsubscribe();
            
            proceedWithExperiment();
        } else {
            console.log('Player 2: Waiting for trial sequence...');
        }
    }, function(error) {
        console.error('Error listening for trial sequence:', error);
    });
}

// Common function to continue experiment setup after trials are ready - CHANGED MIGHT NEED LATER 
// function proceedWithExperiment() {
//     // Set starting trial index for testing purposes
//     if (CONFIG.startingTrialIndex > 0) {
//         trialManager.currentTrialIndex = CONFIG.startingTrialIndex;
//         console.log('Starting experiment at trial index: ' + CONFIG.startingTrialIndex + ' (Trial ' + trialManager.getCurrentTrialNumber() + ')');
//     }
    
//     // Preload images
//     imageLoader.preloadChartImages(trialManager.charts, function() {
//         console.log('Images loaded, starting experiment');
//         imageLoader.preloadSymbolImages(trialManager.symbols, function() {
//             console.log('Symbols loaded, starting experiment');
//             startPhase('instructions');
//             requestAnimationFrame(gameLoop);
//         });
//     });
// }

// Get synchronized time across both clients

function getSynchronizedTime() {
    return Date.now() + clientServerTimeDiff;
}

// Upload that this player is ready (pressed space on instructions)
function uploadPlayerReadyToFirebase() {
    let updateData = {};
    updateData['player' + sessionInfo.playerNum + '_ready'] = true;
    
    db.collection('sessions').doc(sessionInfo.sessionId).set(updateData, { merge: true }).then(function() {
        console.log('Player ' + sessionInfo.playerNum + ' marked as ready');
    }).catch(function(error) {
        console.error('Error marking player as ready:', error);
    });
}

// Check if both players have pressed space (are ready)
function checkBothPlayersPressedSpace() {
    let unsubscribe = db.collection('sessions').doc(sessionInfo.sessionId).onSnapshot(function(doc) {
        if (doc.exists && doc.data().player1_ready && doc.data().player2_ready) {
            unsubscribe();
            // Guard against the snapshot firing a second time (e.g. when Player 1
            // writes trialSyncTime, which updates the same document).
            if (checkingSpacePress) return;
            checkingSpacePress = true;
            console.log('Both players pressed space! Writing sync timestamp...');

            // Player 1 writes the shared start timestamp; Player 2 just waits for it.
            // This ensures both clients anchor their baseline start to the same server moment.
            if (sessionInfo.playerNum === 1) {
                db.collection('sessions').doc(sessionInfo.sessionId).set({
                    trialSyncTime: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            waitForTrialSyncAndStart();
        }
    });
}

// Both players wait for trialSyncTime from Firebase, then start baseline at the
// same pre-computed phaseStartTime so both devices have an identical clock anchor.
function waitForTrialSyncAndStart() {
    let unsubscribe = db.collection('sessions').doc(sessionInfo.sessionId).onSnapshot(function(doc) {
        if (doc.exists && doc.data().trialSyncTime) {
            unsubscribe();
            // Guard: Firestore can fire the snapshot twice (provisional local write,
            // then server-confirmed value). Only the first fire should set syncedPhaseStartTime;
            // a second fire would push it further into the future and delay Player 2's baseline.
            if (trialSyncReceived) return;
            trialSyncReceived = true;
            // Fire 1000 ms after this machine receives the notification.
            // Clock-offset math cancels out exactly; the only residual skew is the
            // difference in Firestore notification latency between the two machines
            // (typically < 50 ms), which is far better than the previous approach
            // that accumulated up to ~1000 ms of error from polling-interval timing.
            let delayMs = 1000;
            let localStartMs = Date.now() + delayMs;
            console.log('Trial sync received. Starting baseline in', delayMs, 'ms');
            // Store the shared start time so startPhase uses it instead of Date.now()
            syncedPhaseStartTime = localStartMs;
            setTimeout(function() {
                bothPlayersPressedSpace = true;
            }, delayMs);
        }
    });
}

// Handle keyboard input
function handleKeyPress(event) {
    let key = event.key.toLowerCase();

    if (currentPhase === 'decision') {
        let trial = trialManager ? trialManager.getCurrentTrial() : null;
        if (trial && trial.isCatchTrial) {
            if (key === trial.catchKey) keyPressed = trial.catchKey;
        } else {
            if (key === 'arrowleft') keyPressed = 'left';
            else if (key === 'arrowright') keyPressed = 'right';
            else if (key === 'arrowup') keyPressed = 'up';
            else if (key === 'arrowdown') keyPressed = 'down';
        }
    } else if (currentPhase === 'instructions') {
        if (key === ' ') keyPressed = 'space';
    }
     else if (currentPhase === 'lottery') {
        if (key === ' ') keyPressed = 'space';
    }

    if (key === '7') {
        savePhaseDurations();
    }

    console.log('Key pressed: ' + keyPressed + ' in phase: ' + currentPhase);
}

// Returns the exact configured duration for auto-timed phases so that
// fixed-increment timing can be used instead of Date.now() snapshots.
// Returns null for player-triggered phases (instructions, lottery) which
// must reset to wall-clock time.
function getConfiguredPhaseDuration(phase) {
    switch (phase) {
        case 'baseline':          return CONFIG.baselineDuration;
        case 'sample':            return CONFIG.sampleDuration;
        case 'delay':             return CONFIG.delayDuration;
        case 'decision':          return CONFIG.decisionDuration;
        case 'feedback':          return CONFIG.feedbackDuration;
        case 'postFeedbackDelay': return CONFIG.postFeedbackDelayDuration;
        default:                  return null;
    }
}

// Start a new phase
function startPhase(phase) {
    // Record the duration of the previous phase
    if (phaseStartTime > 0) {
        let phaseDuration = Date.now() - phaseStartTime;
        let trial = trialManager.getCurrentTrial();
        phaseDurations.push({
            phase: currentPhase,
            duration: phaseDuration,
            trial: trialManager.getCurrentTrialNumber(),
            symbol: trial ? trial.symbol.id : null
        });
        console.log('Phase "' + currentPhase + '" lasted ' + phaseDuration + 'ms');
    }

    currentPhase = phase;

    // Fixed-increment timing: advance phaseStartTime by the exact configured
    // duration of the previous phase rather than snapping to Date.now().
    // This prevents per-frame overshoots (~16 ms at 60 fps) from accumulating
    // into drift across hundreds of trials.  Player-triggered phases
    // (instructions, lottery) have no fixed duration so we reset to wall clock.
    let prevPhaseName = phaseDurations.length > 0 ? phaseDurations[phaseDurations.length - 1].phase : null;
    let prevPhaseConfiguredDuration = getConfiguredPhaseDuration(prevPhaseName);
    if (phaseStartTime > 0 && prevPhaseConfiguredDuration !== null) {
        phaseStartTime = phaseStartTime + prevPhaseConfiguredDuration;
    } else if (syncedPhaseStartTime !== null) {
        // Use the Firebase-synchronized start time so both devices share the same anchor
        phaseStartTime = syncedPhaseStartTime;
        syncedPhaseStartTime = null;
    } else {
        phaseStartTime = Date.now();
    }
    phaseLog.push({
    trial: trialManager ? trialManager.getCurrentTrialNumber() : 0,
    phase: phase,
    elapsed_ms: experimentWallStartTime ? (Date.now() - experimentWallStartTime) : 'experiment_not_started'
    });
    
    // Reset decision flag when entering decision phase
    if (phase === 'decision') {
        decisionMade = false;
        decisionUploaded = false;
        decisionPhaseStartTime = phaseStartTime;
    }
    
    // Reset space press flags when entering instructions phase
    if (phase === 'instructions') {
        playerPressedSpace = false;
        bothPlayersPressedSpace = false;
        checkingSpacePress = false;
        trialSyncReceived = false;
    }
    
    // Reset partner decision fetch flag when entering feedback phase
    if (phase === 'feedback') {
        partnerDecisionFetched = false;
        partnerChoice = null;
        partnerTimestamp = null;

        let trial = trialManager.getCurrentTrial();
        let isCatch = trial && trial.isCatchTrial;
        let pointsEarned = 0;

        if (!isCatch) {
            if (keyPressed === trial.choice1Position) {
                pointsEarned = trial.chart.largerpoints;
            } else if (keyPressed === trial.choice2Position) {
                pointsEarned = trial.chart.smallerpoints;
            }
        }

        userPoints.push({
            trial: trialManager.getCurrentTrialNumber(),
            choice: keyPressed,
            chartId: trial.chartId,
            symbolId: trial.symbol.id,
            pointsEarned: pointsEarned
        });

        console.log('Trial ' + trialManager.getCurrentTrialNumber() + ' - Points earned: ' + pointsEarned);

        let conditionLabel = { 1: 'anticoordination', 2: 'coordination', 3: 'competition' };
        let elapsedMs = (decisionTimestampMs && experimentWallStartTime)
            ? (decisionTimestampMs - experimentWallStartTime)
            : 'no_response';

        decisionLog.push({
            trial:              trialManager.getCurrentTrialNumber(),
            phase:              isCatch ? 0 : trialManager.getCurrentPhase(),
            elapsed_ms:         elapsedMs,
            server_elapsed_ms:  typeof elapsedMs === 'number' ? elapsedMs + clientServerTimeDiff : 'no_response',
            reaction_time_ms:   (decisionTimestampMs && decisionPhaseStartTime)
                                    ? (decisionTimestampMs - decisionPhaseStartTime)
                                    : 'no_response',
            condition:          isCatch ? 'catch' : (conditionLabel[trial.symbol.id] || trial.symbol.id),
            delta:              trial.chart.delta,
            scale:              trial.chart.S,
            chartId:            trial.chartId,
            point1_color:       'red',
            point1_location:    trial.choice1Position,
            point1_value:       trial.chart.largerpoints,
            point2_color:       'blue',
            point2_location:    trial.choice2Position,
            point2_value:       trial.chart.smallerpoints,
            choice:             keyPressed || 'none',
            your_points:        0,
            partner_points:     'pending',
            server_timestamp:   'pending'
        });

    decisionTimestampMs = null;

    }
    
    console.log('Starting phase: ' + phase);
}

// Main game loop
function gameLoop() {
    let elapsed = Date.now() - phaseStartTime;
    
    // Clear canvas
    ctx.fillStyle = CONFIG.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Handle each phase
    if (currentPhase === 'instructions') {
        renderInstructions();

        // Auto-trigger space press if skipping instructions screen
        if (CONFIG.skipInstructions && !playerPressedSpace) {
            keyPressed = 'space';
        }

        if (keyPressed === 'space') {
            keyPressed = '';
            instructionsShown = true;

            // Register that this player pressed space
            if (!playerPressedSpace) {
                playerPressedSpace = true;
                uploadPlayerReadyToFirebase();
                checkBothPlayersPressedSpace();
            }
        } else if (keyPressed === 'up') {
            startPhase('exit');
        }
        
        // Only move to next phase if both players pressed space
        if (bothPlayersPressedSpace && trialManager.hasMoreTrials()) {
            startPhase('baseline');
        } else if (bothPlayersPressedSpace && !trialManager.hasMoreTrials()) {
            startPhase('complete');
        }
        
    } else if (currentPhase === 'sample') {
        renderSample();
        if (elapsed >= CONFIG.sampleDuration) {
            startPhase('delay');
        }
        
    } else if (currentPhase === 'delay') {
        renderDelay();
        if (elapsed >= CONFIG.delayDuration) {
            keyPressed = '';
            startPhase('decision');
        }
        
    } else if (currentPhase === 'decision') {
        renderDecision();
        
        let trial = trialManager.getCurrentTrial();
        
        // Only process key presses if a decision hasn't been made yet
        if (!decisionMade) {
            let validChoice = trial.isCatchTrial
                ? (keyPressed === trial.catchKey)
                : (keyPressed === trial.choice1Position || keyPressed === trial.choice2Position);

            if (validChoice) {
                decisionMade = true;
                decisionTimestampMs = Date.now();
                
                // Upload the decision to Firebase if not already uploaded
                if (!decisionUploaded && sessionInfo && sessionInfo.sessionId) {
                    uploadDecisionToFirebase(keyPressed, trial);
                    decisionUploaded = true;
                }
            }
            
            if (keyPressed === 'w' && !validChoice) {
                startPhase('exit');
            }
        }
        
        // Move to feedback only after the full decision duration has elapsed
        if (elapsed >= CONFIG.decisionDuration) {
            startPhase('feedback');
        }
        
    } else if (currentPhase === 'feedback') {
        // Fetch other player's decision on first render
        if (!partnerDecisionFetched) {
            partnerDecisionFetched = true;
            getOtherPlayerDecision(function(otherPlayerData) {
                if (otherPlayerData) {
                    partnerChoice = otherPlayerData.choice;
                    partnerTimestamp = otherPlayerData.timestamp;
                    console.log('Partner choice retrieved:', partnerChoice, 'at timestamp:', partnerTimestamp);
                } else {
                    console.log('Partner choice not yet available');
                }
            });
        }
        
        renderFeedback();

        if (elapsed >= CONFIG.feedbackDuration) {
            trialManager.nextTrial();
            keyPressed = '';
            if (trialManager.hasMoreTrials()) {
                startPhase('postFeedbackDelay');
            } else {
                startPhase('lottery');
            }
            
        }
        
    } else if (currentPhase === 'postFeedbackDelay') {
        renderPostFeedbackDelay();
        if (elapsed >= CONFIG.postFeedbackDelayDuration) {
            keyPressed = '';
            startPhase('baseline');
        }
        
    } else if (currentPhase === 'baseline') {
        renderBaseline();
        if (elapsed >= CONFIG.baselineDuration) {
            keyPressed = '';
            if (trialManager.hasMoreTrials()) {
                startPhase('sample'); // MUST CHANGE THIS TO ALTER PHASE - OG:sample
            } else {
                startPhase('complete');
            }
        }
        
    } else if (currentPhase === 'lottery') {
            if (lotteryTrialIndex === null) {
                let seed = seededRandom(sessionInfo.sessionId);
                lotteryTrialIndex = seed % trialManager.trialSequence.length;
                while (trialManager.trialSequence[lotteryTrialIndex].isCatchTrial) {
                    lotteryTrialIndex = (lotteryTrialIndex + 1) % trialManager.trialSequence.length;
                }
                console.log('Lottery trial index:', lotteryTrialIndex, '(Trial ' + (lotteryTrialIndex + 1) + ')');
            }
            renderLottery();
            if (keyPressed === 'space') {
                keyPressed = '';
                startPhase('complete');
            }

        } 
    else if (currentPhase === 'complete') {
        renderComplete();
        return;
        
    } else if (currentPhase === 'exit') {
        renderExit();
        return;
    }
    
    requestAnimationFrame(gameLoop);
}

// Render functions
function renderInstructions() {
    if (!instructionsShown) {
        let text = 'Instructions: Coordinate to determine who gets each piece of the pie.\n\nPress SPACE to start';
        drawText(text, canvas.width / 2, canvas.height / 2, '24px Arial', 'center');
    } else if (!bothPlayersPressedSpace) {
        let text = 'Waiting for other player to press SPACE...';
        drawText(text, canvas.width / 2, canvas.height / 2, '24px Arial', 'center');
    }
    renderLegend();
}

function renderBaseline() {
    let trial = trialManager.getCurrentTrial();
    
    // Blank white screen with only the symbol displayed as a small crosshair in center
    let symbolImg = imageLoader.getSymbolImage(trial.symbol.id);
    if (symbolImg) {
        drawImage(symbolImg, canvas.width / 2, canvas.height / 2, 32, 32);
    }
    renderLegend();
}

function renderSample() {
    let trial = trialManager.getCurrentTrial();
    let img = imageLoader.getChartImage(trial.chartId, 'sample');

    let imgWidth = 256 / 2;
    let imgHeight = 256 / 2;

    // Draw single chart in center
    if (img) {
        drawImage(img, canvas.width / 2, canvas.height / 2, imgWidth, imgHeight);
    }

    // Total above image
    let totalPoints = trial.chart.largerpoints + trial.chart.smallerpoints;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Total: ' + totalPoints, canvas.width / 2, canvas.height / 2 - imgHeight / 2 - 16);
}

function renderDelay() {
    let trial = trialManager.getCurrentTrial();
    
    // Display the symbol image as a small crosshair in center during delay
    let symbolImg = imageLoader.getSymbolImage(trial.symbol.id);
    if (symbolImg) {
        drawImage(symbolImg, canvas.width / 2, canvas.height / 2, 32, 32);
    }
    renderLegend();
}

function renderPostFeedbackDelay() {
    // Blank white screen - no symbol display
}

function renderDecision() {
    renderLegend();
    let trial = trialManager.getCurrentTrial();

    if (trial.isCatchTrial) {
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Press ' + trial.catchKey.toUpperCase() + ' to continue', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Get images
    let choice1Img = imageLoader.getChartImage(trial.chartId, 'choice1');
    let choice2Img = imageLoader.getChartImage(trial.chartId, 'choice2');
    
    // Get positions
    let pos1 = trialManager.getPositionCoords(trial.choice1Position, canvas.width, canvas.height);
    let pos2 = trialManager.getPositionCoords(trial.choice2Position, canvas.width, canvas.height);
    
    // Draw choice 1
    if (choice1Img) {
        drawImage(choice1Img, pos1.x, pos1.y, 256/2, 256/2);
    } else {
        drawText('[Choice 1]', pos1.x, pos1.y, '20px Arial', 'center');
    }
    
    // Draw choice 2
    if (choice2Img) {
        drawImage(choice2Img, pos2.x, pos2.y, 256/2, 256/2);
    } else {
        drawText('[Choice 2]', pos2.x, pos2.y, '20px Arial', 'center');
    }
    
    //drawText('Press arrow key for your choice', canvas.width / 2, 30, '20px Arial', 'center');
}

function renderFeedback() {
    let trial = trialManager.getCurrentTrial();

    if (trial.isCatchTrial) {
        if (decisionLog.length > 0) {
            decisionLog[decisionLog.length - 1].partner_points = 0;
        }
        let py = canvas.height / 2;
        drawColoredText('You got: 0 points', canvas.width / 3, py, '24px Arial', 'center', '#006400');
        drawColoredText('Other player got: 0 points', canvas.width * 2 / 3, py, '24px Arial', 'center', '#4B0082');
        return;
    }

    let leftX = canvas.width / 3;
    let rightX = canvas.width * 2 / 3;
    let imageY = canvas.height / 2 - 120;
    let pointsY = canvas.height / 2 + 80;
    let playerPointsY = canvas.height / 2 + 140;
    
    let points1 = trial.chart.largerpoints;
    let points2 = trial.chart.smallerpoints;
    
    // Calculate points based on game type (symbol ID)
    let yourPoints = 0;
    let otherPlayerPoints = 0;
    let symbolId = trial.symbol.id;
    
    if (symbolId === 1) {
        if (keyPressed && partnerChoice && keyPressed !== partnerChoice) {
            yourPoints = (keyPressed === trial.choice1Position) ? points1 : points2;
            otherPlayerPoints = (partnerChoice === trial.choice1Position) ? points1 : points2;
        }
    } else if (symbolId === 2) {
        if (keyPressed && partnerChoice && keyPressed === partnerChoice) {
            yourPoints = (keyPressed === trial.choice1Position) ? points1 : points2;
            otherPlayerPoints = yourPoints;
        }
    } else if (symbolId === 3) {
        if (keyPressed && !partnerChoice) {
            yourPoints = (keyPressed === trial.choice1Position) ? points1 : points2;
            otherPlayerPoints = 0;
        } else if (!keyPressed && partnerChoice) {
            yourPoints = 0;
            otherPlayerPoints = (partnerChoice === trial.choice1Position) ? points1 : points2;
        } else if (keyPressed && partnerChoice) {
            if (partnerChoice === keyPressed) {
                if (yourDecisionTimestamp && partnerTimestamp) {
                    let yourTime = yourDecisionTimestamp.toDate ? yourDecisionTimestamp.toDate().getTime() : yourDecisionTimestamp;
                    let partnerTime = partnerTimestamp.toDate ? partnerTimestamp.toDate().getTime() : partnerTimestamp;
                    if (yourTime < partnerTime) {
                        yourPoints = (keyPressed === trial.choice1Position) ? points1 : points2;
                        otherPlayerPoints = 0;
                    } else {
                        yourPoints = 0;
                        otherPlayerPoints = (partnerChoice === trial.choice1Position) ? points1 : points2;
                    }
                } else {
                    yourPoints = (keyPressed === trial.choice1Position) ? points1 : points2;
                    otherPlayerPoints = 0;
                }
            } else {
                yourPoints = (keyPressed === trial.choice1Position) ? points1 : points2;
                otherPlayerPoints = (partnerChoice === trial.choice1Position) ? points1 : points2;
            }
        }
    }
    
    // Update the last user points entry with calculated points
    if (userPoints.length > 0) {
        userPoints[userPoints.length - 1].pointsEarned = yourPoints;
    }

    // ★ patch partner points into log once we have them
    if (decisionLog.length > 0 && partnerChoice) {
        decisionLog[decisionLog.length - 1].partner_points = otherPlayerPoints;
    }

    // --- YOUR CHOICE (left side) ---
    if (keyPressed) {
        // Determine which result image and points value correspond to the user's choice
        let yourImg = (keyPressed === trial.choice1Position)
            ? imageLoader.getChartImage(trial.chartId, 'result1')
            : imageLoader.getChartImage(trial.chartId, 'result2');
        let yourPointValue = (keyPressed === trial.choice1Position) ? points1 : points2;

        if (yourImg) {
            drawImage(yourImg, leftX, imageY, 256, 256);
        } else {
            drawText('[Your Choice]', leftX, imageY, '20px Arial', 'center');
        }
        drawText('Points: ' + yourPointValue, leftX, pointsY, '28px Arial', 'center');

        // Green box around your chart
        ctx.strokeStyle = '#006400';
        ctx.lineWidth = 3;
        let boxSize = 140;
        ctx.strokeRect(leftX - boxSize, imageY - boxSize, boxSize * 2, boxSize * 2);
    }

    // --- PARTNER'S CHOICE (right side) ---
    if (partnerChoice) {
        // Determine which result image and points value correspond to the partner's choice
        let partnerImg = (partnerChoice === trial.choice1Position)
            ? imageLoader.getChartImage(trial.chartId, 'result1')
            : imageLoader.getChartImage(trial.chartId, 'result2');
        let partnerPointValue = (partnerChoice === trial.choice1Position) ? points1 : points2;

        if (partnerImg) {
            drawImage(partnerImg, rightX, imageY, 256, 256);
        } else {
            drawText('[Partner Choice]', rightX, imageY, '20px Arial', 'center');
        }
        drawText('Points: ' + partnerPointValue, rightX, pointsY, '28px Arial', 'center');

        // Red box around partner's chart
        ctx.strokeStyle = '#4B0082';
        ctx.lineWidth = 1;
        let boxSize = 140;
        ctx.strokeRect(rightX - boxSize, imageY - boxSize, boxSize * 2, boxSize * 2);
    }

    // --- POINTS SUMMARY (always shown) ---
    drawColoredText('You got: ' + yourPoints + ' points', leftX, playerPointsY, '24px Arial', 'center', '#006400');
    drawColoredText('Other player got: ' + otherPlayerPoints + ' points', rightX, playerPointsY, '24px Arial', 'center','#4B0082');
}
function renderComplete() {
    drawText('Experiment Complete!\n\nThank you for participating.', canvas.width / 2, canvas.height / 2, '32px Arial', 'center');
    savePhaseDurations();
    clearSession();
}
function clearSession() {
    if (sessionCleared) return;
    sessionCleared = true;

    db.collection('sessions').doc(sessionInfo.sessionId)
        .collection('decisions').get().then(function(snapshot) {
            snapshot.forEach(function(doc) {
                doc.ref.delete();
            });
        });
    db.collection('sessions').doc(sessionInfo.sessionId).delete();
}


function renderExit() {
    drawText('Up arrow pressed\n\nExperiment ended', canvas.width / 2, canvas.height / 2, '32px Arial', 'center');
    savePhaseDurations();
}

function savePhaseDurations() {
    let totalPoints = 0;
    let rows = [];

    rows.push([
        'trial', 'phase', 'elapsed_ms', 'server_elapsed_ms', 'reaction_time_ms', 'server_timestamp',
        'condition', 'delta', 'scale', 'chartId',
        'point1_color', 'point1_location', 'point1_value',
        'point2_color', 'point2_location', 'point2_value',
        'choice', 'your_points', 'partner_points'
    ].join(','));

    for (let i = 0; i < decisionLog.length; i++) {
        let d = decisionLog[i];
        rows.push([
            d.trial, d.phase, d.elapsed_ms, d.server_elapsed_ms, d.reaction_time_ms, d.server_timestamp,
            d.condition, d.delta, d.scale, d.chartId,
            d.point1_color, d.point1_location, d.point1_value,
            d.point2_color, d.point2_location, d.point2_value,
            d.choice, d.your_points, d.partner_points
        ].join(','));
        if (typeof d.your_points === 'number') totalPoints += d.your_points;
    }

    rows.push('');
    rows.push('# experiment_start,' + (experimentWallStartTime ? new Date(experimentWallStartTime).toISOString() : 'unknown'));
    rows.push('# client_server_diff_ms,' + clientServerTimeDiff);
    rows.push('# total_points,' + totalPoints);
    rows.push('# total_trials,' + decisionLog.length);

    rows.push('');
    rows.push('');
    rows.push('--- PHASE LOG ---');
    rows.push(['trial', 'phase', 'elapsed_ms'].join(','));

    for (let i = 0; i < phaseLog.length; i++) {
        let p = phaseLog[i];
        rows.push([p.trial, p.phase, p.elapsed_ms].join(','));
    }

    let blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'player' + sessionInfo.playerNum + '_session' + sessionInfo.sessionId + '_decisions.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Decision log downloaded. Total points:', totalPoints);
}

// Upload user decision to Firebase
function uploadDecisionToFirebase(choice, trial) {
    if (!sessionInfo || !sessionInfo.sessionId) {
        console.warn('Session info not available, cannot upload decision');
        return;
    }

    let targetTrialNumber = trialManager.getCurrentTrialNumber();

    const decisionData = {
        sessionId: sessionInfo.sessionId,
        playerNum: sessionInfo.playerNum,
        trialNumber: trialManager.getCurrentTrialNumber(),
        chartId: trial.chartId,
        symbolId: trial.symbol.id,
        choice: choice,
        choice1Position: trial.choice1Position,
        choice2Position: trial.choice2Position,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('sessions').doc(sessionInfo.sessionId)
        .collection('decisions').add(decisionData)
        .then(function(docRef) {
            console.log('Decision uploaded successfully with ID:', docRef.id);
            db.collection('sessions').doc(sessionInfo.sessionId)
                .collection('decisions').doc(docRef.id)
                .get()
                .then(function(doc) {
                if (doc.exists) {
                    yourDecisionTimestamp = doc.data().timestamp;
                    console.log('Your decision timestamp recorded:', yourDecisionTimestamp);

                    // patch server timestamp into the correct trial's log entry
                    let entry = decisionLog.find(function(d) { return d.trial === targetTrialNumber; });
                    if (entry) {
                        entry.server_timestamp = yourDecisionTimestamp.toDate().toISOString();
                    }
                }})
                .catch(function(error) {
                    console.error('Error retrieving decision timestamp:', error);
                });
        })
        .catch(function(error) {
            console.error('Error uploading decision to Firebase:', error);
        });
}

// Retrieve the other player's decision from Firebase
function getOtherPlayerDecision(callback) {
    if (!sessionInfo || !sessionInfo.sessionId) {
        console.warn('Session info not available, cannot retrieve other player decision');
        callback(null);
        return;
    }
    
    const otherPlayerNum = sessionInfo.playerNum === 1 ? 2 : 1;
    const currentTrialNumber = trialManager.getCurrentTrialNumber();
    
    db.collection('sessions').doc(sessionInfo.sessionId)
        .collection('decisions')
        .where('playerNum', '==', otherPlayerNum)
        .where('trialNumber', '==', currentTrialNumber)
        .limit(1)
        .get()
        .then(function(querySnapshot) {
            if (!querySnapshot.empty) {
                const otherPlayerDecision = querySnapshot.docs[0].data();
                console.log('Retrieved other player decision:', otherPlayerDecision);
                callback(otherPlayerDecision);
            } else {
                console.log('No decision found from other player yet');
                callback(null);
            }
        })
        .catch(function(error) {
            console.error('Error retrieving other player decision:', error);
            callback(null);
        });
}

// Helper functions
function drawText(text, x, y, font, align) {
    ctx.fillStyle = CONFIG.textColor;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    
    let lines = text.split('\n');
    let lineHeight = parseInt(font) * 1.2;
    let startY = y - (lines.length - 1) * lineHeight / 2;
    
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
}

function drawImage(img, x, y, width, height) {
    ctx.drawImage(img, x - width / 2, y - height / 2, width, height);
}


function getSessionInfo() {
    let sessionId = prompt("Enter Session ID (both players use same ID):");
    let playerNum = parseInt(prompt("Enter ID: "));
    
    if (!sessionId || (playerNum !== 1 && playerNum !== 2)) {
        alert("Invalid! Refresh and try again.");
        throw new Error("Invalid session info");
    }
    
    return { sessionId, playerNum };
}

// Upload player's choice to Firebase
async function uploadChoice(trialNum, choice) {
    let docRef = db.collection('sessions')
        .doc(sessionInfo.sessionId)
        .collection('trials')
        .doc('trial_' + trialNum);
    
    let fieldName = 'player' + sessionInfo.playerNum + '_choice';
    let data = {};
    data[fieldName] = choice;
    
    await docRef.set(data, { merge: true });
    console.log('Uploaded my choice:', choice);
}

// Get partner's choice from Firebase (doesn't wait, just reads whatever's there)
async function getPartnerChoice(trialNum) {
    let docRef = db.collection('sessions')
        .doc(sessionInfo.sessionId)
        .collection('trials')
        .doc('trial_' + trialNum);
    
    let partnerField = 'player' + (sessionInfo.playerNum === 1 ? 2 : 1) + '_choice';
    
    let doc = await docRef.get();
    if (doc.exists) {
        let data = doc.data();
        let choice = data[partnerField] || null;
        console.log('Partner choice:', choice);
        return choice;
    }
    
    return null;  //partner didnt choose 
}

// Player 1 waits for confirmation that trials are in Firebase
function waitForTrialSequenceConfirmation() {
    db.collection('sessions').doc(sessionInfo.sessionId).get().then(function(doc) {
        if (doc.exists && doc.data().trialsGenerated && doc.data().trialSequence) {
            console.log('Player 1: Trial sequence confirmed in Firebase');
            proceedWithExperiment();
        } else {
            // Shouldn't happen, but just in case
            setTimeout(waitForTrialSequenceConfirmation, 100);
        }
    }).catch(function(error) {
        console.error('Error confirming trial sequence:', error);
        setTimeout(waitForTrialSequenceConfirmation, 100);
    });
}

function proceedWithExperiment() {
    // Set starting trial index for testing purposes
    if (CONFIG.startingTrialIndex > 0) {
        trialManager.currentTrialIndex = CONFIG.startingTrialIndex;
        console.log('Starting experiment at trial index: ' + CONFIG.startingTrialIndex + ' (Trial ' + trialManager.getCurrentTrialNumber() + ')');
    }
    
    // Mark this player as having loaded trials
    let updateData = {};
    updateData['player' + sessionInfo.playerNum + '_trials_loaded'] = true;
    
    db.collection('sessions').doc(sessionInfo.sessionId).set(updateData, { merge: true }).then(function() {
        console.log('Player ' + sessionInfo.playerNum + ' marked as trials loaded');
        waitForBothPlayersTrialsLoaded();
    });
}

// Wait for both players to have loaded trials before starting
function waitForBothPlayersTrialsLoaded() {
    let unsubscribe = db.collection('sessions').doc(sessionInfo.sessionId).onSnapshot(function(doc) {
        if (doc.exists && doc.data().player1_trials_loaded && doc.data().player2_trials_loaded) {
            console.log('Both players have loaded trials! Preloading images...');
            unsubscribe();
            
            // Preload images
            imageLoader.preloadChartImages(trialManager.charts, function() {
                console.log('Charts loaded');
                imageLoader.preloadSymbolImages(trialManager.symbols, function() {
                    console.log('Symbols loaded');
                    
                    // Signal that THIS player has finished loading images
                    let updateData = {};
                    updateData['player' + sessionInfo.playerNum + '_images_loaded'] = true;
                    
                    db.collection('sessions').doc(sessionInfo.sessionId).set(updateData, { merge: true }).then(function() {
                        console.log('Player ' + sessionInfo.playerNum + ' images loaded, waiting for other player...');
                        waitForBothPlayersImagesLoaded();
                    });
                });
            });
        }
    });
}

// Wait for both players to finish loading images before starting the experiment
function waitForBothPlayersImagesLoaded() {
    let unsubscribe = db.collection('sessions').doc(sessionInfo.sessionId).onSnapshot(function(doc) {
        if (doc.exists && doc.data().player1_images_loaded && doc.data().player2_images_loaded) {
            console.log('Both players have loaded images! Starting experiment NOW!');
            unsubscribe();
 
            // Each player only resets their OWN ready flag to avoid a race condition
            // where one player's reset overwrites the other's already-uploaded ready=true.
            let resetData = { trialSyncTime: null };
            resetData['player' + sessionInfo.playerNum + '_ready'] = false;
            db.collection('sessions').doc(sessionInfo.sessionId).set(resetData, { merge: true });
 
            experimentWallStartTime = Date.now();
 
            // Re-attach the main key handler and start the game loop.
            // The 'instructions' phase (waiting for both players to press SPACE)
            // is still the first real phase — it just no longer shows the demo.
            document.addEventListener('keydown', handleKeyPress);
            startPhase('instructions');
            requestAnimationFrame(gameLoop);
 
        } else {
            console.log('Waiting for other player to finish loading images...');
        }
    });
}
 
// Also remove the registerPlayerInSession() call from the window load listener
// since it's now called inside init() after the demo completes.
window.addEventListener('load', function() {
    init();
});
window.addEventListener('beforeunload', function() {
    clearSession();
});


function renderLegend() {
    let symbols = trialManager.symbols;
    let labels = {
        1: 'Different',
        2: 'Same', 
        3: 'Quicker'
    };

    let iconSize = 24;
    let rowHeight = 32;
    let startX = 10;
    let startY = canvas.height - (symbols.length * rowHeight) - 10;

    for (let i = 0; i < symbols.length; i++) {
        let symbolImg = imageLoader.getSymbolImage(symbols[i].id);
        let y = startY + i * rowHeight;

        if (symbolImg) {
            ctx.drawImage(symbolImg, startX, y, iconSize, iconSize);
        }

        ctx.fillStyle = '#333333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[symbols[i].id], startX + iconSize + 8, y + iconSize / 2);
    }
}
function renderLottery() {
    let cx = canvas.width / 2;
    let cy = canvas.height / 2;

    if (!lotteryPartnerFetched) {
        lotteryPartnerFetched = true;

        let otherPlayerNum = sessionInfo.playerNum === 1 ? 2 : 1;
        let lotteryTrialNumber = lotteryTrialIndex + 1;

        db.collection('sessions').doc(sessionInfo.sessionId)
            .collection('decisions')
            .where('playerNum', '==', otherPlayerNum)
            .where('trialNumber', '==', lotteryTrialNumber)
            .limit(1)
            .get()
            .then(function(snapshot) {
                if (!snapshot.empty) {
                    let data = snapshot.docs[0].data();
                    let trial = trialManager.trialSequence[lotteryTrialIndex];
                    let points1 = trial.chart.largerpoints;
                    let points2 = trial.chart.smallerpoints;
                    lotteryPartnerPoints = (data.choice === trial.choice1Position) ? points1 : points2;
                } else {
                    lotteryPartnerPoints = 0;
                }
            });

        let myEntry = decisionLog.find(function(d) { return d.trial === lotteryTrialIndex + 1; });
        lotteryYourPoints = myEntry ? myEntry.your_points : 0;
    }

    let trial = trialManager.trialSequence[lotteryTrialIndex];
    let sampleImg = imageLoader.getChartImage(trial.chartId, 'sample');
    let symImg = imageLoader.getSymbolImage(trial.symbol.id);

    // Header
    drawText('Payment Trial', cx, 60, 'bold 32px Arial', 'center');
    drawText(
        'Trial ' + (lotteryTrialIndex + 1) + ' was randomly selected to determine your payment.',
        cx, 120, '20px Arial', 'center'
    );

    // Sample chart
    if (sampleImg) {
        drawImage(sampleImg, cx, 280, 160, 160);
    }

    // Cue symbol below chart
    if (symImg) {
        drawImage(symImg, cx, 390, 36, 36);
    }

    // Which slice they picked
    let myEntry = decisionLog.find(function(d) { return d.trial === lotteryTrialIndex + 1; });
    if (myEntry && myEntry.choice !== 'none') {
        let slicePoints = (myEntry.choice === trial.choice1Position)
            ? trial.chart.largerpoints
            : trial.chart.smallerpoints;
        drawText('You picked the slice worth ' + slicePoints + ' points.', cx, 460, '22px Arial', 'center');
    }

    // Points earned
    if (lotteryYourPoints !== null) {
        drawColoredText('You earned: ' + lotteryYourPoints + ' points', canvas.width / 3, 540, '26px Arial', 'center', '#006400');
    }
    if (lotteryPartnerPoints !== null) {
        drawColoredText('Other player earned: ' + lotteryPartnerPoints + ' points', canvas.width * 2 / 3, 540, '26px Arial', 'center', '#4B0082');
    } else {
        drawColoredText('Other player earned: loading...', canvas.width * 2 / 3, 540, '26px Arial', 'center', '#4B0082');
    }

    drawText('Press SPACE to continue', cx, 620, '20px Arial', 'center');
}

function drawColoredText(text, x, y, font, align, color) {
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}