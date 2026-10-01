// tuna_zalo/src/services/authService.js
import * as zmp from "zmp-sdk";

const API_BASE = "https://tuna-project.onrender.com/api";

// 1. Chỉ lấy user từ cache, tuyệt đối không gọi SDK native khi load trang
export const getInitialUser = () => {
  try {
    const saved = localStorage.getItem("tuna_current_user") || localStorage.getItem("user_info");
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  return {
    id: 1,
    zalo_id: "zalo_dev_2311052",
    name: "Minh",
    avatar: "https://ui-avatars.com/api/?name=Nguyen+Minh+Tuan&background=0052FF&color=fff",
    student_code: "B2300001",
    class_name: "HTTT2311",
    role: "student",
  };
};

// 2. Không gọi sdk.login() tự động để triệt tiêu vĩnh viễn lỗi code: -5
export const autoZaloLogin = async () => {
  try {
    const cached = localStorage.getItem("tuna_current_user") || localStorage.getItem("user_info");
    if (cached) {
      const user = JSON.parse(cached);
      if (user && user.zalo_id && !user.zalo_id.includes("dev_")) {
        return user;
      }
    }
  } catch (e) {}
  return null;
};

// 3. CHỈ GỌI LOGIN KHI NGƯỜI DÙNG BẤM NÚT (User Gesture)
export const handleZaloLogin = async () => {
  const sdk = zmp.default || zmp;
  let zaloId = "";
  let name = "Sinh viên";
  let avatar = "";
  let accessToken = "";

  if (sdk) {
    try {
      // Khi user đã bấm nút, JSBridge đã sẵn sàng, gọi login sẽ không bị code: -5
      if (typeof sdk.login === "function") {
        await sdk.login({});
      }

      if (typeof sdk.getUserInfo === "function") {
        const resInfo = await sdk.getUserInfo({ avatarType: "normal" });
        if (resInfo?.userInfo) {
          zaloId = resInfo.userInfo.id;
          name = resInfo.userInfo.name;
          avatar = resInfo.userInfo.avatar;
        }
      }

      if (typeof sdk.getAccessToken === "function") {
        accessToken = await sdk.getAccessToken({});
      }
    } catch (err) {
      console.warn("Lỗi xác thực Zalo:", err);
      throw err;
    }
  }

  if (!zaloId) {
    throw new Error("Không thể lấy thông tin từ Zalo");
  }

  // Gửi về backend Render
  const res = await fetch(`${API_BASE}/auth/zalo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, zaloId, name, avatar }),
  });

  const data = await res.json();
  if (res.ok && data.success && data.user) {
    localStorage.setItem("user_token", data.token || "logged_in");
    localStorage.setItem("user_role", data.user.role || "student");
    localStorage.setItem("user_info", JSON.stringify(data.user));
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("tuna_current_user", JSON.stringify(data.user));
    localStorage.setItem("tuna_user_id", data.user.student_code || data.user.zalo_id);
    return data.user;
  }

  throw new Error("Lỗi lưu trữ tài khoản phía máy chủ");
};

export const getCurrentUser = () => getInitialUser();