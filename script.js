class ACVoiceChanger {
    constructor() {
        this.transcribedText = "";
        this.isPlaying = false;

        // UI Elements
        this.playAnimaleseBtn = document.getElementById('play-animalese-btn');
        this.playIconWrapper = this.playAnimaleseBtn.querySelector('.icon-wrapper');
        this.playTextSpan = this.playAnimaleseBtn.querySelector('.btn-text');

        this.downloadBtn = document.getElementById('download-btn');
        this.transcriptionInput = document.getElementById('transcription-input');
        this.karaokeDisplay = document.getElementById('karaoke-display');

        this.clockElement = document.getElementById('clock');

        // Settings Reset
        this.settingsArea = document.getElementById('settings-area');
        this.resetDefaultsBtn = document.getElementById('reset-defaults-btn');

        // Settings Sliders
        this.pitchSlider = document.getElementById('pitch-slider');
        this.speedSlider = document.getElementById('speed-slider');
        this.timbreSlider = document.getElementById('timbre-slider');
        this.pauseSlider = document.getElementById('pause-slider');
        this.varianceSlider = document.getElementById('variance-slider');

        // Settings Displays
        this.pitchDisplay = document.getElementById('val-pitch');
        this.speedDisplay = document.getElementById('val-speed');
        this.timbreDisplay = document.getElementById('val-timbre');
        this.pauseDisplay = document.getElementById('val-text-pause'); // Renamed ID in HTML
        this.varianceDisplay = document.getElementById('val-variance');

        // Init Audio Context
        this.audioCtx = null;
        this.playbackTimer = null;
        this.animationFrameId = null;

        // Bind Events
        this.playAnimaleseBtn.addEventListener('click', () => this.togglePlayback());
        this.downloadBtn.addEventListener('click', () => this.downloadAudio());

        this.resetDefaultsBtn.addEventListener('click', () => this.resetDefaults());

        this.transcriptionInput.addEventListener('input', () => {
            this.transcribedText = this.transcriptionInput.value;
            const hasText = this.transcribedText.trim().length > 0;
            this.playAnimaleseBtn.disabled = !hasText;
            this.downloadBtn.disabled = !hasText;
        });

        // Settings Listeners
        this.setupSliderListener(this.pitchSlider, this.pitchDisplay);
        this.setupSliderListener(this.speedSlider, this.speedDisplay);
        this.setupSliderListener(this.timbreSlider, this.timbreDisplay);
        this.setupSliderListener(this.pauseSlider, this.pauseDisplay, ' ms'); // Add suffix support
        this.setupSliderListener(this.varianceSlider, this.varianceDisplay);

        // Clock
        this.updateClock();
        setInterval(() => this.updateClock(), 1000 * 60);
    }

    setupSliderListener(slider, display, suffix = '') {
        slider.addEventListener('input', () => {
            display.textContent = slider.value + suffix;
        });
    }

    resetDefaults() {
        // Default Values
        const defaults = {
            pitch: 600,
            speed: 0.09,
            timbre: 400,
            pause: 150,
            variance: 50
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
    }

    // --- Core Synthesis Logic ---
    scheduleSynthesis(context, destinationNode, dryRun = false) {
        if (!this.transcribedText) return { duration: 0, timeline: [] };

        const text = this.transcribedText.toLowerCase();

        // Get Settings
        const basePitch = parseInt(this.pitchSlider.value, 10);
        const speed = parseFloat(this.speedSlider.value);
        const timbre = parseInt(this.timbreSlider.value, 10);
        const pauseDuration = parseInt(this.pauseSlider.value, 10) / 1000;
        const pitchVariance = parseInt(this.varianceSlider.value, 10);

        const now = context.currentTime;
        let timeOffset = 0;

        let i = 0;
        let tokenIndex = 0;
        const timeline = [];

        while (i < text.length) {
            const char = text[i];

            // Handle Space
            if (char === ' ') {
                timeline.push({ type: 'space', text: ' ', startTime: timeOffset, duration: speed * 0.4 });
                timeOffset += speed * 0.4;
                i++;
                continue;
            }

            // Handle Punctuation
            if (!char.match(/[a-z0-9]/)) {
                let dur = speed * 0.5;
                if (char.match(/[.,!?]/)) dur = pauseDuration;

                timeline.push({ type: 'punct', text: char, startTime: timeOffset, duration: dur });
                timeOffset += dur;
                i++;
                continue;
            }

            // Tokenization
            const remaining = text.slice(i);
            const match = remaining.match(/^([^aeiouy\s]*[aeiouy0-9]+|[^aeiouy\s]+)/i);

            let token = char;
            if (match) token = match[0];

            const originalToken = this.transcribedText.substring(i, i + token.length);

            // Calculate Audio Parameters
            const actualDuration = speed * token.length;

            if (!dryRun) {
                const osc = context.createOscillator();
                const filter = context.createBiquadFilter();
                const gainNode = context.createGain();

                osc.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(destinationNode);

                // 1. WAVEFORM
                osc.type = 'sawtooth';

                // 2. PITCH
                const charCode = token.charCodeAt(0);
                const pitchOffset = ((charCode - 97) % 6) * pitchVariance;
                const intonation = Math.sin(tokenIndex * 0.5) * pitchVariance;
                osc.frequency.setValueAtTime(basePitch + pitchOffset + intonation, now + timeOffset);

                // 3. FILTER
                filter.type = 'lowpass';
                filter.Q.value = 5;
                const modulation = (charCode % 5) * 200;
                const filterFreq = timbre + modulation;

                filter.frequency.setValueAtTime(filterFreq, now + timeOffset);
                filter.frequency.linearRampToValueAtTime(filterFreq + 300, now + timeOffset + (actualDuration * 0.5));

                // 4. AMPLITUDE
                const startTime = now + timeOffset;
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(0.4, startTime + 0.03);
                gainNode.gain.setValueAtTime(0.4, startTime + actualDuration * 0.8);
                gainNode.gain.linearRampToValueAtTime(0, startTime + actualDuration + 0.05);

                osc.start(startTime);
                osc.stop(startTime + actualDuration + 0.1);
            }

            timeline.push({
                type: 'token',
                text: originalToken,
                startTime: timeOffset,
                duration: actualDuration
            });

            timeOffset += actualDuration * 0.90;
            i += token.length;
            tokenIndex++;
        }

        return { duration: timeOffset + 0.5, timeline: timeline };
    }

    async togglePlayback() {
        if (this.isPlaying) {
            this.stopPlayback();
        } else {
            this.startPlayback();
        }
    }

    async startPlayback() {
        if (!this.audioCtx || this.audioCtx.state === 'closed') {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } else if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        this.transcribedText = this.transcriptionInput.value;
        if (!this.transcribedText) return;

        this.isPlaying = true;
        this.updatePlayButtonUI();

        this.transcriptionInput.style.display = 'none';
        this.karaokeDisplay.style.display = 'block';

        const { duration, timeline } = this.scheduleSynthesis(this.audioCtx, this.audioCtx.destination);

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

        const startTime = this.audioCtx.currentTime;

        const tick = () => {
            if (!this.isPlaying) return;
            const elapsedTime = this.audioCtx.currentTime - startTime;

            timeline.forEach(item => {
                if (elapsedTime >= item.startTime && elapsedTime < item.startTime + item.duration) {
                    if (item.element) item.element.classList.add('active');
                } else {
                    if (item.element) item.element.classList.remove('active');
                }
            });

            this.animationFrameId = requestAnimationFrame(tick);
        };
        tick();

        this.playbackTimer = setTimeout(() => {
            if (this.isPlaying) {
                this.stopPlayback();
            }
        }, duration * 1000);
    }

    async stopPlayback() {
        if (this.playbackTimer) clearTimeout(this.playbackTimer);
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

        if (this.audioCtx) {
            await this.audioCtx.close();
            this.audioCtx = null;
        }

        this.isPlaying = false;
        this.updatePlayButtonUI();

        this.karaokeDisplay.style.display = 'none';
        this.transcriptionInput.style.display = 'block';
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
        this.transcribedText = this.transcriptionInput.value;
        if (!this.transcribedText) return;

        const originalText = this.downloadBtn.innerHTML;
        this.downloadBtn.innerHTML = '<i data-lucide="loader"></i> Rendering...';
        lucide.createIcons();

        const speed = parseFloat(this.speedSlider.value);
        let calculatedDuration = this.transcribedText.length * speed * 2 + 2.0;

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
}

window.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    new ACVoiceChanger();
});
