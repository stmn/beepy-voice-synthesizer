/**
 * Beepy Voice Synthesizer - JavaScript API for synthesizing cute beepy voices
 * 
 * Usage:
 *   const synth = BeepyVoiceSynth(config)
 *   await synth.speak('Hello world!')
 *   
 *   const parts = synth.karaoke('Hello world!')
 *   for (const part of parts) {
 *     console.log(part.text())
 *     await part.speak()
 *   }
 */

// Directory this script was loaded from. Used as the default basePath so the
// audio libraries (animalese.wav, demon.wav) are resolved next to the script
// without any configuration. Must be read at load time - document.currentScript
// is only set while the script is initially executing.
const BEEPY_SCRIPT_BASE_PATH = (() => {
    if (typeof document === 'undefined') return './';
    const src = document.currentScript && document.currentScript.src;
    return src ? src.slice(0, src.lastIndexOf('/') + 1) : './';
})();

class BeepyVoiceSynthCore {
    constructor(config = {}) {
        // Default values matching the form defaults in script.js
        this.config = {
            pitch: config.pitch ?? 600,
            speed: config.speed ?? 0.14,
            timbre: config.timbre ?? 400,
            pause: config.pause ?? 150,
            variance: config.variance ?? 50,
            mode: config.mode ?? 'syllables',
            splitMode: config.splitMode ?? 'syllables',
            basePath: config.basePath ?? BEEPY_SCRIPT_BASE_PATH
        };

        this.audioCtx = null;
        this.libraryBuffer = null;
        this.demonBuffer = null;
        this.isLibraryLoaded = false;
        this._loadingPromise = null;
    }

    /**
     * Ensure AudioContext exists and is running
     */
    async ensureAudioContext() {
        if (!this.audioCtx || this.audioCtx.state === 'closed') {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        return this.audioCtx;
    }

    /**
     * Load audio libraries (animalese.wav and demon.wav)
     */
    async loadLibraries() {
        if (this._loadingPromise) return this._loadingPromise;

        this._loadingPromise = (async () => {
            await this.ensureAudioContext();

            // Load Animalese library
            try {
                const response = await fetch(this.config.basePath + 'animalese.wav');
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    this.libraryBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                    this.isLibraryLoaded = true;
                }
            } catch (e) {
                console.warn('Could not load animalese.wav:', e);
            }

            // Load Demon library
            try {
                const response = await fetch(this.config.basePath + 'demon.wav');
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    this.demonBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
                }
            } catch (e) {
                console.warn('Could not load demon.wav:', e);
            }
        })();

