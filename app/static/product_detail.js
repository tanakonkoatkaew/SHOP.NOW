document.addEventListener("DOMContentLoaded", function () {
  let discount = 0;

  const showPopup = (success, title, message) => {
    const modal = document.getElementById("popup-modal");
    document.getElementById("popup-icon").textContent = success ? "✅" : "❌";
    document.getElementById("popup-title").textContent = title;
    document.getElementById("popup-message").textContent = message;
    modal.classList.remove("hidden");

    document.getElementById("popup-close").onclick = () => {
      modal.classList.add("hidden");
    };
  };

  // โหลดข้อมูลสินค้า
  fetch(`/api/products/product/${window.categoryId}/${window.productId}`)
    .then(res => res.json())
    .then(data => {
      if (data.status) {
        const product = data.result;
        document.getElementById("product-name").innerText = product.name;
        document.getElementById("product-image").src = product.image;
        document.getElementById("product-price").innerText = `${product.price} ฿`;
        document.getElementById("product-warranty").innerText = product.warranty
          ? "รับประกันสินค้า"
          : "ไม่มีการรับประกัน";

        document.getElementById("loading").style.display = "none";
        document.getElementById("product-detail").classList.remove("hidden");
      } else {
        document.getElementById("loading").innerText = "ไม่พบสินค้านี้ในระบบ";
      }
    })
    .catch(err => {
      console.error(err);
      document.getElementById("loading").innerText = "เกิดข้อผิดพลาดในการโหลดสินค้า";
    });

  // เช็คคูปอง
  document.getElementById("check-coupon").addEventListener("click", () => {
    const code = document.getElementById("coupon-code").value.trim();
    if (!code) {
      showPopup(false, "ข้อผิดพลาด", "กรุณากรอกคูปอง");
      return;
    }

    fetch(`/api/products/checkCoupon/${code}`)
      .then(res => res.json())
      .then(data => {
        if (data.status) {
          discount = data.discount;
          document.getElementById("coupon-result").innerText = `🎉 ใช้คูปองได้! ลด ${discount * 100}%`;
        } else if (data.alreadyUsed) {
          discount = 0;
          document.getElementById("coupon-result").innerText = "❌ คูปองนี้ถูกใช้ไปแล้ว";
        } else {
          discount = 0;
          document.getElementById("coupon-result").innerText = "❌ คูปองไม่ถูกต้อง";
        }
      })
      .catch(err => {
        console.error(err);
        document.getElementById("coupon-result").innerText = "เกิดข้อผิดพลาด";
      });
  });

  // สั่งซื้อสินค้า
  document.getElementById("buy-btn").addEventListener("click", () => {
    const token = localStorage.getItem("token");
    if (!token) {
      showPopup(false, "กรุณาเข้าสู่ระบบ", "คุณต้องเข้าสู่ระบบก่อนทำรายการสั่งซื้อ");
      return;
    }

    const quantity = parseInt(document.getElementById("product-qty").value) || 1;
    const priceText = document.getElementById("product-price").innerText;
    const price = parseFloat(priceText.replace("฿", "").trim());
    const total = price * quantity * (1 - discount);
    const balance = parseFloat(localStorage.getItem("balance")) || 0;

    if (balance < total) {
      showPopup(false, "ยอดเงินไม่เพียงพอ", `คุณต้องมียอดเงินอย่างน้อย ${total.toFixed(2)} ฿`);
      return;
    }

    fetch(`/api/products/order/product/${window.productId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        submittedData: { quantity, discount }
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.status) {
          showPopup(true, "สั่งซื้อสำเร็จ", `✅ รหัสออเดอร์: ${data.orderId}`);
          localStorage.setItem("balance", (balance - total).toFixed(2)); // ✅ อัปเดตยอดเงิน
        } else {
          showPopup(false, "สั่งซื้อไม่สำเร็จ", data.msg || "ยอดเงินไม่เพียงพอ");
        }
      })
      .catch(err => {
        console.error(err);
        showPopup(false, "ข้อผิดพลาด", "เกิดข้อผิดพลาดในการสั่งซื้อ");
      });
  });
});
