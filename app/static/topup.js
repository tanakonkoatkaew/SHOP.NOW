document.addEventListener("DOMContentLoaded", function () {
  const dropdown = document.getElementById("paymentDropdown");
  const selected = dropdown.querySelector(".selected");
  const options = dropdown.querySelectorAll(".dropdown-list div");
  const hiddenInput = document.getElementById("payment_method");
  const redeemForm = document.getElementById("redeem-form");
  const amountInput = document.getElementById("amount");

  const qrSection = document.getElementById("payment-info");
  const qrImage = document.getElementById("qr-image");
  const refCode = document.getElementById("ref-code");
  const paymentStatus = document.getElementById("payment-status");
  const btnCancel = document.getElementById("btn-cancel");

  const btnUploadSlip = document.getElementById("upload-slip-btn");
  const slipInput = document.getElementById("slip-upload");

  // ----------------------------- //
  // ✅ ฟังก์ชันจัดการ Dropdown
  // ----------------------------- //
  selected.addEventListener("click", () => dropdown.classList.toggle("active"));

options.forEach(option => {
  option.addEventListener("click", () => {
    selected.textContent = option.textContent;
    hiddenInput.value = option.dataset.value;
    dropdown.classList.remove("active");

    const isRedeem = option.dataset.value === "redeem";
    const isPromptPay = option.dataset.value === "promptpay" || option.dataset.value === "bank";

    // ✅ ซ่อน/โชว์ฟอร์ม
    redeemForm.classList.toggle("hidden", !isRedeem);
    amountInput.parentElement.classList.toggle("hidden", isRedeem);

    // ✅ ซ่อน/โชว์ PromptPay SCB Info
    const promptpayBox = document.getElementById("promptpay-info");
    if (promptpayBox) {
      promptpayBox.classList.toggle("hidden", !isPromptPay);
    }
  });
});


  // ----------------------------- //
  // ✅ ฟังก์ชัน Submit Top-up
  // ----------------------------- //
  document.getElementById("submit-topup").addEventListener("click", () => {
    const method = hiddenInput.value;
    const token = localStorage.getItem("token");
    if (!token) return alert("กรุณาเข้าสู่ระบบ");

    if (method === "redeem") return redeemCode(token);
    requestTopup(token, method);
  });

  // ----------------------------- //
  // ✅ Redeem Code Handler
  // ----------------------------- //
  function redeemCode(token) {
    const code = document.getElementById("redeem-code").value.trim();
    if (!code) return alert("กรุณากรอกรหัส");

    fetch("/api/payment/redeem_code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.new_balance !== undefined) {
          alert(data.message || "เติมเงินสำเร็จ");
          location.reload();
        } else {
          alert(data.error || "เกิดข้อผิดพลาด");
        }
      })
      .catch(err => {
        console.error(err);
        alert("เกิดข้อผิดพลาด");
      });
  }

  // ----------------------------- //
  // ✅ Topup Request Handler
  // ----------------------------- //
  function requestTopup(token, method) {
    const amount = parseFloat(amountInput.value);
    if (isNaN(amount) || amount <= 0) return alert("กรุณากรอกจำนวนเงิน");

    fetch('/api/payment/qr', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount, payment_method: method }),
    })
      .then(res => res.json())
      .then(data => {
        if (!data.ref_code) return alert(data.message || "ไม่สามารถสร้างรายการได้");

        // แสดงผล
        qrSection.style.display = "block";
        refCode.innerText = data.ref;
        qrImage.src = data.qr || "";
        paymentStatus.innerText = "🕒 รอการชำระเงิน...";

        // เปิดฟอร์มอัปโหลดสลิป
        btnUploadSlip.classList.remove("hidden");
        slipInput.classList.remove("hidden");

        pollPayment(data.ref);
      });
  }

  // ----------------------------- //
  // ✅ Upload Slip Handler
  // ----------------------------- //
  btnUploadSlip.addEventListener("click", () => {
  const ref = refCode.textContent;
  const file = slipInput.files[0];
  if (!file) return alert("กรุณาเลือกไฟล์สลิป");

  // ตรวจสอบว่าเป็นภาพ
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return alert("กรุณาอัปโหลดเฉพาะรูปภาพสลิป (.jpg, .png, .webp)");
  }

  const formData = new FormData();
  formData.append("slip", file);
  formData.append("ref_code", ref);

  fetch("/api/payment/upload-slip", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: formData,
  })
    .then(async res => {
      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        console.error("Invalid JSON from server", err);
        alert("เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาลองใหม่");
        return;
      }

      if (res.ok && data.status) {
        alert("✅ อัปโหลดสลิปเรียบร้อย");
        paymentStatus.innerText = "📤 รอสลิปตรวจสอบ...";

        // 🟢 ตรวจสอบสถานะและเครดิตหลังจากอัปโหลดสำเร็จ
        fetch(`/api/payment/check/${ref}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        })
          .then(res => res.json())
          .then(data => {
            if (data.credited) {
              alert(`🎉 เติมเครดิตสำเร็จ +${data.amount}฿`);
              location.reload(); // รีโหลดเพื่อให้เครดิตอัปเดต
            }
          });
      } else {
        alert(data.message || "เกิดข้อผิดพลาดในการอัปโหลดสลิป");
      }
    })
    .catch(err => {
      console.error("Fetch error:", err);
      alert("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง");
    });
});

  // ----------------------------- //
  // ✅ Poll Payment Status
  // ----------------------------- //
  function pollPayment(ref) {
    const interval = setInterval(() => {
      fetch(`/api/payment/check/${ref}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      })
        .then(res => res.json())
        .then(data => {
          if (data.credited) {
            paymentStatus.innerText = "✅ ชำระเงินสำเร็จ!";
            clearInterval(interval);
          }
        });
    }, 4000);
  }

  // ----------------------------- //
  // ✅ Cancel Button Handler
  // ----------------------------- //
  btnCancel.addEventListener("click", () => {
    const ref = refCode.textContent;
    if (!ref) return;

    fetch(`/api/payment/cancel/${ref}`, { method: "DELETE" }).then(() => {
      qrSection.style.display = "none";
      alert("❌ ยกเลิกรายการสำเร็จ");
    });
  });
});
