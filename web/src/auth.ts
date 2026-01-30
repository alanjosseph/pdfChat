export function getToken() {
    return localStorage.getItem('token');
}

export function setAuth(token: string, user :unknown) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
}