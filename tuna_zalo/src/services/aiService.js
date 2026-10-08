// tuna_zalo/src/services/aiService.js

// Kết nối trực tiếp đến backend Render đã triển khai ổn định
const API_BASE = "https://tuna-project.onrender.com/api";

const getCommonHeaders = () => {
  let token = localStorage.getItem("user_token") || localStorage.getItem("admin_token");
  
  // Tránh gửi chuỗi token rác hoặc null lên header
  if (token === "null" || token === "undefined") {
    token = null;
  }

  // Lấy định danh người dùng từ cache
  let userId = "B2300001";
  try {
    const rawUser = localStorage.getItem("user") || localStorage.getItem("tuna_current_user");
    if (rawUser) {
      const u = JSON.parse(rawUser);
      userId = u.student_code || u.zalo_id || u.id || "B2300001";
    }
  } catch (e) {}

  const headers = {
    "Content-Type": "application/json",
    "x-user-id": String(userId),
  };

  // Nếu có token thật thì gửi Bearer token, nếu không thì fallback token xác thực
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["Authorization"] = `Bearer valid_session_${userId}`;
  }

  return headers;
};

// Hàm đọc response JSON an toàn, tránh văng cú pháp khi server bận
const parseJsonResponse = async (res) => {
  const contentType = res.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const rawText = await res.text();
    throw new Error(`Server không trả về JSON hợp lệ (Mã lỗi ${res.status}). Vui lòng kiểm tra lại Backend!`);
  }
  return await res.json();
};

export const computeContentHash = async (content) => {
  const msgUint8 = new TextEncoder().encode((content || "").trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// ==================== QUẢN LÝ TÀI LIỆU ====================
export const fetchDocumentsFromDB = async () => {
  try {
    const res = await fetch(`${API_BASE}/documents`, {
      headers: getCommonHeaders(),
    });
    if (res.ok) {
      const json = await parseJsonResponse(res);
      if (json.success && Array.isArray(json.data)) {
        localStorage.setItem("tuna_cached_docs", JSON.stringify(json.data));
        return json.data;
      }
    }
  } catch (e) {
    console.warn("Dùng cache tài liệu do không kết nối được DB:", e.message);
  }
  const local = localStorage.getItem("tuna_cached_docs");
  return local ? JSON.parse(local) : [];
};

export const saveDocumentToDB = async (doc) => {
  try {
    const local = localStorage.getItem("tuna_cached_docs");
    const list = local ? JSON.parse(local) : [];
    const updated = [doc, ...list.filter((d) => d.id !== doc.id)];
    localStorage.setItem("tuna_cached_docs", JSON.stringify(updated));
  } catch (e) {}

  try {
    await fetch(`${API_BASE}/documents`, {
      method: "POST",
      headers: getCommonHeaders(),
      body: JSON.stringify(doc),
    });
  } catch (e) {}
};

export const deleteDocumentFromDB = async (id) => {
  try {
    const local = localStorage.getItem("tuna_cached_docs");
    if (local) {
      const list = JSON.parse(local).filter((d) => d.id !== id);
      localStorage.setItem("tuna_cached_docs", JSON.stringify(list));
    }
  } catch (e) {}

  try {
    await fetch(`${API_BASE}/documents/${id}`, { 
      method: "DELETE",
      headers: getCommonHeaders(),
    });
  } catch (e) {}
};

// ==================== QUẢN LÝ LỊCH SỬ TÁC VỤ ====================
export const fetchTasksFromDB = async () => {
  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      headers: getCommonHeaders(),
    });

    // Nếu trả về lỗi 401 hoặc mã lỗi khác, chuyển qua đọc cache nội bộ
    if (res.status === 401) {
      console.warn("API /tasks yêu cầu quyền đăng nhập mới, đọc cache local.");
      const local = localStorage.getItem("tuna_cached_tasks");
      return local ? JSON.parse(local) : [];
    }

    if (res.ok) {
      const json = await parseJsonResponse(res);
      if (json.success && Array.isArray(json.data)) {
        localStorage.setItem("tuna_cached_tasks", JSON.stringify(json.data));
        return json.data;
      }
    }
  } catch (e) {
    console.warn("Dùng cache tasks:", e.message);
  }
  const local = localStorage.getItem("tuna_cached_tasks");
  return local ? JSON.parse(local) : [];
};

export const saveTaskToDB = async (task) => {
  try {
    const local = localStorage.getItem("tuna_cached_tasks");
    const list = local ? JSON.parse(local) : [];
    const updated = [task, ...list.filter((t) => t.id !== task.id)];
    localStorage.setItem("tuna_cached_tasks", JSON.stringify(updated));
  } catch (e) {}

  try {
    await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: getCommonHeaders(),
      body: JSON.stringify(task),
    });
  } catch (e) {}
};

export const deleteTaskFromDB = async (id) => {
  try {
    const local = localStorage.getItem("tuna_cached_tasks");
    if (local) {
      const list = JSON.parse(local).filter((d) => d.id !== id);
      localStorage.setItem("tuna_cached_tasks", JSON.stringify(list));
    }
  } catch (e) {}

  try {
    await fetch(`${API_BASE}/tasks/${id}`, { 
      method: "DELETE",
      headers: getCommonHeaders(),
    });
  } catch (e) {}
};

export const clearAllTasksFromDB = async () => {
  try {
    localStorage.removeItem("tuna_cached_tasks");
    await fetch(`${API_BASE}/tasks`, { 
      method: "DELETE",
      headers: getCommonHeaders(),
    });
  } catch (e) {}
};

