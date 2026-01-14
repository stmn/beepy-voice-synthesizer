class ACVoiceChanger {
    constructor() {
        this.transcribedText = "";
        this.isPlaying = false;

        // UI Elements
        this.playAnimaleseBtn = document.getElementById('play-animalese-btn');
        this.playIconWrapper = this.playAnimaleseBtn.querySelector('.icon-wrapper');
        this.playTextSpan = this.playAnimaleseBtn.querySelector('.btn-text');

        this.downloadBtn = document.getElementById('download-btn');
        this.exportTimingBtn = document.getElementById('export-timing-btn');
        this.transcriptionInput = document.getElementById('transcription-input');
        this.karaokeDisplay = document.getElementById('karaoke-display');
        this.randomQuoteBtn = document.getElementById('random-quote-btn');

        this.robotAvatar = document.getElementById('robot-avatar');
        this.preloadRobotImages();

        this.clockElement = document.getElementById('clock');

        // Settings Reset
        this.settingsArea = document.getElementById('settings-area');
        this.resetDefaultsBtn = document.getElementById('reset-defaults-btn');

        // Settings Sliders & Selectors
        this.pitchSlider = document.getElementById('pitch-slider');
        this.speedSlider = document.getElementById('speed-slider');
        this.timbreSlider = document.getElementById('timbre-slider');
        this.pauseSlider = document.getElementById('pause-slider');
        this.varianceSlider = document.getElementById('variance-slider');
        this.synthModeSelector = document.getElementById('synth-mode-selector');
        this.splitModeSelector = document.getElementById('split-mode-selector');

        // Settings Displays
        this.pitchDisplay = document.getElementById('val-pitch');
        this.speedDisplay = document.getElementById('val-speed');
        this.timbreDisplay = document.getElementById('val-timbre');
        this.pauseDisplay = document.getElementById('val-text-pause');
        this.varianceDisplay = document.getElementById('val-variance');

        this.audioCtx = null;
        this.playbackTimer = null;
        this.animationFrameId = null;
        this.currentSessionGain = null;
        this.demonBuffer = null;

        // Sample Buffer
        this.libraryBuffer = null;
        this.isLibraryLoaded = false;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); // Init early for loading
        this.loadLibrary();

        // Quotes List
        this.quotes = [
            "Actions speak louder than words.",
            "Time is money.",
            "Practice makes perfect.",
            "Better late than never.",
            "The early bird catches the worm.",
            "Honesty is the best policy.",
            "When in Rome, do as the Romans do.",
            "Don’t judge a book by its cover.",
            "What goes around comes around.",
            "No pain, no gain."
        ];

        // Bind Events
        this.playAnimaleseBtn.addEventListener('click', () => this.togglePlayback());
        this.downloadBtn.addEventListener('click', () => this.downloadAudio());
        this.exportTimingBtn.addEventListener('click', () => this.exportTiming());

        this.resetDefaultsBtn.addEventListener('click', () => this.resetDefaults());

        this.transcriptionInput.addEventListener('input', () => this.handleInput());

        this.randomQuoteBtn.addEventListener('click', () => this.insertRandomQuote());

        // Settings Listeners
        this.setupSliderListener(this.pitchSlider, this.pitchDisplay);
        this.setupSliderListener(this.speedSlider, this.speedDisplay);
        this.setupSliderListener(this.timbreSlider, this.timbreDisplay);
        this.setupSliderListener(this.pauseSlider, this.pauseDisplay, ' ms');
        this.setupSliderListener(this.varianceSlider, this.varianceDisplay);

        this.synthModeSelector.addEventListener('change', () => this.handleSynthModeChange());
        this.handleSynthModeChange(); // Init state

        // Clock
        this.updateClock();
        setInterval(() => this.updateClock(), 1000 * 60);

        // Initial Quote
        this.insertRandomQuote();

        // Robot Interaction
        this.robotAvatar.style.cursor = 'pointer';
        this.robotAvatar.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling if needed
            this.speakRandomChar();
        });
    }

    setupSliderListener(slider, display, suffix = '') {
        slider.addEventListener('input', () => {
            display.textContent = slider.value + suffix;
        });
    }

    async loadLibrary() {
        try {
            const response = await fetch('./animalese.wav');
            if (!response.ok) {
                console.warn("Could not load animalese.wav - Sample mode will fall back or fail.");
            } else {
                const arrayBuffer = await response.arrayBuffer();
                this.libraryBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                this.isLibraryLoaded = true;
                console.log("Animalese library loaded!");
            }
        } catch (e) {
            console.error("Error loading animalese library:", e);
        }

        // Load Demon Lib
        try {
            const demonLib = await fetch('demon.wav');
            if (demonLib.ok) {
                const demonArrVal = await demonLib.arrayBuffer();
                this.demonBuffer = await this.audioCtx.decodeAudioData(demonArrVal);
                console.log("Demon library loaded!");
            } else {
                console.warn('demon.wav not found or failed to load');
            }
        } catch (e) {
            console.warn('Error loading demon.wav:', e);
        }
    }

    handleInput() {
        this.transcribedText = this.transcriptionInput.value;
        const hasText = this.transcribedText.trim().length > 0;
        this.playAnimaleseBtn.disabled = !hasText;
        this.downloadBtn.disabled = !hasText;
        this.exportTimingBtn.disabled = !hasText;
    }

    insertRandomQuote() {
        const randomIndex = Math.floor(Math.random() * this.quotes.length);
        this.transcriptionInput.value = this.quotes[randomIndex];
        this.handleInput();
    }

    resetDefaults() {
        // Default Values
        const defaults = {
            pitch: 600,
            speed: 0.14,
            timbre: 400,
            pause: 150,
            variance: 50,
            mode: 'syllables',
            splitMode: 'syllables'
        };

        this.pitchSlider.value = defaults.pitch;
        this.pitchDisplay.textContent = defaults.pitch;

        this.speedSlider.value = defaults.speed;
        this.speedDisplay.textContent = defaults.speed;

        this.timbreSlider.value = defaults.timbre;
        this.timbreDisplay.textContent = defaults.timbre;

        this.pauseSlider.value = defaults.pause;
        this.pauseDisplay.textContent = defaults.pause + ' ms';

        this.varianceSlider.value = defaults.variance;
        this.varianceDisplay.textContent = defaults.variance;

        this.synthModeSelector.value = defaults.mode;
        this.splitModeSelector.value = defaults.splitMode;
        this.handleSynthModeChange();
    }

    // --- Core Logic ---
    scheduleSynthesis(context, destinationNode, dryRun = false, textOverride = null) {
        const textToProcess = textOverride !== null ? textOverride : this.transcribedText;
        if (!textToProcess) return { duration: 0, timeline: [] };

        const mode = this.synthModeSelector.value;
        const splitMode = this.splitModeSelector.value;
        const tokens = this.tokenize(textToProcess, splitMode);

        if ((mode === 'characters' || mode === 'robot' || mode === 'demon_sampled') && this.isLibraryLoaded) {
            return this.synthesizeSamples(context, destinationNode, tokens, dryRun, mode);
        } else {
            return this.synthesizeOscillators(context, destinationNode, tokens, dryRun, mode);
        }
    }

    handleSynthModeChange() {
        const mode = this.synthModeSelector.value;
        if (mode === 'characters' || mode === 'demon_sampled') {
            this.splitModeSelector.value = 'chars';
            this.splitModeSelector.disabled = true;
        } else {
            this.splitModeSelector.disabled = false;
        }
    }

    tokenize(text, splitMode) {
        let i = 0;
        const tokens = [];

        while (i < text.length) {
            const char = text[i];
            if (char === ' ') {
                tokens.push({ type: 'space', text: ' ' });
                i++; continue;
            }
            if (!char.match(/[a-z0-9]/i)) {
                tokens.push({ type: 'punct', text: char });
                i++; continue;
            }

            // --- Split Logic ---
            let tokenText = char;

            if (splitMode === 'words') {
                // Grab all continuous alphanumerics
                const remaining = text.slice(i);
                const match = remaining.match(/^[a-z0-9]+/i);
                if (match) tokenText = match[0];

            } else if (splitMode === 'syllables') {
                // Existing syllable logic
                const remaining = text.slice(i);
                // Regex for syllable approximation:
                // 1. One or more non-vowels (optional)
                // 2. One or more vowels/numbers
                // OR: Just non-vowels if that's all that's left? 
                // The original regex was: /^([^aeiouy\s]*[aeiouy0-9]+|[^aeiouy\s]+)/i
                const match = remaining.match(/^([^aeiouy\s]*[aeiouy0-9]+|[^aeiouy\s]+)/i);
                if (match) tokenText = match[0];

            } else {
                // 'chars' -> just single char, already set by default
                tokenText = char;
            }

            tokens.push({ type: 'token', text: tokenText });
            i += tokenText.length;
        }
        return tokens;
    }

    getDurationPerChar() {
        // Slider: 0.05 (Slow?) -> 0.2 (Fast?)
        // Originally: duration = slider_value. So 0.05=Fast, 0.2=Slow.
        // User wants: Higher slider = Faster (Shorter duration).
        // Let's invert: duration ~ (0.25 - slider_value).
        // If slider 0.05: duration 0.20 (Slow)
        // If slider 0.20: duration 0.05 (Fast)
        const val = parseFloat(this.speedSlider.value);
        return 0.25 - val;
    }

    synthesizeOscillators(context, destinationNode, tokens, dryRun, mode) {
        let basePitch = parseInt(this.pitchSlider.value, 10);
        const speed = this.getDurationPerChar(); // Now correctly "Duration"
        const timbre = parseInt(this.timbreSlider.value, 10);
        const pauseDuration = parseInt(this.pauseSlider.value, 10) / 1000;
        const pitchVariance = parseInt(this.varianceSlider.value, 10);

        const now = context.currentTime;
        let timeOffset = 0;
        let tokenIndex = 0;
        const timeline = [];

        tokens.forEach(token => {
            if (token.type === 'space') {
                timeline.push({ type: 'space', text: ' ', startTime: timeOffset, duration: speed * 0.4 });
                timeOffset += speed * 0.4;
                return;
            }
            if (token.type === 'punct') {
                let dur = speed * 0.5;
                if (token.text.match(/[.,!?]/)) dur = pauseDuration;
                timeline.push({ type: 'punct', text: token.text, startTime: timeOffset, duration: dur });
                timeOffset += dur;
                return;
            }

            const tokenLower = token.text.toLowerCase();
            const actualDuration = token.text.length * speed;

            if (!dryRun) {
                const osc = context.createOscillator();
                const filter = context.createBiquadFilter();
                const gainNode = context.createGain();

                osc.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(destinationNode);

                // --- Mode Configuration ---
                let oscType = 'sawtooth';
                let attackTime = 0.03;
                let releaseTime = 0.05;
                let sustainLevel = 0.4;

                if (mode === 'retro') {
                    oscType = 'square';
                    attackTime = 0.005; // Snappy
                    releaseTime = 0.005;
                    sustainLevel = 0.25; // Square is loud
                } else if (mode === 'alien') {
                    oscType = 'triangle';
                    attackTime = 0.01;
                    releaseTime = 0.1;
                } else if (mode === 'beast') {
                    oscType = 'sawtooth';
                    attackTime = 0.05;
                }

                osc.type = oscType;
                const charCode = tokenLower.charCodeAt(0);
                const pitchOffset = ((charCode - 97) % 6) * pitchVariance;
                const intonation = Math.sin(tokenIndex * 0.5) * pitchVariance;

                let frequency = basePitch + pitchOffset + intonation;
                osc.frequency.setValueAtTime(frequency, now + timeOffset);

                // Beast Growl (Frequency Jitter)
                if (mode === 'beast') {
                    const jitterAmount = 50;
                    // Basic jitter simulation using linearRamp. 
                    // True noise needs a buffer, but rapid ramps work for "roughness"
                    for (let t = 0; t < actualDuration; t += 0.02) {
                        const jitter = (Math.random() - 0.5) * jitterAmount;
                        osc.frequency.setValueAtTime(frequency + jitter, now + timeOffset + t);
                    }
                }

                // Alien vibrato
                if (mode === 'alien') {
                    osc.frequency.linearRampToValueAtTime(frequency + (pitchVariance * 2), now + timeOffset + (actualDuration * 0.5));
                    osc.frequency.linearRampToValueAtTime(frequency, now + timeOffset + actualDuration);
                }

                filter.type = 'lowpass';
                filter.Q.value = 5;
                const modulation = (charCode % 5) * 200;
                const filterFreq = timbre + modulation;
                filter.frequency.setValueAtTime(filterFreq, now + timeOffset);
                filter.frequency.linearRampToValueAtTime(filterFreq + 300, now + timeOffset + (actualDuration * 0.5));

                const startTime = now + timeOffset;

                // --- Envelope ---
                gainNode.gain.setValueAtTime(0, startTime);

                if (mode === 'retro') {
                    // Boxy envelope
                    gainNode.gain.setValueAtTime(sustainLevel, startTime + attackTime);
                    gainNode.gain.setValueAtTime(sustainLevel, startTime + actualDuration - releaseTime);
                } else if (mode === 'chorus') {
                    // Main OSC handled, added detuned ones
                    const detune1 = context.createOscillator();
                    const detune2 = context.createOscillator();
                    detune1.type = 'sawtooth';
                    detune2.type = 'sawtooth';
                    detune1.frequency.setValueAtTime(frequency, now + timeOffset);
                    detune2.frequency.setValueAtTime(frequency, now + timeOffset);
                    detune1.detune.value = -15; // cents
                    detune2.detune.value = 15;

                    const dGain = context.createGain();
                    dGain.gain.value = 0.3; // Lower volume for backing
                    detune1.connect(dGain);
                    detune2.connect(dGain);
                    dGain.connect(filter);

                    detune1.start(startTime);
                    detune1.stop(startTime + actualDuration + releaseTime + 0.1);
                    detune2.start(startTime);
                    detune2.stop(startTime + actualDuration + releaseTime + 0.1);

                    gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + attackTime);
                    gainNode.gain.setValueAtTime(sustainLevel, startTime + actualDuration * 0.8);

                } else if (mode === 'crystal') {
                    // FM Synthesis
                    // Carrier is 'osc' (already created)
                    osc.type = 'sine';

                    // Modulator
                    const mod = context.createOscillator();
                    mod.type = 'sine';
                    mod.frequency.setValueAtTime(frequency * 2.0, now + timeOffset); // 2:1 ratio for harmonic bell

                    const modGain = context.createGain();
                    modGain.gain.setValueAtTime(500, now + timeOffset); // Modulation Index depth
                    modGain.gain.exponentialRampToValueAtTime(1, now + timeOffset + actualDuration); // Ping decay

                    mod.connect(modGain);
                    modGain.connect(osc.frequency);
                    mod.start(startTime);
                    mod.stop(startTime + actualDuration + releaseTime);

                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + 0.01); // Instant attack
                    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + actualDuration); // Bell decay

                } else {
                    // Default ramp envelope
                    gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + attackTime);
                    gainNode.gain.setValueAtTime(sustainLevel, startTime + actualDuration * 0.8);
                }

                gainNode.gain.linearRampToValueAtTime(0, startTime + actualDuration + releaseTime);

                osc.start(startTime);
                osc.stop(startTime + actualDuration + releaseTime + 0.1);
            }

            timeline.push({ type: 'token', text: token.text, startTime: timeOffset, duration: actualDuration });
            timeOffset += actualDuration * 0.90;
            tokenIndex++;
        });

        return { duration: timeOffset + 0.5, timeline: timeline };
    }

    synthesizeSamples(context, destinationNode, tokens, dryRun, mode) {
        // Check Settings
        let rawPitch = parseInt(this.pitchSlider.value, 10);
        // Map rawPitch to playbackRate. 600 is default. 
        // 600 -> 1.0. 
        // 1200 -> 2.0. 
        // 200 -> 0.33.
        const basePlaybackRate = rawPitch / 600.0;

        const speedVal = this.getDurationPerChar();
        let charDuration = speedVal * 0.9; // Slight adjustment for audio files

        const pauseDuration = parseInt(this.pauseSlider.value, 10) / 1000;
        const timbreFreq = parseInt(this.timbreSlider.value, 10);
        const pitchVariance = parseInt(this.varianceSlider.value, 10);

        let targetBuffer = this.libraryBuffer;
        if (mode === 'demon_sampled' && this.demonBuffer) {
            targetBuffer = this.demonBuffer;
        }

        const library_letter_secs = 0.15;
        const sampleRate = targetBuffer.sampleRate;
        const samplesPerLetterLib = Math.floor(library_letter_secs * sampleRate);

        const now = context.currentTime;
        let timeOffset = 0;
        const timeline = [];
        let tokenIndex = 0;

        tokens.forEach(token => {
            if (token.type === 'space') {
                timeline.push({ type: 'space', text: ' ', startTime: timeOffset, duration: charDuration });
                timeOffset += charDuration;
                return;
            }
            if (token.type === 'punct') {
                let dur = charDuration;
                if (token.text.match(/[.,!?]/)) dur = pauseDuration;
                timeline.push({ type: 'punct', text: token.text, startTime: timeOffset, duration: dur });
                timeOffset += dur;
                return;
            }

            const tokenText = token.text.toUpperCase();
            const firstChar = tokenText[0];

            if (!firstChar.match(/[A-Z]/)) {
                timeOffset += charDuration;
                return;
            }

            const charCode = firstChar.charCodeAt(0) - 65;
            const startSample = charCode * samplesPerLetterLib;
            const actualDuration = tokenText.length * charDuration;

            if (!dryRun) {
                const source = context.createBufferSource();
                const gainNode = context.createGain();
                const filterNode = context.createBiquadFilter();

                // Chain: Source -> Filter -> Gain -> Destination
                source.buffer = targetBuffer;
                source.connect(filterNode);
                filterNode.connect(gainNode);
                gainNode.connect(destinationNode);

                // --- 1. Apply Pitch & Variance (Playback Rate) ---
                // Variance in Oscillator mode is +/- freq.
                // Here we jitter the playback rate.
                // pitchVariance is 0-100.
                // Let's say max variance makes rate +/- 20%.
                const varianceFactor = (pitchVariance / 100) * 0.2;
                // Pseudo-random based on tokenIndex to be deterministic for repeats? 
                // Or just Math.random()? Math.sin is used in oscillator. Let's use Math.sin for consistency.
                const jitter = Math.sin(tokenIndex * 0.5) * varianceFactor;
                source.playbackRate.value = basePlaybackRate + jitter;

                // --- 2. Apply Timbre (Filter) ---
                // Lowpass filter to muffle or brighten sound.
                // Timbre slider 100 - 2000.
                filterNode.type = 'lowpass';
                filterNode.frequency.value = timbreFreq;
                // Add a little dynamic envelope to filter for "wah" effect?
                // Maybe subtle.
                filterNode.frequency.linearRampToValueAtTime(timbreFreq + 200, now + timeOffset + (actualDuration * 0.5));

                const startTime = now + timeOffset;
                const offsetInLibrary = startSample / sampleRate;

                const isRobot = (mode === 'robot');

                if (isRobot) {
                    source.loop = true;
                    // Tighter loop for Robot
                    source.loopStart = offsetInLibrary + 0.02;
                    source.loopEnd = offsetInLibrary + 0.035;

                    source.start(startTime, offsetInLibrary);
                    source.stop(startTime + actualDuration);

                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(0.8, startTime + 0.01);
                    gainNode.gain.setValueAtTime(0.8, startTime + actualDuration - 0.01);
                    gainNode.gain.linearRampToValueAtTime(0, startTime + actualDuration);

                } else {
                    // Sampled (Classic)
                    source.loop = false;
                    source.start(startTime, offsetInLibrary);
                    source.stop(startTime + actualDuration);

                    gainNode.gain.setValueAtTime(0.8, startTime);
                    gainNode.gain.setValueAtTime(0.8, startTime + actualDuration - 0.02);
                    gainNode.gain.linearRampToValueAtTime(0, startTime + actualDuration);
                }
            }



            timeline.push({ type: 'token', text: token.text, startTime: timeOffset, duration: actualDuration });
            timeOffset += actualDuration;
            tokenIndex++;
        });

        return { duration: timeOffset + 0.5, timeline: timeline };
    }

    async togglePlayback() {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    }

    speakRandomChar() {
        if (this.isPlaying) this.stopPlayback(); // Interrupt current if needed
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const char = letters[Math.floor(Math.random() * letters.length)];
        // Play without UI takeover
        this.playText(char, false);
    }

    async startPlayback() {
        this.handleInput();
        if (!this.transcribedText) return;
        this.playText(this.transcribedText, true);
    }

    async playText(text, isFullPlayback = true) {
        if (!this.audioCtx || this.audioCtx.state === 'closed') {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } else if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        this.isPlaying = true;

        if (isFullPlayback) {
            this.updatePlayButtonUI();
            this.transcriptionInput.style.display = 'none';
            this.randomQuoteBtn.style.display = 'none';
            this.karaokeDisplay.style.display = 'block';
        }

        // Create a new master gain for this session to allow clean stopping
        this.currentSessionGain = this.audioCtx.createGain();
        this.currentSessionGain.connect(this.audioCtx.destination);

        // Pass text override
        const { duration, timeline } = this.scheduleSynthesis(this.audioCtx, this.currentSessionGain, false, text);

        if (isFullPlayback) {
            this.karaokeDisplay.innerHTML = '';
            timeline.forEach((item) => {
                const span = document.createElement('span');
                span.textContent = item.text;
                if (item.type === 'token') {
                    span.classList.add('karaoke-token');
                }
                this.karaokeDisplay.appendChild(span);
                item.element = span;
            });
        }

        const startTime = this.audioCtx.currentTime;

        const tick = () => {
            if (!this.isPlaying) return;
            const elapsedTime = this.audioCtx.currentTime - startTime;
            let currentType = null;

            timeline.forEach(item => {
                if (elapsedTime >= item.startTime && elapsedTime < item.startTime + item.duration) {
                    if (isFullPlayback && item.element) item.element.classList.add('active');
                    currentType = item.type;
                } else {
                    if (isFullPlayback && item.element) item.element.classList.remove('active');
                }
            });

            // Robot Animation Logic
            if (this.isPlaying && currentType === 'token') {
                // Talking state: Alternate robot2 and robot3
                // Use a slower cadence than frames, e.g. every 100ms
                const frameIndex = Math.floor(Date.now() / 150) % 2;
                const targetSrc = frameIndex === 0 ? 'robot2.webp' : 'robot3.webp';
                if (this.robotAvatar.getAttribute('src') !== targetSrc) {
                    this.robotAvatar.src = targetSrc;
                }
            } else {
                // Pause/Space/Idle state
                if (this.robotAvatar.getAttribute('src') !== 'robot1.webp') {
                    this.robotAvatar.src = 'robot1.webp';
                }
            }

            this.animationFrameId = requestAnimationFrame(tick);
        };
        tick();

        this.playbackTimer = setTimeout(() => {
            if (this.isPlaying) {
                this.stopPlayback(isFullPlayback);
            }
        }, duration * 1000);
    }

    async stopPlayback(isFullPlayback = true) {
        if (this.playbackTimer) clearTimeout(this.playbackTimer);
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        // Immediate silence by disconnecting the session node
        if (this.currentSessionGain) {
            this.currentSessionGain.disconnect();
            this.currentSessionGain = null;
        }

        if (this.audioCtx && this.audioCtx.state === 'running') {
            await this.audioCtx.suspend();
        }

        this.isPlaying = false;

        // Always reset UI if it was full playback, or if we just want to ensure clean state
        // If we are stopping a 'robot click' (isFullPlayback=false), we don't need to revert UI 
        // because we never changed it. But if we interrupted full playback with robot click,
        // we might be in mixed state. 
        // Simplest is: check DOM state or just force reset if needed.

        // But stopPlayback is called by user Click (Toggle) or Timer.
        // If called by Timer from robot click -> isFullPlayback=false.
        // If called by User Click -> they click "Stop" button -> isFullPlayback=true usually?
        // Actually toggle calls stopPlayback(). 
        // Refactor stopPlayback to just reset everything to idle.

        this.updatePlayButtonUI(); // Resets button to "Speak!"

        this.karaokeDisplay.style.display = 'none';
        this.transcriptionInput.style.display = 'block';
        this.randomQuoteBtn.style.display = 'flex';

        if (this.robotAvatar) this.robotAvatar.src = 'robot1.webp';
    }

    updatePlayButtonUI() {
        if (this.isPlaying) {
            this.playIconWrapper.innerHTML = '<i data-lucide="square"></i>';
            this.playTextSpan.textContent = "Stop";
            this.playAnimaleseBtn.classList.add('recording');
            this.playAnimaleseBtn.classList.remove('play');
        } else {
            this.playIconWrapper.innerHTML = '<i data-lucide="dog"></i>';
            this.playTextSpan.textContent = "Speak!";
            this.playAnimaleseBtn.classList.remove('recording');
            this.playAnimaleseBtn.classList.add('play');
        }
        lucide.createIcons();
    }

    async downloadAudio() {
        this.handleInput();
        if (!this.transcribedText) return;

        const originalText = this.downloadBtn.innerHTML;
        this.downloadBtn.innerHTML = '<i data-lucide="loader"></i> Rendering...';
        lucide.createIcons();

        // Check buffer for sample mode
        const mode = this.synthModeSelector.value;
        if ((mode === 'characters' || mode === 'robot') && !this.isLibraryLoaded) {
            console.log("Waiting for library...");
        }

        const speed = this.getDurationPerChar(); // Use consistent getter
        let calculatedDuration = this.transcribedText.length * speed * 2 + 3.0;

        const sampleRate = 44100;
        const offlineCtx = new OfflineAudioContext(1, calculatedDuration * sampleRate, sampleRate);

        this.scheduleSynthesis(offlineCtx, offlineCtx.destination, false);

        try {
            const renderedBuffer = await offlineCtx.startRendering();
            this.saveBufferAsWav(renderedBuffer);

            this.downloadBtn.innerHTML = '<i data-lucide="check"></i> Done!';
            lucide.createIcons();

            setTimeout(() => {
                this.downloadBtn.innerHTML = originalText;
                lucide.createIcons();
            }, 2000);
        } catch (e) {
            console.error(e);
            this.downloadBtn.innerHTML = "Error";
            setTimeout(() => {
                this.downloadBtn.innerHTML = originalText;
                lucide.createIcons();
            }, 2000);
        }
    }

    async exportTiming() {
        this.handleInput();
        if (!this.transcribedText) return;

        const originalText = this.exportTimingBtn.innerHTML;
        this.exportTimingBtn.innerHTML = '<i data-lucide="loader"></i> Exporting...';
        lucide.createIcons();

        // Generate timeline without audio
        const { duration, timeline } = this.scheduleSynthesis(this.audioCtx, null, true); // dryRun=true

        const exportData = {
            totalDuration: duration,
            timeline: timeline.map(item => ({
                text: item.text,
                startTime: parseFloat(item.startTime.toFixed(3)),
                duration: parseFloat(item.duration.toFixed(3)),
                type: item.type
            }))
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        let filenameText = this.transcribedText.trim();
        filenameText = filenameText.replace(/[^a-zA-Z0-9\s]/g, "");
        const words = filenameText.split(/\s+/).filter(w => w.length > 0);
        let safeName = words.slice(0, 5).join("_");
        if (safeName.length > 30) safeName = safeName.substring(0, 30);
        if (!safeName) safeName = "animalese_timing";

        const filename = `${safeName}_timing.json`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.exportTimingBtn.innerHTML = '<i data-lucide="check"></i> Done!';
            lucide.createIcons();

            setTimeout(() => {
                this.exportTimingBtn.innerHTML = originalText;
                lucide.createIcons();
            }, 2000);
        }, 100);
    }

    saveBufferAsWav(buffer) {
        const wavBytes = this.bufferToWav(buffer);
        const blob = new Blob([wavBytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        let filenameText = this.transcribedText.trim();
        filenameText = filenameText.replace(/[^a-zA-Z0-9\s]/g, "");
        const words = filenameText.split(/\s+/).filter(w => w.length > 0);
        let safeName = words.slice(0, 5).join("_");
        if (safeName.length > 30) safeName = safeName.substring(0, 30);
        if (!safeName) safeName = "animalese";

        const filename = `${safeName}.wav`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    bufferToWav(abuffer) {
        const numOfChan = abuffer.numberOfChannels;
        const length = abuffer.length * numOfChan * 2 + 44;
        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);
        const channels = [];
        let i;
        let sample;
        let offset = 0;
        let pos = 0;

        setUint32(0x46464952);                         // "RIFF"
        setUint32(length - 8);                         // file length - 8
        setUint32(0x45564157);                         // "WAVE"

        setUint32(0x20746d66);                         // "fmt " chunk
        setUint32(16);                                 // length = 16
        setUint16(1);                                  // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2);                      // block-align
        setUint16(16);                                 // 16-bit
        setUint32(0x61746164);                         // "data" - chunk
        setUint32(length - pos - 4);                   // chunk length

        for (i = 0; i < abuffer.numberOfChannels; i++)
            channels.push(abuffer.getChannelData(i));

        while (pos < abuffer.length) {
            for (i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][pos]));
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
                view.setInt16(44 + offset, sample, true);
                offset += 2;
            }
            pos++;
        }

        return buffer;

        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    }

    ensureAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    updateClock() {
        const now = new Date();
        this.clockElement.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    preloadRobotImages() {
        ['robot1.webp', 'robot2.webp', 'robot3.webp'].forEach(src => {
            const img = new Image();
            img.src = src;
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    new ACVoiceChanger();
});
