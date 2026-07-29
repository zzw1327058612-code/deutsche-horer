/**
 * TTS 语音合成模块
 * 三引擎策略（按优先级）：
 * 1. 预生成的高质量 MP3 音频（Google TTS 预先生成，323条词库内容）
 * 2. 在线 Google TTS 代理（需要配置代理 URL，用于手动录入内容）
 * 3. Web Speech API 的 SpeechSynthesis（系统 TTS，最终回退）
 */
const TTS = (function() {

    let voices = [];
    let deVoice = null;
    let audioMap = {};
    let currentAudio = null;
    let audioBasePath = './audio/';

    // TTS 代理 URL（用户可在设置中配置）
    // 部署 Cloudflare Worker 后填入
    let ttsProxyUrl = '';

    function init() {
        if (!('speechSynthesis' in window)) {
            console.warn('Speech Synthesis not supported');
        } else {
            loadVoices();
            speechSynthesis.onvoiceschanged = loadVoices;
        }
        loadAudioMap();

        // 从 localStorage 加载代理 URL
        ttsProxyUrl = localStorage.getItem('dh_tts_proxy') || '';

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

    function getTtsProxyUrl() {
        return ttsProxyUrl;
    }

    function setTtsProxyUrl(url) {
        ttsProxyUrl = url || '';
        if (url) {
            localStorage.setItem('dh_tts_proxy', url);
        } else {
            localStorage.removeItem('dh_tts_proxy');
        }
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
            console.warn('Pre-generated audio error, trying proxy TTS:', e);
            currentAudio = null;
            speakWithProxy(text, rate, onend, onstart);
        };

        audio.play().catch(e => {
            console.warn('Pre-generated play failed, trying proxy TTS:', e);
            currentAudio = null;
            speakWithProxy(text, rate, onend, onstart);
        });

        return true;
    }

    /**
     * 通过代理调用 Google TTS（需要配置 ttsProxyUrl）
     */
    function speakWithProxy(text, rate, onend, onstart) {
        if (!ttsProxyUrl) {
            // 没有配置代理，回退到系统 TTS
            return speakWithTTS(text, rate, onend, onstart);
        }

        if (text.length > 200) {
            return speakWithTTS(text, rate, onend, onstart);
        }

        stopAll();

        const url = ttsProxyUrl + '?q=' + encodeURIComponent(text) + '&tl=de';

        const audio = new Audio(url);
        audio.playbackRate = rate || 1.0;
        currentAudio = audio;

        if (onstart) audio.onplay = onstart;
        if (onend) audio.onended = () => {
            currentAudio = null;
            onend();
        };
        audio.onerror = (e) => {
            console.warn('Proxy TTS failed, falling back to system TTS:', e);
            currentAudio = null;
            speakWithTTS(text, rate, onend, onstart);
        };

        audio.play().catch(e => {
            console.warn('Proxy TTS play failed, falling back to system TTS:', e);
            currentAudio = null;
            speakWithTTS(text, rate, onend, onstart);
        });

        return true;
    }

    /**
     * 使用 Web Speech API 朗读（系统 TTS）
     */
    function speakWithTTS(text, rate = 1.0, onend = null, onstart = null) {
        if (!('speechSynthesis' in window)) {
            console.error('No TTS available');
            if (onend) onend();
            return;
        }

        speechSynthesis.cancel();

        // 重新加载语音列表（有时第一次没加载完）
        if (!deVoice) loadVoices();

        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'de-DE';
        utter.rate = rate;
        utter.pitch = 1.0;
        utter.volume = 1.0;

        if (deVoice) utter.voice = deVoice;

        if (onstart) utter.onstart = onstart;
        if (onend) utter.onend = onend;
        utter.onerror = (e) => {
            console.warn('System TTS error:', e);
            if (onend) onend();
        };

        speechSynthesis.speak(utter);
    }

    /**
     * 朗读德语文本（主入口）
     * 优先级：预生成 MP3 > 代理 Google TTS > 系统 TTS
     */
    function speak(text, rate = 1.0, onend = null, onstart = null) {
        // 1. 优先使用预生成音频
        if (hasPreGeneratedAudio(text)) {
            return playPreGenerated(text, rate, onend, onstart);
        }
        // 2. 尝试代理 Google TTS
        if (ttsProxyUrl) {
            return speakWithProxy(text, rate, onend, onstart);
        }
        // 3. 回退到系统 TTS
        return speakWithTTS(text, rate, onend, onstart);
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
        getTtsProxyUrl,
        setTtsProxyUrl,
    };
})();
