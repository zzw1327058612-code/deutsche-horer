/**
 * TTS 语音合成模块
 * 三引擎策略（按优先级）：
 * 1. 预生成的高质量 MP3 音频（Google TTS 预先生成）
 * 2. 在线 Google Translate TTS（实时生成，用于手动录入内容）
 * 3. Web Speech API 的 SpeechSynthesis（离线系统 TTS，最终回退）
 */
const TTS = (function() {

    let voices = [];
    let deVoice = null;
    let audioMap = {};       // 德语文本 -> 音频文件名的映射
    let currentAudio = null; // 当前播放的 Audio 对象
    let audioBasePath = './audio/';

    function init() {
        if (!('speechSynthesis' in window)) {
            console.warn('Speech Synthesis not supported');
        } else {
            loadVoices();
            speechSynthesis.onvoiceschanged = loadVoices;
        }
        loadAudioMap();
        return true;
    }

    function loadAudioMap() {
        fetch(audioBasePath + 'audio_map.json')
            .then(r => r.json())
            .then(map => {
                audioMap = map || {};
                console.log('Audio map loaded:', Object.keys(audioMap).length, 'entries');
            })
            .catch(e => {
                console.warn('Failed to load audio map:', e);
            });
    }

    function loadVoices() {
        if (!('speechSynthesis' in window)) return;
        voices = speechSynthesis.getVoices();
        deVoice = voices.find(v => v.lang === 'de-DE')
               || voices.find(v => v.lang.startsWith('de'))
               || null;
    }

    function hasGermanVoice() {
        return deVoice !== null;
    }

    function getGermanVoices() {
        return voices.filter(v => v.lang.startsWith('de'));
    }

    function hasPreGeneratedAudio(text) {
        return !!audioMap[text];
    }

    /**
     * 播放预生成的 MP3 音频
     */
    function playPreGenerated(text, rate, onend, onstart) {
        const filename = audioMap[text];
        if (!filename) return false;

        stopAll();

        const audio = new Audio(audioBasePath + filename);
        audio.playbackRate = rate || 1.0;
        currentAudio = audio;

        if (onstart) audio.onplay = onstart;
        if (onend) audio.onended = () => {
            currentAudio = null;
            onend();
        };
        audio.onerror = (e) => {
            console.warn('Pre-generated audio error, trying online TTS:', e);
            currentAudio = null;
            speakWithGoogleTTS(text, rate, onend, onstart);
        };

        audio.play().catch(e => {
            console.warn('Pre-generated play failed, trying online TTS:', e);
            currentAudio = null;
            speakWithGoogleTTS(text, rate, onend, onstart);
        });

        return true;
    }

    /**
     * 使用 Google Translate TTS 在线生成音频
     * 通过 <audio> 标签播放，不受 CORS 限制
     */
    function speakWithGoogleTTS(text, rate, onend, onstart) {
        // Google TTS 限制 200 字符以内
        if (text.length > 200) {
            console.warn('Text too long for Google TTS, using system TTS');
            return speakWithTTS(text, rate, onend, onstart);
        }

        stopAll();

        const url = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' +
            encodeURIComponent(text) + '&tl=de&client=tw-ob&total=1&idx=0&textlen=' + text.length;

        const audio = new Audio(url);
        audio.playbackRate = rate || 1.0;
        audio.crossOrigin = 'anonymous';
        currentAudio = audio;

        if (onstart) audio.onplay = onstart;
        if (onend) audio.onended = () => {
            currentAudio = null;
            onend();
        };
        audio.onerror = (e) => {
            console.warn('Google TTS failed, falling back to system TTS:', e);
            currentAudio = null;
            speakWithTTS(text, rate, onend, onstart);
        };

        audio.play().catch(e => {
            console.warn('Google TTS play failed, falling back to system TTS:', e);
            currentAudio = null;
            speakWithTTS(text, rate, onend, onstart);
        });

        return true;
    }

    /**
     * 使用 Web Speech API 朗读（系统 TTS，最终回退）
     */
    function speakWithTTS(text, rate = 1.0, onend = null, onstart = null) {
        if (!('speechSynthesis' in window)) {
            if (onend) onend();
            return;
        }

        speechSynthesis.cancel();

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'de-DE';
        utter.rate = rate;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        if (deVoice) utter.voice = deVoice;

        if (onstart) utter.onstart = onstart;
        if (onend) utter.onend = onend;
        utter.onerror = (e) => {
            console.warn('TTS error:', e);
            if (onend) onend();
        };

        speechSynthesis.speak(utter);
    }

    /**
     * 朗读德语文本（主入口）
     * 优先级：预生成 MP3 > Google 在线 TTS > 系统 TTS
     */
    function speak(text, rate = 1.0, onend = null, onstart = null) {
        // 1. 优先使用预生成音频
        if (hasPreGeneratedAudio(text)) {
            return playPreGenerated(text, rate, onend, onstart);
        }
        // 2. 手动录入内容用 Google 在线 TTS
        return speakWithGoogleTTS(text, rate, onend, onstart);
    }

    function stopAll() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
    }

    function stop() { stopAll(); }

    function pause() {
        if (currentAudio) currentAudio.pause();
        if ('speechSynthesis' in window) speechSynthesis.pause();
    }

    function resume() {
        if (currentAudio) currentAudio.play().catch(() => {});
        if ('speechSynthesis' in window) speechSynthesis.resume();
    }

    function isSpeaking() {
        return (currentAudio !== null && !currentAudio.paused) ||
               ('speechSynthesis' in window && speechSynthesis.speaking);
    }

    function isPaused() {
        if (currentAudio) return currentAudio.paused;
        if ('speechSynthesis' in window) return speechSynthesis.paused;
        return false;
    }

    return {
        init,
        speak,
        stop,
        pause,
        resume,
        isSpeaking,
        isPaused,
        hasGermanVoice,
        getGermanVoices,
        hasPreGeneratedAudio,
    };
})();
