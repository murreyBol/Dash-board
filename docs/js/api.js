const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://dash-board-egwf.onrender.com';

const api = {
    token: localStorage.getItem('token'),

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    },

    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
    },

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token && !endpoint.includes('/auth/')) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            console.log('API Request:', endpoint, options);
            const response = await fetch(`${API_URL}${endpoint}`, {
                ...options,
                headers
            });

            console.log('API Response status:', response.status);

            if (response.status === 401) {
                console.error('401 Unauthorized - clearing token');
                this.clearToken();
                window.location.reload();
                return null;
            }

            if (!response.ok) {
                const error = await response.json();
                console.error('API Error response:', error);
                throw new Error(error.detail || 'Request failed');
            }

            const data = await response.json();
            console.log('API Response data:', data);
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Auth
    async register(username, email, password) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
    },

    async login(username, password) {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        return await response.json();
    },

    // User
    async getCurrentUser() {
        return this.request('/users/me');
    },

    async getUsers() {
        return this.request('/users');
    },

    async getPinCode() {
        return this.request('/admin/pin-code');
    },

    async updatePinCode(pinCode) {
        return this.request('/admin/pin-code', {
            method: 'POST',
            body: JSON.stringify({ pin_code: pinCode })
        });
    },

    async updateSettings(settings) {
        return this.request('/users/me/settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });
    },

    async deleteUser(userId) {
        return this.request(`/users/${userId}`, {
            method: 'DELETE'
        });
    },

    async toggleAdmin(userId) {
        return this.request(`/users/${userId}/admin`, {
            method: 'PUT'
        });
    },

    // Tasks
    async getTasks(priority = null, status = null) {
        let url = '/tasks';
        const params = new URLSearchParams();
        if (priority) params.append('priority', priority);
        if (status) params.append('status', status);
        if (params.toString()) url += `?${params.toString()}`;
        return this.request(url);
    },

    async getTask(taskId) {
        return this.request(`/tasks/${taskId}`);
    },

    async createTask(task) {
        return this.request('/tasks', {
            method: 'POST',
            body: JSON.stringify(task)
        });
    },

    async updateTask(taskId, updates) {
        return this.request(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    },

    async deleteTask(taskId) {
        return this.request(`/tasks/${taskId}`, {
            method: 'DELETE'
        });
    },

    async assignTask(taskId, userId) {
        return this.request(`/tasks/${taskId}/assign?user_id=${userId}`, {
            method: 'POST'
        });
    },

    async completeTask(taskId) {
        return this.request(`/tasks/${taskId}/complete`, {
            method: 'POST'
        });
    },

    async postponeTask(taskId, reason) {
        return this.request(`/tasks/${taskId}/postpone`, {
            method: 'POST',
            body: JSON.stringify({ reason })
        });
    },

    async archiveTask(taskId) {
        return this.request(`/tasks/${taskId}/archive`, {
            method: 'POST'
        });
    },

    async getArchivedTasks() {
        return this.request('/tasks/archived/list');
    },

    // Timer
    async startTimer(taskId) {
        return this.request(`/tasks/${taskId}/start-timer`, {
            method: 'POST'
        });
    },

    async stopTimer(taskId) {
        return this.request(`/tasks/${taskId}/stop-timer`, {
            method: 'POST'
        });
    },

    // Comments
    async getComments(taskId) {
        return this.request(`/tasks/${taskId}/comments`);
    },

    async createComment(taskId, text, sessionId = null) {
        const body = { text };
        if (sessionId) {
            body.session_id = sessionId;
        }
        return this.request(`/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    async updateComment(commentId, text) {
        return this.request(`/comments/${commentId}`, {
            method: 'PUT',
            body: JSON.stringify({ text })
        });
    },

    async deleteComment(commentId) {
        return this.request(`/comments/${commentId}`, {
            method: 'DELETE'
        });
    },

    // Calendar
    async getCalendarSessions(startDate = null, endDate = null) {
        let url = '/calendar/sessions';
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (params.toString()) url += `?${params.toString()}`;
        return this.request(url);
    },

    // Overdue
    async getOverdueTasks() {
        return this.request('/tasks/overdue');
    }
};
