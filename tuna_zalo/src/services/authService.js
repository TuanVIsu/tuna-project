// tuna_zalo/src/services/authService.js
import * as zmp from "zmp-sdk";

const API_BASE = "https://tuna-project.onrender.com/api";

// Hàm lấy user hiện tại đã lưu hoặc dữ liệu mặc định ban đầu
export const getInitialUser = () => {
  try {
    const saved = localStorage.getItem("tuna_current_user") || localStorage.getItem("user_info");
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn("Không đọc được cache user:", e);
  }

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

// Hàm đăng nhập thực thụ (gắn vào sự kiện Click của người dùng)
export const handleZaloLogin = async () => {
  const sdk = zmp.default || zmp;
  let zaloId = "zalo_dev_2311052";
  let name = "Minh";
  let avatar = "https://ui-avatars.com/api/?name=Nguyen+Minh+Tuan&background=0052FF&color=fff";
  let accessToken = "dev_mock_access_token";

  if (sdk) {
    try {
      // 1. Cấp quyền
      if (typeof sdk.authorize === "function") {
        await sdk.authorize({ scopes: ["scope.userInfo"] });
      }

      // 2. Lấy UserInfo
      if (typeof sdk.getUserInfo === "function") {
        const resInfo = await sdk.getUserInfo({ avatarType: "normal" });
        if (resInfo?.userInfo) {
          zaloId = resInfo.userInfo.id || zaloId;
          name = resInfo.userInfo.name || name;
          avatar = resInfo.userInfo.avatar || avatar;
        }
      }

      // 3. Lấy AccessToken
      if (typeof sdk.getAccessToken === "function") {
        const token = await sdk.getAccessToken();
        if (token) accessToken = token;
      }
    } catch (err) {
      console.warn("Người dùng hủy hoặc Zalo SDK từ chối:", err.message);
    }
  }

  // Gửi về backend Render
  try {
    const res = await fetch(`${API_BASE}/auth/zalo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, zaloId, name, avatar }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem("user_token", data.token || "mock_token");
        localStorage.setItem("tuna_current_user", JSON.stringify(data.user));
        return data.user;
      }
    }
  } catch (apiErr) {
    console.warn("Backend Render chưa phản hồi, giữ dữ liệu hiện tại:", apiErr.message);
  }

  const finalUser = {
    id: 1,
    zalo_id: zaloId,
    name: name,
    avatar: avatar,
    student_code: "B2300001",
    class_name: "HTTT2311",
    role: "student",
  };

  localStorage.setItem("tuna_current_user", JSON.stringify(finalUser));
  return finalUser;
};

export const getCurrentUser = () => getInitialUser();