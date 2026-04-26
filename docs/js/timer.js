const timer = {
    activeSessions: new Map(), // taskId -> { interval, startTime, seconds }

    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    formatDuration(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}ч ${m}мин`;
        if (m > 0) return `${m}мин ${s}сек`;
        return `${s}сек`;
    },

    async start(taskId) {
        if (this.activeSessions.has(taskId)) {
            return; // Already running
        }

        try {
            await api.startTimer(taskId);

            const session = {
                startTime: Date.now(),
                seconds: 0,
                interval: setInterval(() => {
                    session.seconds = Math.floor((Date.now() - session.startTime) / 1000);
                    this.updateDisplay(taskId, session.seconds);
                }, 1000)
            };

            this.activeSessions.set(taskId, session);
            this.updateDisplay(taskId, 0);
        } catch (error) {
            console.error('Failed to start timer:', error);
            alert('Ошибка запуска таймера');
        }
    },

    async stop(taskId) {
        const session = this.activeSessions.get(taskId);
        if (!session) {
            return;
        }

        clearInterval(session.interval);
        this.activeSessions.delete(taskId);

        try {
            const result = await api.stopTimer(taskId);
            this.updateDisplay(taskId, 0);

            // Show comment modal after stopping timer
            comments.showForCompletion(taskId);
        } catch (error) {
            console.error('Failed to stop timer:', error);
            alert('Ошибка остановки таймера');
        }
    },

    updateDisplay(taskId, seconds) {
        const card = document.querySelector(`[data-task-id="${taskId}"]`);
        if (!card) return;

        const timerEl = card.querySelector('.task-timer');
        if (!timerEl) return;

        if (seconds > 0) {
            timerEl.innerHTML = `⏱️ <span class="timer-active">${this.formatTime(seconds)}</span>`;
        } else {
            timerEl.innerHTML = '';
        }
    },

    isRunning(taskId) {
        return this.activeSessions.has(taskId);
    },

    stopAll() {
        for (const [taskId, session] of this.activeSessions) {
            clearInterval(session.interval);
        }
        this.activeSessions.clear();
    }
};
