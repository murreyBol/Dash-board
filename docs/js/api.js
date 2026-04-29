// Auto-detect environment and use appropriate API URL
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://dash-board-egwf.onrender.com';  // Your Render backend URL

const api = {
    baseUrl: API_URL,  // Make API_URL accessible
    token: localStorage.getItem('token'),

    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    },

    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
    },

    getUserFriendlyError(error) {
        const errorMap = {
            'Network request failed': 'Ошибка сети. Проверьте подключение к интернету.',
            'Failed to fetch': 'Не удалось подключиться к серверу.',
            'Request failed': 'Запрос не выполнен. Попробуйте снова.',
            'Unauthorized': 'Требуется авторизация.',
            'Access denied': 'Доступ запрещен.',
            'Not found': 'Ресурс не найден.',
            'Internal server error': 'Ошибка сервера. Попробуйте позже.'
        };

        const message = error.message || String(error);
        for (const [key, value] of Object.entries(errorMap)) {
            if (message.includes(key)) {
                return value;
            }
        }
        return message;
    },

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add access token to all requests
        const accessToken = localStorage.getItem('access_token');
        if (accessToken) {
            headers['X-Access-Token'] = accessToken;
        }

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

            // Handle access token errors
            if (response.status === 403) {
                const error = await response.json();
                if (error.detail && error.detail.includes('Access denied')) {
                    console.error('Access token invalid - redirecting to pin screen');
                    const friendlyError = this.getUserFriendlyError(error);
                    if (typeof notifications !== 'undefined') {
                        notifications.show('Ошибка доступа', friendlyError);
                    }
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('pin_verified');
                    window.location.reload();
                    return null;
                }
            }

            if (response.status === 401) {
                console.error('401 Unauthorized - clearing token');
                if (typeof notifications !== 'undefined') {
                    notifications.show('Ошибка авторизации', 'Требуется повторный вход в систему');
                }
                this.clearToken();
                window.location.reload();
                return null;
            }

            if (!response.ok) {
                const error = await response.json();
                console.error('API Error response:', error);
                const friendlyError = this.getUserFriendlyError(error);
                if (typeof notifications !== 'undefined') {
                    notifications.show('Ошибка', friendlyError);
                }
                throw new Error(error.detail || 'Request failed');
            }

            const data = await response.json();
            console.log('API Response data:', data);
            return data;
        } catch (error) {
            console.error('API Error:', error);
            const friendlyError = this.getUserFriendlyError(error);
            if (typeof notifications !== 'undefined') {
                notifications.show('Ошибка', friendlyError);
            }
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
    },

    async restoreTask(taskId) {
        return this.request(`/tasks/${taskId}/restore`, {
            method: 'POST'
        });
    }
};
