document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let state = {
        currentUser: null,
        users: [],
        classes: [],
        posts: [],
        assignments: []
    };

    // --- DOM Elements ---
    const contentEl = document.getElementById('app-content');
    const navEl = document.getElementById('app-nav');
    const headerTitleEl = document.getElementById('header-title');
    const authControlsEl = document.getElementById('auth-controls');
    const notificationArea = document.getElementById('notification-area');

    // --- API Helper ---
    
    // (חדש) פונקציית GET (משמשת ל-/api/me, /api/posts ועוד)
    async function get(url) {
        const res = await fetch(url, {
            // 🛑 התיקון הקריטי: שולח את ה-Cookie של ה-Session
            credentials: 'include' 
        });
        if (res.status === 401) {
             window.location.href = '/login.html'; // מפנה להתחברות במקרה של 401
             throw new Error('Unauthorized');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        return data;
    }
    
    // (חדש) פונקציית POST
    async function postForm(url, body, successMessage, callback) {
         const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // 🛑 התיקון הקריטי
            credentials: 'include', 
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showNotification(successMessage, 'success');
        callback(); 
    }
    
    // (חדש) פונקציית PUT
    async function putForm(url, body, successMessage, callback) {
         const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            // 🛑 התיקון הקריטי
            credentials: 'include',
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showNotification(successMessage, 'success');
        callback(); 
    }

    // (חדש) פונקציית DELETE
    async function deleteData(url, successMessage, callback) {
         const res = await fetch(url, {
            method: 'DELETE',
            // 🛑 התיקון הקריטי
            credentials: 'include'
        });
        const data = await res.json();
        if (res.status === 401) {
             window.location.href = '/login.html'; // מפנה להתחברות במקרה של 401
             throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(data.message);
        showNotification(successMessage, 'success');
        callback();
    }


    // --- Initialization ---
    async function initializeApp() {
        try {
            const res = await fetch('/api/me', {
                // 🛑 התיקון הקריטי: שולח את ה-Cookie גם בבדיקת /api/me
                credentials: 'include' 
            }); 
            if (!res.ok) { // אם הסשן פג או לא תקין
                 state.currentUser = null;
            } else {
                state.currentUser = await res.json(); // יהיה null אם לא מחובר
            }
            renderLayout();
            loadView('dashboard'); // טעינת עמוד הבית כברירת מחדל
        } catch (error) {
            console.error('Error initializing app:', error);
            state.currentUser = null;
            renderLayout();
            loadView('publicPosts'); // אם יש שגיאה, טען עמוד ציבורי
        }
        
        // ... (שאר הקוד נשאר זהה) ...
