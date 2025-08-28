document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const messageElement = document.getElementById('message');

    loginForm.addEventListener('submit', async (e) => {
        // 阻止表单的默认提交行为，防止发送 GET 请求
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch('https://lit-stream-78819-b3e5745b1632.herokuapp.com/api/users/login', {
                method: 'POST', // 确保这里是 POST
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                messageElement.textContent = '登录成功！';
                messageElement.style.color = 'green';
                
                localStorage.setItem('token', data.token);
                // 可以重定向到 work.html
                window.location.href = 'work.html';
                
            } else {
                messageElement.textContent = data.message || '登录失败，请稍后再试。';
                messageElement.style.color = 'red';
            }
        } catch (error) {
            console.error('登录请求失败:', error);
            messageElement.textContent = '登录失败，请稍后再试。';
            messageElement.style.color = 'red';
        }
    });
});