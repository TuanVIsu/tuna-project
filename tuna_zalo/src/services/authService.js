// tuna_zalo/src/services/authService.js
import * as zmp from "zmp-sdk";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const API_BASE = isLocalhost
  ? "http://localhost:5000/api"
  : "https://clean-places-taste.loca.lt/api";

export const handleZaloLogin = async () => {
  let zaloId = "zalo_dev_2311052";
  let name = "Nguyễn Minh Tuấn";
  let avatar = "https://ui-avatars.com/api/?name=Nguyen+Minh+Tuan&background=0052FF&color=fff";
  let accessToken = "dev_mock_access_token";

  // 1. Thử gọi SDK Zalo an toàn (bắt mọi lỗi crash của getInstance)
  try {
    const sdk = zmp.default || zmp;
    if (sdk && typeof sdk.getAccessToken === "function") {
      try {
        if (typeof sdk.authorize === "function") {
          await sdk.authorize({ scopes: ["scope.userInfo"] });
        }
        const token = await sdk.getAccessToken();
        if (token) accessToken = token;

        if (typeof sdk.getUserInfo === "function") {
          const resInfo = await sdk.getUserInfo({ avatarType: "normal" });
          if (resInfo && resInfo.userInfo) {
            zaloId = resInfo.userInfo.id;
            name = resInfo.userInfo.name;
            avatar = resInfo.userInfo.avatar;
          }
        }
      } catch (innerSdkErr) {
        console.warn("⚠️ Môi trường Web không hỗ trợ Zalo SDK native (-2001), chuyển sang tài khoản Dev:", innerSdkErr.message);
      }
    }
  } catch (e) {
    console.warn("Bỏ qua SDK Zalo trên Web Dev.");
  }

  // 2. Gửi thông tin về Backend xác thực
  try {
    const res = await fetch(`${API_BASE}/auth/zalo-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify({ accessToken, zaloId, name, avatar }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem("user_token", data.token);
        localStorage.setItem("user_role", data.user.role || "student");
        localStorage.setItem("user_info", JSON.stringify(data.user));
        localStorage.setItem("user", JSON.stringify(data.user));
        return data.user;
      }
    }
  } catch (fetchErr) {
    console.warn("Không kết nối được API auth backend, sử dụng mock cục bộ:", fetchErr.message);
  }

  // 3. Fallback cục bộ đảm bảo không bao giờ bị đứng xoay loading trên trình duyệt
  const fallbackUser = {
    id: 1,
    zalo_id: zaloId,
    name: name,
    avatar: avatar,
    student_code: "B2300001",
    class_name: "HTTT2311",
    faculty: "Hệ Thống Thông Tin",
    role: "student",
  };
  localStorage.setItem("user_token", "dev_mock_token");
  localStorage.setItem("user_role", "student");
  localStorage.setItem("user_info", JSON.stringify(fallbackUser));
  localStorage.setItem("user", JSON.stringify(fallbackUser));
  return fallbackUser;
};

export const getCurrentUser = () => {
  try {
    const local = localStorage.getItem("user_info") || localStorage.getItem("user");
    return local ? JSON.parse(local) : null;
  } catch (e) {
    return null;
  }
};