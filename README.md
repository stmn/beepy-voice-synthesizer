# 🍃 Cute Beepy Voice Synthesis

Create your own cute vocal synth speech! Use this tool to synthesize text into a charming, rhythmic "beepy" voice style.

## ✨ Features

*   **Vocal Synthesis**: Type any text and hear it spoken in a unique synthesized voice! The engine breaks down words into syllables, making it sound rhythmic and natural.
*   **Full Customization**:
    *   **Pitch**: Go from a deep, low voice to a squeaky, high-pitched tone.
    *   **Speed**: Adjust the speaking rate to your liking.
    *   **Pitch Variance**: Control how "expressive" and chaotic the pitch jumps are.
    *   **Timbre**: Change the character of the sound from muffled to bright.
    *   **Synthesis Style**: Switch between different voice textures (e.g., Default, Robot, Alien, and more).
    *   **Split Mode**: Choose how text is chunked for synthesis (Syllables, Letters, or Words).
*   **Export Timing**: Export a JSON file containing precise timing data, useful for syncing subtitles or animations in external projects.
*   **Download as WAV**: Save your creations to use in memes, videos, content creation, or just for fun.

## 🛠️ How to Use

1.  **Type** your message in the text box.
2.  **Adjust** the settings (Pitch, Speed, etc.) to customize the voice. 
3.  Click **Speak!** to listen.
4.  Click **Download** to save the audio file.

---

## 🎮 JavaScript API

The `beepy-voice-synth.js` library provides a simple API for integrating voice synthesis into your games and projects.

### Installation

Include the script in your HTML:

```html

<script src="src/beepy-voice-synth.js"></script>
```

You will also need the audio library files (`animalese.wav`, `demon.wav`) in the same directory.

### Basic Usage

```javascript
// Create a synth instance with default settings
const synth = BeepyVoiceSynth()

// Speak some text
await synth.speak('Hello world!')
```

### Configuration Options

```javascript
const synth = BeepyVoiceSynth({
    pitch: 600,           // 200-1200, voice pitch
    speed: 0.14,          // 0.05-0.2, speaking speed
    timbre: 400,          // 100-2000, voice brightness
    pause: 150,           // 50-500 (ms), pause after punctuation
    variance: 50,         // 0-150, pitch variance
    mode: 'syllables',    // synthesis mode (see below)
    splitMode: 'syllables', // text splitting mode
    basePath: './'        // path to audio files
})
```

**Synthesis Modes:**
- `syllables` - Default oscillator-based mode
- `characters` - Animalese-style using audio samples
- `demon_sampled` - Demon voice using samples
- `robot` - Robot voice with looping samples
- `retro` - Retro square wave
- `alien` - Alien with vibrato
- `beast` - Growly beast voice
- `chorus` - Chorus effect
- `crystal` - FM synthesis bell-like

**Split Modes:**
- `chars` - Split by individual characters
- `syllables` - Split by syllables (default)
- `words` - Split by whole words

### Karaoke Mode

Get individual parts for karaoke-style highlighting:

```javascript
const synth = BeepyVoiceSynth({ mode: 'characters' })

const parts = synth.karaoke('Hello world!')

for (const part of parts) {
    console.log(part.text())     // Get the text
    console.log(part.type())     // 'token', 'space', or 'punct'
    console.log(part.startTime)  // Start time in seconds
    console.log(part.duration)   // Duration in seconds
    await part.speak()           // Speak this part only
}
```

### Timeline Export

Get timing data for synchronization:

```javascript
const synth = BeepyVoiceSynth()
const { duration, timeline } = synth.getTimeline('Hello world!')

console.log('Total duration:', duration)
timeline.forEach(item => {
    console.log(`${item.text} at ${item.startTime}s for ${item.duration}s`)
})
```

### Render to Buffer

Render audio for downloading or further processing:

```javascript
const synth = BeepyVoiceSynth()
const audioBuffer = await synth.renderToBuffer('Hello world!')
// audioBuffer is an AudioBuffer you can process or convert to WAV
```

### Complete Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Game</title>
</head>
<body>
<button id="speak">Speak!</button>
<div id="text-display"></div>

<script src="src/beepy-voice-synth.js"></script>
<script>
    // Wait for page to fully load before using the synth
    window.onload = function () {
        const synth = BeepyVoiceSynth({
            mode: 'characters',
            pitch: 800
        })

        document.getElementById('speak').onclick = async function () {
            const text = 'Welcome to my game!'
            const parts = synth.karaoke(text)
            const display = document.getElementById('text-display')

            // Clear display before starting
            display.textContent = ''

            // Speak each part and append text progressively
            for (const part of parts) {
                display.textContent += part.text()
                await part.speak()
            }
        }
    }
</script>
</body>
</html>
```

---

## 📄 License & Credits

This project leverages code and assets from [animalese.js](https://github.com/Acedio/animalese.js) by [Acedio](https://github.com/Acedio).