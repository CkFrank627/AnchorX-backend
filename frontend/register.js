document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const messageElement = document.getElementById('message');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            messageElement.textContent = '两次输入的密码不一致！';
            messageElement.style.color = 'red';
            return;
        }
        
        try {
            const response = await fetch('https://lit-stream-78819-b3e5745b1632.herokuapp.com/api/users/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                messageElement.textContent = '注册成功！';
                messageElement.style.color = 'green';
                // 注册成功后，你可以重定向到登录页面
                // window.location.href = 'login.html';
            } else {
                messageElement.textContent = data.message || '注册失败，请稍后再试。';
                messageElement.style.color = 'red';
            }
        } catch (error) {
            console.error('注册请求失败:', error);
            messageElement.textContent = '注册失败，请稍后再试。';
            messageElement.style.color = 'red';
        }
    });
});