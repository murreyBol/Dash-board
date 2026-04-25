const auth = {
    currentUser: null,

    async init() {
        if (api.token) {
            try {
                this.currentUser = await api.getCurrentUser();
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
            api.setToken(response.access_token);
            this.currentUser = await api.getCurrentUser();
            return true;
        } catch (error) {
            alert('Ошибка входа: ' + error.message);
            return false;
        }
    },

    async register(username, email, password) {
        try {
            await api.register(username, email, password);
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
