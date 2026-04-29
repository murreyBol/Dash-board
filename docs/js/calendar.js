const calendar = {
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    selectedDate: null,
    sessions: [],

    async show() {
        await this.loadSessions();
        this.render();
        document.getElementById('calendarModal').style.display = 'block';
    },

    close() {
        document.getElementById('calendarModal').style.display = 'none';
    },

    async loadSessions() {
        try {
            this.sessions = await api.getCalendarSessions();
        } catch (error) {
            console.error('Failed to load calendar sessions:', error);
            this.sessions = [];
        }
    },

    render() {
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

        document.getElementById('calendarTitle').textContent =
            `${monthNames[this.currentMonth]} ${this.currentYear}`;

        const grid = document.getElementById('calendarGrid');
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
        const daysInMonth = lastDay.getDate();

        let html = '';

        // Day names
        ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(day => {
            html += `<div style="text-align: center; color: #888; font-size: 12px;">${day}</div>`;
        });

        // Empty cells before first day
        for (let i = 0; i < startOffset; i++) {
            html += '<div></div>';
        }

        // Days
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasActivity = this.getSessionsForDate(dateStr).length > 0;
            const isSelected = this.selectedDate === dateStr;
            const isToday = dateStr === todayStr;

            html += `
                <div class="calendar-day ${hasActivity ? 'has-activity' : ''} ${isSelected ? 'active' : ''} ${isToday ? 'today' : ''}"
                     onclick="calendar.selectDate('${dateStr}')">
                    ${day}
                </div>
            `;
        }

        grid.innerHTML = html;

        if (this.selectedDate) {
            this.showDateDetails(this.selectedDate);
        }
    },

    getSessionsForDate(dateStr) {
        return this.sessions.filter(session => {
            const sessionDate = new Date(session.started_at).toISOString().split('T')[0];
            return sessionDate === dateStr;
        });
    },

    selectDate(dateStr) {
        this.selectedDate = dateStr;
        this.render();
    },

    showDateDetails(dateStr) {
        const sessions = this.getSessionsForDate(dateStr);
        const details = document.getElementById('calendarDetails');

        if (sessions.length === 0) {
            details.innerHTML = '<p style="color: #888;">Нет активности за выбранную дату</p>';
            return;
        }

        const totalSeconds = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
        const date = new Date(dateStr).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        let html = `
            <h3 style="color: #0d7377; margin-bottom: 15px;">${date}</h3>
            <p style="margin-bottom: 15px;"><strong>Всего за день:</strong> ${timer.formatDuration(totalSeconds)}</p>
        `;

        // Group by task
        const byTask = {};
        sessions.forEach(session => {
            const taskId = session.task_id;
            if (!byTask[taskId]) {
                byTask[taskId] = {
                    title: session.task_title,
                    description: session.task_description,
                    creator: session.creator_username,
                    sessions: [],
                    total: 0
                };
            }
            byTask[taskId].sessions.push(session);
            byTask[taskId].total += session.duration_seconds;
        });

        html += '<div style="margin-top: 15px;">';
        for (const [taskId, data] of Object.entries(byTask)) {
            const description = data.description ? app.escapeHtml(data.description) : 'Нет описания';
            html += `
                <div style="background: #16213e; padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                    <div style="color: #0d7377; font-weight: 600; margin-bottom: 6px;">${app.escapeHtml(data.title)}</div>
                    <div style="color: #aaa; font-size: 13px; margin-bottom: 4px;">${description}</div>
                    <div style="color: #888; font-size: 12px; margin-bottom: 6px;">Создатель: ${app.escapeHtml(data.creator)}</div>
                    <div style="color: #0d7377; font-size: 14px; font-weight: 500;">${timer.formatDuration(data.total)}</div>
                </div>
            `;
        }
        html += '</div>';

        details.innerHTML = html;
    },

    prevMonth() {
        this.currentMonth--;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        }
        this.render();
    },

    nextMonth() {
        this.currentMonth++;
        if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        this.render();
    }
};
