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
    let onStateChange = null;
    let onTrackChange = null;
    let onProgress = null;

    // iOS 后台播放保持
    let silenceAudio = null;
    let isSwitching = false; // 防止重入

    function ensureAudioSession() {
        if (!silenceAudio) {
            silenceAudio = new Audio();
            silenceAudio.loop = true;
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
            try {
                navigator.mediaSession.setActionHandler('play', () => resume());
                navigator.mediaSession.setActionHandler('pause', () => pause());
                navigator.mediaSession.setActionHandler('previoustrack', () => prev());
                navigator.mediaSession.setActionHandler('nexttrack', () => next());
            } catch(e) {}
        }
    }

    function updateMediaSessionMetadata(track) {
        if ('mediaSession' in navigator && track) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.de || 'Deutsch Hörer',
                    artist: track.zh || '',
                    album: '德语听力播放器',
                });
                navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
            } catch(e) {}
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
        isPlaying = true;
        ensureAudioSession();
        startPlaying();
    }

    function startPlaying() {
        if (queue.length === 0) return;

        const track = queue[currentIndex];
        if (!track) return;

        isPlaying = true;
        isSwitching = false;

        updateMediaSessionMetadata(track);
        notifyTrackChange();
        speakTrack(track);
    }

    function speakTrack(track) {
        // 不在这里调 stopAll，避免打断回调链
        // TTS.speak 内部会处理停止之前的播放
        TTS.speak(
            track.de,
            settings.rate,
            () => onSpeakEnd(),
            () => onSpeakStart()
        );
    }

    function onSpeakStart() {
        notifyProgress();
    }

    function onSpeakEnd() {
        // 防止重入（可能被多次调用）
        if (isSwitching) return;
        isSwitching = true;

        currentRepeat++;

        if (currentRepeat < settings.repeatCount) {
            // 还在重复当前条
            if (settings.intervalSec > 0) {
                intervalTimer = setTimeout(() => {
                    if (isPlaying) {
                        isSwitching = false;
                        speakTrack(queue[currentIndex]);
                    }
                }, settings.intervalSec * 1000);
            } else {
                if (isPlaying) {
                    isSwitching = false;
                    speakTrack(queue[currentIndex]);
                }
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
                            isSwitching = false;
                            startPlaying();
                        } else {
                            isSwitching = false;
                        }
                    }, settings.intervalSec * 1000);
                } else {
                    if (isPlaying) {
                        currentIndex++;
                        saveProgress();
                        isSwitching = false;
                        startPlaying();
                    } else {
                        isSwitching = false;
                    }
                }
            } else {
                // 播放结束
                isPlaying = false;
                isSwitching = false;
                releaseAudioSession();
                if ('mediaSession' in navigator) {
                    try { navigator.mediaSession.playbackState = 'paused'; } catch(e) {}
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
        isSwitching = false;
        TTS.stop();
        if ('mediaSession' in navigator) {
            try { navigator.mediaSession.playbackState = 'paused'; } catch(e) {}
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
                try { navigator.mediaSession.playbackState = 'playing'; } catch(e) {}
            }
            currentRepeat = 0;
            isSwitching = false;
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
            isSwitching = false;
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
            isSwitching = false;
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
            isSwitching = false;
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
        isSwitching = false;
        TTS.stop();
        releaseAudioSession();
        queue = [];
        currentIndex = 0;
        currentRepeat = 0;
        if ('mediaSession' in navigator) {
            try { navigator.mediaSession.playbackState = 'paused'; } catch(e) {}
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
