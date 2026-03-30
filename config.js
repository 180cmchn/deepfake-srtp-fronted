window.__APP_CONFIG__ = Object.assign(
    {
        API_SCHEME: window.location.protocol === 'file:' ? 'http:' : (window.location.protocol || 'http:'),
        API_HOST: window.location.hostname || 'localhost',
        API_PORT: '8000',
        API_V1_STR: '/api/v1'
    },
    window.__APP_CONFIG__ || {}
);
