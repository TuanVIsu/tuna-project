// tuna_zalo/src/services/authService.js
import api from "zmp-sdk";

const API_BASE = "https://tuna-project.onrender.com/api";

// 1. Chỉ lấy user đã lưu, tuyệt đối không gán cứng tên "Minh"
export const getInitialUser = () => {
  try {
    const saved = localStorage.getItem("tuna_current_user") || localStorage.getItem("user");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && (parsed.id || parsed.zalo_id || parsed.student_code)) return parsed;
    }
  } catch (e) {}
  return null;
};

export const autoZaloLogin = async () => {
  return getInitialUser();
};

// 2. HÀM ĐĂNG NHẬP CHỐNG TREO XOAY (TRIỆT TIÊU LỖI -1400 getAccessToken)
export const handleZaloLogin = async () => {
  const zmpApi = typeof window !== "undefined" && window.ZmpSdk ? window.ZmpSdk : api?.default || api;

  let zaloId = "";
  let name = "";
  let avatar = "";
  let phoneToken = "";

  if (zmpApi) {
    // ƯU TIÊN 1: Nếu đã cấp quyền Số điện thoại, lấy token số điện thoại trực tiếp
    if (typeof zmpApi.getPhoneNumber === "function") {
      try {
        const phoneRes = await zmpApi.getPhoneNumber({});
        if (phoneRes && (phoneRes.token || phoneRes.number)) {
          phoneToken = phoneRes.token || phoneRes.number;
          // Dùng token số điện thoại làm định danh duy nhất cho người dùng
          zaloId = `zalo_user_${String(phoneToken).slice(0, 10)}`;
        }
      } catch (phoneErr) {
        console.warn("Bỏ qua lấy số điện thoại:", phoneErr?.message);
      }
    }

    // ƯU TIÊN 2: Thử lấy thông tin người dùng cơ bản nếu có thể
    if (typeof zmpApi.getUserInfo === "function") {
      try {
        const infoRes = await zmpApi.getUserInfo({ avatarType: "normal" });
        if (infoRes && infoRes.userInfo) {
          zaloId = infoRes.userInfo.id || zaloId;
          name = infoRes.userInfo.name || "";
          avatar = infoRes.userInfo.avatar || "";
        }
      } catch (infoErr) {
        console.warn("Bỏ qua lỗi getUserInfo (tránh sập app):", infoErr?.message);
      }
    }

    // TUYỆT ĐỐI KHÔNG GỌI getAccessToken() TRỰC TIẾP TẠI ĐÂY VÌ ZALO SẼ QUĂNG LỖI -1400!
  }

  // NẾU ZALO NATIVE TỪ CHỐI CẤP THÔNG TIN (Do app testing chưa duyệt API User Info):
  // Ném lỗi để index.jsx tắt xoay ngay và bung Form cho sinh viên tự nhập
  if (!zaloId && !name) {
    throw new Error("ZALO_LOGIN_FAILED");
  }

  // ĐÃ LẤY ĐƯỢC ID: Đồng bộ về máy chủ Render
  const finalUser = {
    id: zaloId,
    zalo_id: zaloId,
    name: name || "Sinh viên TUNA",
    avatar: avatar || "",
    role: "student",
  };

  try {
    const res = await fetch(`${API_BASE}/auth/zalo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zaloId, name: finalUser.name, avatar }),
    });
    const data = await res.json();
    if (res.ok && data.success && data.user) {
      Object.assign(finalUser, data.user);
    }
  } catch (syncErr) {
    console.warn("Đồng bộ server offline, dùng dữ liệu nội bộ:", syncErr);
  }

  localStorage.setItem("user", JSON.stringify(finalUser));
  localStorage.setItem("tuna_current_user", JSON.stringify(finalUser));
  localStorage.setItem("tuna_user_id", finalUser.student_code || finalUser.zalo_id);
  return finalUser;
};

// 3. Hàm kích hoạt tài khoản chính chủ khi Zalo chưa duyệt app
export const loginWithCustomProfile = (profile) => {
  const user = {
    id: profile.studentCode || `sv_${Date.now()}`,
    zalo_id: profile.studentCode || `sv_${Date.now()}`,
    name: profile.name.trim(),
    student_code: profile.studentCode.trim(),
    class_name: profile.className.trim(),
    faculty: profile.faculty || "Hệ Thống Thông Tin",
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=0045ce&color=fff`,
    role: "student",
    is_verified: true,
  };

  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("tuna_current_user", JSON.stringify(user));
  localStorage.setItem("tuna_user_id", user.student_code);
  return user;
};

export const getCurrentUser = () => getInitialUser();