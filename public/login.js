document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const messageArea = document.getElementById('message-area');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showMessage('', 'clear');

        const email = e.target.email.value;
        const password = e.target.password.value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage('ההתחברות הצליחה, מעביר אותך למערכת...', 'success');
                setTimeout(() => {
                    window.location.href = '/index.html'; 
                }, 1500);
            } else {
                showMessage(data.message || 'ההתחברות נכשלה.', 'error');
            }
        } catch (error) {
            console.error('Error during login:', error);
            showMessage('אירעה שגיאה. נסה שוב מאוחר יותר.', 'error');
        }
    });

    function showMessage(message, type) {
        messageArea.textContent = message;
        messageArea.className = `message ${type}`;
        if (type === 'clear') {
            messageArea.className = '';
        }
    }
});