// ==================== KHO CACHE ====================
export const checkPostgresCache = async (hash, feature, requiredCount = 5, difficulty = "Căn bản") => {
  try {
    const url = `${API_BASE}/ai/cache?hash=${hash}&feature=${feature}_${difficulty}&limit=${requiredCount}`;
    const res = await fetch(url, {
      headers: getCommonHeaders(),
    });
    if (!res.ok) return null;
    const result = await parseJsonResponse(res);
    
    if (result.success && result.data) {
      if (typeof result.data === "string" && result.data.trim().length > 0) {
        return { data: result.data, total: 1 };
      }

      if (Array.isArray(result.data) && result.data.length >= Number(requiredCount)) {
        return { data: result.data.slice(0, Number(requiredCount)), total: result.total_stored };
      }
    }
  } catch (e) {
    console.warn("Lỗi kiểm tra cache:", e.message);
  }
  return null;
};

export const savePostgresCache = async (hash, feature, payload, title, difficulty = "Căn bản") => {
  try {
    await fetch(`${API_BASE}/ai/cache`, {
      method: "POST",
      headers: getCommonHeaders(),
      body: JSON.stringify({ hash, feature: `${feature}_${difficulty}`, payload, title }),
    });
  } catch (e) {}
};

// ==================== GỌI GEMINI QUA BACKEND ====================
const callGemini = async (prompt, isJson = false, featureType = "ai_feature") => {
  try {
    const currentUser = JSON.parse(localStorage.getItem("user_info") || localStorage.getItem("user") || "{}");
    const userId = currentUser.zalo_id || currentUser.student_code || "anonymous";

    const response = await fetch(`${API_BASE}/ai/generate`, {
      method: "POST",
      headers: getCommonHeaders(),
      body: JSON.stringify({ 
        prompt, 
        isJson, 
        userId, 
        featureType 
      }),
    });

    const data = await parseJsonResponse(response);
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Lỗi máy chủ AI");
    }
    
    return data.text;
  } catch (error) {
    throw new Error(error.message);
  }
};

// ==================== CÁC HÀM XỬ LÝ TÁC VỤ AI ====================

// 1. Tạo trắc nghiệm
export const generateQuizFromDoc = async (content, numQuestions = 5, difficulty = "Căn bản") => {
  const cleanContent = (content || "").slice(0, 15000);
  const targetCount = Number(numQuestions) || 5;

  const prompt = `Bạn là chuyên gia khảo thí. Nhiệm vụ của bạn là tạo CHÍNH XÁC ${targetCount} câu hỏi trắc nghiệm khách quan 4 lựa chọn (A, B, C, D) ở cấp độ [${difficulty}] từ tài liệu được cung cấp.

YÊU CẦU BẮT BUỘC:
1. Mảng JSON trả về PHẢI CHỨA ĐÚNG ${targetCount} phần tử (objects), không được ít hơn hoặc nhiều hơn ${targetCount}.
2. Nếu tài liệu ngắn, hãy phân tích sâu từng chi tiết, thuật ngữ, số liệu và suy luận logic để đảm bảo đủ ${targetCount} câu hỏi không trùng lặp.
3. Đáp án 'answer' chỉ ghi duy nhất 1 chữ cái: "A", "B", "C" hoặc "D".
4. Phản hồi CHỈ gồm JSON hợp lệ, không có thẻ markdown code block, không giải thích ngoài lề.

Cấu trúc mỗi object:
{
  "question": "Nội dung câu hỏi",
  "options": ["A. Nội dung A", "B. Nội dung B", "C. Nội dung C", "D. Nội dung D"],
  "answer": "A",
  "explain": "Giải thích chi tiết lý do chọn"
}

Tài liệu:
"""
${cleanContent}
"""`;

  const raw = await callGemini(prompt, true, "quiz_generator");
  const cleanRaw = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleanRaw);
  return Array.isArray(parsed) ? parsed : [];
};

// 2. Tạo thẻ ghi nhớ (Flashcards)
export const generateFlashcardsFromDoc = async (content, numCards = 5, difficulty = "Căn bản") => {
  const cleanContent = (content || "").slice(0, 15000);
  const targetCount = Number(numCards) || 5;

  const prompt = `Trích xuất đúng CHÍNH XÁC ${targetCount} thẻ ghi nhớ (Flashcards) ở mức độ [${difficulty}] từ tài liệu sau. 
Yêu cầu bắt buộc: Trả về duy nhất một mảng JSON gồm đúng ${targetCount} objects, không dùng markdown:
[
  { "front": "Khái niệm / Thuật ngữ / Câu hỏi ngắn", "back": "Định nghĩa / Giải thích chi tiết" }
]

Tài liệu:
"""
${cleanContent}
"""`;

  const raw = await callGemini(prompt, true, "flashcard_generator");
  const cleanRaw = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleanRaw);
  return Array.isArray(parsed) ? parsed : [];
};

// 3. Tóm tắt văn bản
export const summarizeFromDoc = async (content) => {
  const cleanContent = (content || "").slice(0, 15000);
  const prompt = `Hãy tóm tắt có hệ thống tài liệu sau:\n1. Tổng quan ngắn gọn.\n2. Các luận điểm trọng tâm (Gạch đầu dòng rõ ràng).\n3. Kết luận và ý nghĩa thực tiễn.\n\nTài liệu:\n"""${cleanContent}"""`;
  return await callGemini(prompt, false, "document_summary");
};

// 4. Dịch thuật
export const translateFromDoc = async (content, targetLang = "Tiếng Việt") => {
  const cleanContent = (content || "").slice(0, 15000);
  const prompt = `Dịch chuẩn xác tài liệu sau sang ${targetLang}, giữ nguyên các định dạng cấu trúc và thuật ngữ kỹ thuật chuyên ngành:\n\n"""${cleanContent}"""`;
  return await callGemini(prompt, false, "document_translation");
};