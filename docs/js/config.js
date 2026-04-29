// Configuration for different environments
const config = {
    // Detect environment
    isProduction: window.location.hostname.includes('github.io'),

    // API base URL
    get apiBaseUrl() {
        if (this.isProduction) {
            // Replace with your actual Render.com backend URL
            return 'https://task-planner-backend.onrender.com';
        }
        // Local development
        return 'http://localhost:8000';
    },

    // WebSocket URL
    get wsBaseUrl() {
        return this.apiBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    }
};

// Export for use in other files
window.appConfig = config;
