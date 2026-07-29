/**
 * TTS 语音合成模块
 * 双引擎策略：
 * 1. 优先使用预生成的高质量 MP3 音频（Google TTS 生成）
 * 2. 回退到 Web Speech API 的 SpeechSynthesis（系统 TTS）
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
        // 加载音频映射
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

    /**
     * 检查是否有预生成音频
     */
    function hasPreGeneratedAudio(text) {
        return !!audioMap[text];
    }

    /**
     * 播放预生成的 MP3 音频
     */
    function playPreGenerated(text, rate, onend, onstart) {
        const filename = audioMap[text];
        if (!filename) return false;

        // 停止当前播放
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
            console.warn('Audio playback error:', e);
            currentAudio = null;
            // 回退到 TTS
            speakWithTTS(text, rate, onend, onstart);
        };

        audio.play().catch(e => {
            console.warn('Audio play failed:', e);
            currentAudio = null;
            speakWithTTS(text, rate, onend, onstart);
        });

        return true;
    }

    /**
     * 使用 Web Speech API 朗读
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
     * 优先使用预生成音频，回退到 TTS
     */
    function speak(text, rate = 1.0, onend = null, onstart = null) {
        // 优先使用预生成音频
        if (hasPreGeneratedAudio(text)) {
            return playPreGenerated(text, rate, onend, onstart);
        }
        // 回退到 TTS
        return speakWithTTS(text, rate, onend, onstart);
    }

    function stopAll() {
        // 停止 Audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        // 停止 TTS
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
    }

    function stop() {
        stopAll();
    }

    function pause() {
        if (currentAudio) {
            currentAudio.pause();
        }
        if ('speechSynthesis' in window) {
            speechSynthesis.pause();
        }
    }

    function resume() {
        if (currentAudio) {
            currentAudio.play().catch(() => {});
        }
        if ('speechSynthesis' in window) {
            speechSynthesis.resume();
        }
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
