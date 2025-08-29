document.addEventListener('DOMContentLoaded', () => {
    const welcomeMessage = document.getElementById('welcomeMessage');
    const logoutBtn = document.getElementById('logoutBtn');

    const token = localStorage.getItem('token');
    if (!token) {
        alert('您尚未登录，请先登录！');
        window.location.href = 'login.html';
    } else {
        // 如果有令牌，向受保护的后端路由发送请求
        fetch('https://lit-stream-78819-b3e5745b1632.herokuapp.com/api/users/profile', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // 确保这里是 'Bearer ' + token
                'Authorization': `Bearer ${token}` 
            }
        })
        .then(response => {
            if (!response.ok) {
                // 如果响应状态不是 200 OK，抛出错误
                throw new Error('获取个人资料失败');
            }
            return response.json();
        })
        .then(data => {
            if (data.user) {
                welcomeMessage.textContent = '欢迎来到创作页面，' + data.user.username + '！';
            } else {
                alert('登录状态已失效，请重新登录。');
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }
        })
        .catch(error => {
            console.error('获取个人资料失败:', error);
            alert('获取个人资料失败，请重新登录。');
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        });
    }

    // 退出登录按钮的事件监听器
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });
});