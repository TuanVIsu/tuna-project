// tuna_zalo/src/utils/userHelper.js

export const getCurrentUserId = () => {
  try {
    const rawUser = localStorage.getItem("user") || localStorage.getItem("user_info") || localStorage.getItem("tuna_current_user");
    if (rawUser) {
      const u = JSON.parse(rawUser);
      // Ưu tiên: Email xác thực OTP -> Zalo ID -> ID CSDL
      const identity = u.email || u.user_email || u.id || u.zalo_id;
      if (identity && identity !== "undefined" && identity !== "null") {
        return String(identity).trim();
      }
    }

    // Nếu lưu riêng email ở bước xác thực OTP
    const verifiedEmail = localStorage.getItem("user_email") || localStorage.getItem("auth_email");
    if (verifiedEmail && verifiedEmail !== "undefined" && verifiedEmail !== "null") {
      return String(verifiedEmail).trim();
    }
  } catch (e) {}

  return "guest_user";
};

export const getAuthHeaders = () => {
  const userId = getCurrentUserId();
  const token = localStorage.getItem("token") || localStorage.getItem("user_token");

  const headers = {
    "Content-Type": "application/json",
    "x-user-id": userId, // Gửi email đã xác thực lên backend
  };

  if (token && token !== "null" && token !== "undefined") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};