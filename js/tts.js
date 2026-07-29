/**
 * TTS 语音合成模块
 * 使用 Web Speech API 的 SpeechSynthesis
 * 使用德语语音进行朗读
 */
const TTS = (function() {

    let voices = [];
    let deVoice = null;

    function init() {
        if (!('speechSynthesis' in window)) {
            console.warn('Speech Synthesis not supported');
            return false;
        }
        loadVoices();
        // 某些浏览器需要异步加载
        speechSynthesis.onvoiceschanged = loadVoices;
        return true;
    }

    function loadVoices() {
        voices = speechSynthesis.getVoices();
        // 优先选择德语语音
        deVoice = voices.find(v => v.lang === 'de-DE')
               || voices.find(v => v.lang.startsWith('de'))
               || null;
    }

    function getGermanVoices() {
        return voices.filter(v => v.lang.startsWith('de'));
    }

    function hasGermanVoice() {
        return deVoice !== null;
    }

    /**
     * 朗读德语文本
     * @param {string} text - 要朗读的德语文本
     * @param {number} rate - 语速 0.5-2.0
     * @param {function} onend - 朗读结束回调
     * @param {function} onstart - 朗读开始回调
     * @returns {SpeechSynthesisUtterance}
     */
    function speak(text, rate = 1.0, onend = null, onstart = null) {
        if (!('speechSynthesis' in window)) {
            if (onend) onend();
            return null;
        }

        // 取消之前的朗读
        speechSynthesis.cancel();

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'de-DE';
        utter.rate = rate;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        if (deVoice) {
            utter.voice = deVoice;
        }

        if (onstart) utter.onstart = onstart;
        if (onend) utter.onend = onend;
        utter.onerror = (e) => {
            console.warn('TTS error:', e);
            if (onend) onend();
        };

        speechSynthesis.speak(utter);
        return utter;
    }

    function stop() {
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
    }

    function pause() {
        if ('speechSynthesis' in window) {
            speechSynthesis.pause();
        }
    }

    function resume() {
        if ('speechSynthesis' in window) {
            speechSynthesis.resume();
        }
    }

    function isSpeaking() {
        return 'speechSynthesis' in window && speechSynthesis.speaking;
    }

    function isPaused() {
        return 'speechSynthesis' in window && speechSynthesis.paused;
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
    };
})();
