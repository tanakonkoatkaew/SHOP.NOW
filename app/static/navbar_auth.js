document.addEventListener("DOMContentLoaded", function () {
    const token = localStorage.getItem("token");

    const navbarUser = document.getElementById("navbar-user");
    const loginBtn = document.getElementById("navbar-login");
    const logoutBtn = document.getElementById("navbar-logout");

    // ✅ ถ้า element ไม่เจอ ให้หยุดทำงาน
    if (!navbarUser || !loginBtn || !logoutBtn) {
        console.warn("❗ Navbar elements not found in DOM.");
        return;
    }

    // ✅ แสดง UI สำหรับผู้ login แล้ว
    if (token) {
        fetch('/api/auth/me/user', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(res => {
            if (!res.ok) throw new Error("Token หมดอายุ หรือไม่ถูกต้อง");
            return res.json();
        })
        .then(data => {
            if (data.status && data.user) {
                navbarUser.innerHTML = `
                    <div class="user-name">👋 ${data.user.username}</div>
                    <div class="user-credit">เครดิต: ${parseFloat(data.user.credit).toFixed(2)} ฿</div>
                `;
                loginBtn.style.display = "none";
                logoutBtn.style.display = "inline-block";
            } else {
                handleLogout("⚠️ Token ไม่ถูกต้อง หรือหมดอายุ");
            }
        })
        .catch(err => {
            console.error("❌ ดึงข้อมูลผู้ใช้ล้มเหลว:", err);
            handleLogout("❌ ลบ token เพราะเกิดข้อผิดพลาด");
        });

        // ✅ Logout event
        logoutBtn.addEventListener("click", function () {
            localStorage.removeItem("token");
            window.location.href = "/";
        });

    } else {
        // ✅ ไม่ได้ login
        loginBtn.style.display = "inline-block";
        logoutBtn.style.display = "none";
    }

    // ✅ ฟังก์ชันช่วย: จัดการกรณี token ไม่ valid
    function handleLogout(message) {
        console.warn(message);
        localStorage.removeItem("token");
        navbarUser.innerHTML = "";
        loginBtn.style.display = "inline-block";
        logoutBtn.style.display = "none";
    }
});
