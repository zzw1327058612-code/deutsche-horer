/**
 * 音频播放模块
 * 使用 Web Audio API + Media Session API
 * 实现：TTS 朗读、循环播放、间隔控制、锁屏控制
 */

const AudioPlayer = (function() {

    let isPlaying = false;
    let currentIndex = 0;
    let queue = [];           // 当前播放队列 [{de, zh, en, ...}]
    let playlistId = null;
    let settings = {
        rate: 1.0,
        repeatCount: 3,
        intervalSec: 2,
        autoNext: true,
    };

    let currentRepeat = 0;
    let intervalTimer = null;
    let onStateChange = null;  // 回调
    let onTrackChange = null;
    let onProgress = null;

    // iOS 后台播放保持：一个静音/极短音频，用于保持音频会话活跃
    let silenceAudio = null;

    function ensureAudioSession() {
        // 对于 iOS Safari，需要用户交互后才能解锁音频
        // 创建一个短音频并播放，可以让系统认为当前页面在播放音频
        if (!silenceAudio) {
            silenceAudio = new Audio();
            silenceAudio.loop = true;
            // 使用一个极短的无声数据 URI
            silenceAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
            silenceAudio.volume = 0.01;
        }
        silenceAudio.play().catch(() => {});
    }

    function releaseAudioSession() {
        if (silenceAudio) {
            silenceAudio.pause();
            silenceAudio.currentTime = 0;
        }
    }

    // ===== Media Session API =====
    function initMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => resume());
            navigator.mediaSession.setActionHandler('pause', () => pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => prev());
            navigator.mediaSession.setActionHandler('nexttrack', () => next());
            // seekto 可能不支持但设置不会出错
            try {
                navigator.mediaSession.setActionHandler('seekto', null);
            } catch(e) {}
        }
    }

    function updateMediaSessionMetadata(track) {
        if ('mediaSession' in navigator && track) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.de || 'Deutsch Hörer',
                artist: track.zh || '',
                album: '德语听力播放器',
            });
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }
    }

    // ===== 播放控制 =====
    function setSettings(newSettings) {
        settings = { ...settings, ...newSettings };
    }

    function setCallbacks(callbacks) {
        onStateChange = callbacks.onStateChange;
        onTrackChange = callbacks.onTrackChange;
        onProgress = callbacks.onProgress;
    }

    function playQueue(items, startIndex = 0, plId = null) {
        queue = items;
        currentIndex = startIndex;
        playlistId = plId;
        currentRepeat = 0;
        startPlaying();
    }

    function startPlaying() {
        if (queue.length === 0) return;

        isPlaying = true;
        const track = queue[currentIndex];

        // 保持音频会话活跃（iOS 后台播放关键）
        ensureAudioSession();

        updateMediaSessionMetadata(track);
        notifyTrackChange();

        speakTrack(track);
    }

    function speakTrack(track) {
        TTS.speak(
            track.de,
            settings.rate,
            () => onSpeakEnd(),   // onend
            () => onSpeakStart()  // onstart
        );
    }

    function onSpeakStart() {
        notifyProgress();
    }

    function onSpeakEnd() {
        currentRepeat++;

        if (currentRepeat < settings.repeatCount) {
            // 还在重复当前条
            if (settings.intervalSec > 0) {
                intervalTimer = setTimeout(() => {
                    if (isPlaying) speakTrack(queue[currentIndex]);
                }, settings.intervalSec * 1000);
            } else {
                if (isPlaying) speakTrack(queue[currentIndex]);
            }
        } else {
            // 当前条播放完毕
            currentRepeat = 0;

            if (settings.autoNext && currentIndex < queue.length - 1) {
                // 播放下一条
                if (settings.intervalSec > 0) {
                    intervalTimer = setTimeout(() => {
                        if (isPlaying) {
                            currentIndex++;
                            saveProgress();
                            startPlaying();
                        }
                    }, settings.intervalSec * 1000);
                } else {
                    if (isPlaying) {
                        currentIndex++;
                        saveProgress();
                        startPlaying();
                    }
                }
            } else if (!settings.autoNext || currentIndex >= queue.length - 1) {
                // 播放结束
                isPlaying = false;
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                }
                notifyStateChange();
                notifyProgress();
            }
        }
    }

    function pause() {
        isPlaying = false;
        if (intervalTimer) {
            clearTimeout(intervalTimer);
            intervalTimer = null;
        }
        TTS.stop();
        releaseAudioSession();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
        notifyStateChange();
        notifyProgress();
    }

    function resume() {
        if (queue.length === 0) return;
        if (!isPlaying) {
            isPlaying = true;
            ensureAudioSession();
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
            }
            // 如果当前条还没播完，从头开始播
            speakTrack(queue[currentIndex]);
            notifyStateChange();
            notifyProgress();
        }
    }

    function next() {
        if (currentIndex < queue.length - 1) {
            if (intervalTimer) clearTimeout(intervalTimer);
            TTS.stop();
            currentRepeat = 0;
            currentIndex++;
            saveProgress();
            if (isPlaying) {
                startPlaying();
            } else {
                notifyTrackChange();
                notifyProgress();
            }
        }
    }

    function prev() {
        if (currentIndex > 0) {
            if (intervalTimer) clearTimeout(intervalTimer);
            TTS.stop();
            currentRepeat = 0;
            currentIndex--;
            saveProgress();
            if (isPlaying) {
                startPlaying();
            } else {
                notifyTrackChange();
                notifyProgress();
            }
        }
    }

    function seekTo(index) {
        if (index >= 0 && index < queue.length) {
            if (intervalTimer) clearTimeout(intervalTimer);
            TTS.stop();
            currentRepeat = 0;
            currentIndex = index;
            saveProgress();
            if (isPlaying) {
                startPlaying();
            } else {
                notifyTrackChange();
                notifyProgress();
            }
        }
    }

    function togglePlayPause() {
        if (isPlaying) {
            pause();
        } else {
            resume();
        }
    }

    function stop() {
        isPlaying = false;
        if (intervalTimer) clearTimeout(intervalTimer);
        TTS.stop();
        releaseAudioSession();
        queue = [];
        currentIndex = 0;
        currentRepeat = 0;
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
        notifyStateChange();
        notifyProgress();
    }

    function saveProgress() {
        if (playlistId) {
            Storage.savePlayProgress(playlistId, currentIndex);
        }
    }

    // ===== 通知 =====
    function notifyStateChange() {
        if (onStateChange) onStateChange({
            isPlaying,
            currentIndex,
            queueLength: queue.length,
            currentRepeat,
            repeatCount: settings.repeatCount,
        });
    }

    function notifyTrackChange() {
        if (onTrackChange) onTrackChange({
            track: queue[currentIndex] || null,
            index: currentIndex,
            total: queue.length,
            isPlaying,
        });
    }

    function notifyProgress() {
        if (onProgress) onProgress({
            isPlaying,
            currentIndex,
            queueLength: queue.length,
            currentRepeat,
            repeatCount: settings.repeatCount,
            track: queue[currentIndex] || null,
        });
    }

    function getState() {
        return {
            isPlaying,
            currentIndex,
            queue: queue,
            currentTrack: queue[currentIndex] || null,
            queueLength: queue.length,
            currentRepeat,
            repeatCount: settings.repeatCount,
            playlistId,
        };
    }

    function init() {
        initMediaSession();
        const saved = Storage.getSettings();
        setSettings(saved);
    }

    return {
        init,
        setSettings,
        setCallbacks,
        playQueue,
        pause,
        resume,
        next,
        prev,
        seekTo,
        togglePlayPause,
        stop,
        getState,
        notifyProgress,
    };
})();