        return this._loadingPromise;
    }

    /**
     * Get duration per character based on speed setting
     */
    getDurationPerChar() {
        return 0.25 - this.config.speed;
    }

    /**
     * Tokenize text into speakable parts
     */
    tokenize(text, splitMode) {
        let i = 0;
        const tokens = [];

        while (i < text.length) {
            const char = text[i];
            if (char === ' ') {
                tokens.push({ type: 'space', text: ' ' });
                i++;
                continue;
            }
            if (!char.match(/[a-z0-9]/i)) {
                tokens.push({ type: 'punct', text: char });
                i++;
                continue;
            }

            let tokenText = char;

            if (splitMode === 'words') {
                const remaining = text.slice(i);
                const match = remaining.match(/^[a-z0-9]+/i);
                if (match) tokenText = match[0];
            } else if (splitMode === 'syllables') {
                const remaining = text.slice(i);
                const match = remaining.match(/^([^aeiouy\s]*[aeiouy0-9]+|[^aeiouy\s]+)/i);
                if (match) tokenText = match[0];
            }

            tokens.push({ type: 'token', text: tokenText });
            i += tokenText.length;
        }
        return tokens;
    }

    /**
     * Schedule synthesis using oscillators (for oscillator-based modes)
     */
    synthesizeOscillators(context, destinationNode, tokens, dryRun, mode) {
        const basePitch = this.config.pitch;
        const speed = this.getDurationPerChar();
        const timbre = this.config.timbre;
        const pauseDuration = this.config.pause / 1000;
        const pitchVariance = this.config.variance;

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

            if (!dryRun && destinationNode) {
                const osc = context.createOscillator();
                const filter = context.createBiquadFilter();
                const gainNode = context.createGain();

                osc.connect(filter);
                filter.connect(gainNode);
                gainNode.connect(destinationNode);

                let oscType = 'sawtooth';
                let attackTime = 0.03;
                let releaseTime = 0.05;
                let sustainLevel = 0.4;

                if (mode === 'retro') {
                    oscType = 'square';
                    attackTime = 0.005;
                    releaseTime = 0.005;
                    sustainLevel = 0.25;
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

                if (mode === 'beast') {
                    const jitterAmount = 50;
                    for (let t = 0; t < actualDuration; t += 0.02) {
                        const jitter = (Math.random() - 0.5) * jitterAmount;
                        osc.frequency.setValueAtTime(frequency + jitter, now + timeOffset + t);
                    }
                }

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

                gainNode.gain.setValueAtTime(0, startTime);

                if (mode === 'retro') {
                    gainNode.gain.setValueAtTime(sustainLevel, startTime + attackTime);
                    gainNode.gain.setValueAtTime(sustainLevel, startTime + actualDuration - releaseTime);
                } else if (mode === 'chorus') {
                    const detune1 = context.createOscillator();
                    const detune2 = context.createOscillator();
                    detune1.type = 'sawtooth';
                    detune2.type = 'sawtooth';
                    detune1.frequency.setValueAtTime(frequency, now + timeOffset);
                    detune2.frequency.setValueAtTime(frequency, now + timeOffset);
                    detune1.detune.value = -15;
                    detune2.detune.value = 15;

                    const dGain = context.createGain();
                    dGain.gain.value = 0.3;
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
                    osc.type = 'sine';

                    const mod = context.createOscillator();
                    mod.type = 'sine';
                    mod.frequency.setValueAtTime(frequency * 2.0, now + timeOffset);

                    const modGain = context.createGain();
                    modGain.gain.setValueAtTime(500, now + timeOffset);
                    modGain.gain.exponentialRampToValueAtTime(1, now + timeOffset + actualDuration);

                    mod.connect(modGain);
                    modGain.connect(osc.frequency);
                    mod.start(startTime);
                    mod.stop(startTime + actualDuration + releaseTime);

                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + 0.01);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + actualDuration);
                } else {
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

    /**
     * Schedule synthesis using audio samples
     */
    synthesizeSamples(context, destinationNode, tokens, dryRun, mode) {
        const rawPitch = this.config.pitch;
        const basePlaybackRate = rawPitch / 600.0;
        const speedVal = this.getDurationPerChar();
        let charDuration = speedVal * 0.9;
        const pauseDuration = this.config.pause / 1000;
        const timbreFreq = this.config.timbre;
        const pitchVariance = this.config.variance;

        let targetBuffer = this.libraryBuffer;
        if (mode === 'demon_sampled' && this.demonBuffer) {
            targetBuffer = this.demonBuffer;
        }

        if (!targetBuffer) {
            return { duration: 0, timeline: [] };
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

            if (!dryRun && destinationNode) {
                const source = context.createBufferSource();
                const gainNode = context.createGain();
                const filterNode = context.createBiquadFilter();

                source.buffer = targetBuffer;
                source.connect(filterNode);
                filterNode.connect(gainNode);
                gainNode.connect(destinationNode);

                const varianceFactor = (pitchVariance / 100) * 0.2;
                const jitter = Math.sin(tokenIndex * 0.5) * varianceFactor;
                source.playbackRate.value = basePlaybackRate + jitter;

                filterNode.type = 'lowpass';
                filterNode.frequency.value = timbreFreq;
                filterNode.frequency.linearRampToValueAtTime(timbreFreq + 200, now + timeOffset + (actualDuration * 0.5));

                const startTime = now + timeOffset;
                const offsetInLibrary = startSample / sampleRate;

                const isRobot = (mode === 'robot');

                if (isRobot) {
                    source.loop = true;
                    source.loopStart = offsetInLibrary + 0.02;
                    source.loopEnd = offsetInLibrary + 0.035;

                    source.start(startTime, offsetInLibrary);
                    source.stop(startTime + actualDuration);

                    gainNode.gain.setValueAtTime(0, startTime);
                    gainNode.gain.linearRampToValueAtTime(0.8, startTime + 0.01);
                    gainNode.gain.setValueAtTime(0.8, startTime + actualDuration - 0.01);
                    gainNode.gain.linearRampToValueAtTime(0, startTime + actualDuration);
                } else {
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

    /**
     * Schedule synthesis based on mode
     */
    scheduleSynthesis(context, destinationNode, dryRun = false, text = '') {
        if (!text) return { duration: 0, timeline: [] };

        const mode = this.config.mode;
        let splitMode = this.config.splitMode;

        // Force chars split mode for sampled modes
        if (mode === 'characters' || mode === 'robot' || mode === 'demon_sampled') {
            splitMode = 'chars';
        }

        const tokens = this.tokenize(text, splitMode);

        if ((mode === 'characters' || mode === 'robot' || mode === 'demon_sampled') && this.isLibraryLoaded) {
            return this.synthesizeSamples(context, destinationNode, tokens, dryRun, mode);
        } else {
            return this.synthesizeOscillators(context, destinationNode, tokens, dryRun, mode);
        }
    }

    /**
     * Get timeline for text (dry run, no audio)
     */
    getTimeline(text) {
        const dummyCtx = { currentTime: 0 };
        return this.scheduleSynthesis(dummyCtx, null, true, text);
    }

    /**
     * Speak the entire text
     * @param {string} text - Text to speak
     * @returns {Promise} - Resolves when speaking is complete
     */
    async speak(text) {
        await this.loadLibraries();
        await this.ensureAudioContext();

        const gainNode = this.audioCtx.createGain();
        gainNode.connect(this.audioCtx.destination);

        const { duration } = this.scheduleSynthesis(this.audioCtx, gainNode, false, text);

        return new Promise(resolve => {
            setTimeout(() => {
                gainNode.disconnect();
                resolve();
            }, duration * 1000);
        });
    }

    /**
     * Get karaoke parts for text
     * @param {string} text - Text to process
     * @returns {Array<KaraokePart>} - Array of karaoke parts
     */
    karaoke(text) {
        const { timeline } = this.getTimeline(text);
        const self = this;

        return timeline.map(item => new KaraokePart(self, item));
    }

    /**
     * Render audio to buffer (for download)
     * @param {string} text - Text to render
     * @returns {Promise<AudioBuffer>} - Rendered audio buffer
     */
    async renderToBuffer(text) {
        await this.loadLibraries();

        const { duration } = this.getTimeline(text);
        const sampleRate = 44100;
        const offlineCtx = new OfflineAudioContext(1, (duration + 1) * sampleRate, sampleRate);

        this.scheduleSynthesis(offlineCtx, offlineCtx.destination, false, text);

        return await offlineCtx.startRendering();
    }

    /**
     * Update configuration
     * @param {Object} newConfig - New configuration options
     */
    setConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }
}

/**
 * Karaoke part - represents a single part of text for karaoke mode
 */
class KaraokePart {
    constructor(synth, timelineItem) {
        this._synth = synth;
        this._item = timelineItem;
    }

    /**
     * Get the text of this part
     * @returns {string}
     */
    text() {
        return this._item.text;
    }

    /**
     * Get the type of this part (token, space, punct)
     * @returns {string}
     */
    type() {
        return this._item.type;
    }

    /**
     * Get the start time of this part in seconds
     * @returns {number}
     */
    get startTime() {
        return this._item.startTime;
    }

    /**
     * Get the duration of this part in seconds
     * @returns {number}
     */
    get duration() {
        return this._item.duration;
    }

    /**
     * Speak this part only
     * @returns {Promise}
     */
    async speak() {
        await this._synth.loadLibraries();
        await this._synth.ensureAudioContext();

        const ctx = this._synth.audioCtx;
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);

        // Create single-token synthesis
        const token = { type: this._item.type, text: this._item.text };
        const tokens = [token];
        const mode = this._synth.config.mode;

        let result;
        if ((mode === 'characters' || mode === 'robot' || mode === 'demon_sampled') && this._synth.isLibraryLoaded) {
            result = this._synth.synthesizeSamples(ctx, gainNode, tokens, false, mode);
        } else {
            result = this._synth.synthesizeOscillators(ctx, gainNode, tokens, false, mode);
        }

        return new Promise(resolve => {
            setTimeout(() => {
                gainNode.disconnect();
                resolve();
            }, (this._item.duration + 0.05) * 1000);
        });
    }
}

/**
 * Factory function to create BeepyVoiceSynth instance
 * @param {Object} config - Configuration options
 * @returns {BeepyVoiceSynthCore}
 */
function BeepyVoiceSynth(config = {}) {
    return new BeepyVoiceSynthCore(config);
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BeepyVoiceSynth, BeepyVoiceSynthCore, KaraokePart };
}
