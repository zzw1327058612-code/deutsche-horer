/**
 * 录音模块
 * 使用 MediaRecorder API 实现跟读录音和回放
 */
const Recorder = (function() {

    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let stream = null;
    let lastBlobUrl = null;

    async function startRecording() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];

            // 选择支持的 mimeType
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm')) {
                options.mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options.mimeType = 'audio/mp4';
            }

            mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                lastBlobUrl = URL.createObjectURL(blob);
                if (onStopCallback) onStopCallback(lastBlobUrl);
            };
            mediaRecorder.start();
            isRecording = true;
            return true;
        } catch(e) {
            console.error('Recording error:', e);
            return false;
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        }
    }

    let onStopCallback = null;
    function onStop(callback) {
        onStopCallback = callback;
    }

    function getLastRecording() {
        return lastBlobUrl;
    }

    function playLastRecording() {
        if (lastBlobUrl) {
            const audio = new Audio(lastBlobUrl);
            audio.play();
            return audio;
        }
        return null;
    }

    function getIsRecording() {
        return isRecording;
    }

    return {
        startRecording,
        stopRecording,
        onStop,
        getLastRecording,
        playLastRecording,
        getIsRecording,
    };
})();
