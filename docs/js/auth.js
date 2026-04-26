const auth = {
    currentUser: null,

    async init() {
        if (api.token) {
            try {
                this.currentUser = await api.getCurrentUser();
                if (!this.currentUser || !this.currentUser.id) {
                    api.clearToken();
                    return false;
                }
                return true;
            } catch (error) {
                api.clearToken();
                return false;
            }
        }
        return false;
    },

    async login(username, password) {
        try {
            const response = await api.login(username, password);
            if (!response || !response.access_token) {
                alert('Ошибка входа: неверные учетные данные');
                return false;
            }
            api.setToken(response.access_token);
            this.currentUser = await api.getCurrentUser();
            if (!this.currentUser) {
                api.clearToken();
                alert('Ошибка входа: не удалось получить данные пользователя');
                return false;
            }
            return true;
        } catch (error) {
            api.clearToken();
            alert('Ошибка входа: ' + error.message);
            return false;
        }
    },

    async register(username, email, password) {
        try {
            const response = await api.register(username, email, password);
            if (!response || !response.id) {
                alert('Ошибка регистрации: не удалось создать пользователя');
                return false;
            }
            return await this.login(username, password);
        } catch (error) {
            alert('Ошибка регистрации: ' + error.message);
            return false;
        }
    },

    logout() {
        api.clearToken();
        this.currentUser = null;
        window.location.reload();
    },

    isAuthenticated() {
        return !!this.currentUser;
    }
};
