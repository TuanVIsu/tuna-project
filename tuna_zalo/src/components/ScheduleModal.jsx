// src/components/ScheduleModal.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";

const API_BASE = "https://tuna-project.onrender.com/api";

const getScheduleHeaders = () => {
  const token = localStorage.getItem("token") || localStorage.getItem("user_token");
  let userId = "";
  try {
    const user = JSON.parse(localStorage.getItem("user") || localStorage.getItem("user_info") || "{}");
    userId = user.student_code || user.studentCode || user.zalo_id || user.id || "";
  } catch (e) {}

  if (!userId) {
    userId = localStorage.getItem("tuna_user_id") || "";
  }

  const headers = {
    "Content-Type": "application/json",
    "x-user-id": String(userId),
  };
  if (token && token !== "null" && token !== "undefined") {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

// Chuyển đổi tiết học sang khung giờ
const periodToTimeSlot = (pStr) => {
  if (!pStr) return "07:30 - 09:50";
  const clean = String(pStr).replace(/\D+/g, " ").trim().split(" ");
  const start = parseInt(clean[0], 10);
  const end = parseInt(clean[clean.length - 1], 10);

  const timeMap = {
    1: "07:30", 2: "08:15", 3: "09:10", 4: "09:55", 5: "10:45",
    6: "13:00", 7: "13:45", 8: "14:40", 9: "15:25", 10: "16:15",
    11: "17:30", 12: "18:15", 13: "19:10"
  };
  const endMap = {
    1: "08:15", 2: "09:00", 3: "09:55", 4: "10:40", 5: "11:30",
    6: "13:45", 7: "14:30", 8: "15:25", 9: "16:10", 10: "17:00",
    11: "18:15", 12: "19:00", 13: "19:55"
  };

  if (timeMap[start] && endMap[end]) {
    return `${timeMap[start]} - ${endMap[end]}`;
  }
  return "Theo tiết học";
};

// Helper nén ảnh bằng canvas
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
};

export const ScheduleModal = ({ isOpen, onClose }) => {
  const [viewMode, setViewMode] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [pendingNotice, setPendingNotice] = useState(null);

  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [currentViewDate, setCurrentViewDate] = useState(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(getLocalDateString());
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states thủ công
  const [title, setTitle] = useState("");
  const [formDate, setFormDate] = useState(getLocalDateString());
  const [period, setPeriod] = useState("1 - 3");
  const [room, setRoom] = useState("C201");
  const [teacher, setTeacher] = useState("");
  const [category, setCategory] = useState("study");

  // States quét AI hỗ trợ nhiều ảnh
  const fileInputRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState("");
  const [previewParsedSchedules, setPreviewParsedSchedules] = useState(null);

  const syncToLocalAndApp = (items) => {
    try {
      localStorage.setItem("user_custom_schedules", JSON.stringify(items));
      window.dispatchEvent(new Event("storage"));
    } catch (e) {}
  };

  const fetchStudentSchedules = useCallback(async () => {
    setLoading(true);
    setPendingNotice(null);
    try {
      let currentIdentifier = "";
      try {
        const u = JSON.parse(localStorage.getItem("user") || localStorage.getItem("user_info") || "{}");
        currentIdentifier = u.student_code || u.studentCode || u.email || u.zalo_id || u.id || "";
      } catch (e) {}

      if (!currentIdentifier) {
        currentIdentifier = localStorage.getItem("user_email") || localStorage.getItem("tuna_user_id") || "";
      }

      if (!currentIdentifier) {
        setLoading(false);
        return;
      }

      const res = await fetch(
        `${API_BASE}/schedules/student-schedule?identifier=${encodeURIComponent(currentIdentifier)}`,
        { headers: getScheduleHeaders() }
      );
      const data = await res.json();

      if (data.success) {
        if (data.isPending || data.verificationStatus === "pending" || data.verificationStatus === "rejected") {
          setPendingNotice({
            status: data.verificationStatus || "pending",
            message: data.message || "Hồ sơ của bạn đang chờ phê duyệt vào lớp để xem thời khóa biểu chính thức.",
          });
          setSchedules([]);
          return;
        }

        const normalized = (data.data || []).map((s) => {
          const rawPeriod = s.time || (s.startPeriod ? `Tiết ${s.startPeriod} - ${s.endPeriod}` : "1 - 3");
          return {
            id: s.id,
            title: s.title || s.subjectName || "Học phần chính khóa",
            date: s.date || s.specificDate,
            period: rawPeriod,
            time: s.timeSlot && s.timeSlot !== "Theo tiết học" ? s.timeSlot : periodToTimeSlot(rawPeriod),
            room: s.room || "C201",
            teacher: s.teacher || s.teacherName || "Chưa phân công",
            category:
              s.category === "Lịch trực tuyến" || s.room?.toLowerCase().includes("truc tuyen") || s.scheduleType === "online"
                ? "online"
                : s.scheduleType === "exam" || s.category === "Lịch thi"
                ? "exam"
                : "study",
          };
        });

        setSchedules(normalized);
        syncToLocalAndApp(normalized);
      }
    } catch (err) {
      console.error("Lỗi lấy thời khóa biểu:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStudentSchedules();
    }
  }, [isOpen, fetchStudentSchedules]);

  // XỬ LÝ QUÉT NHIỀU ẢNH CÙNG LÚC (MULTIPLE IMAGES)
  const handleScanScheduleImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsScanning(true);
    setScanStatusText(`Đang xử lý ${files.length} ảnh...`);

    try {
      // 1. Nén lần lượt tất cả các ảnh
      const base64List = [];
      for (let i = 0; i < files.length; i++) {
        setScanStatusText(`Đang tối ưu ảnh ${i + 1}/${files.length}...`);
        const b64 = await compressImage(files[i]);
        base64List.push(b64);
      }

      setScanStatusText("Gemini Vision đang phân tích...");

      // 2. Gửi mảng ảnh lên Backend OCR
      const res = await fetch(`${API_BASE}/schedules/ocr-parse`, {
        method: "POST",
        headers: getScheduleHeaders(),
        body: JSON.stringify({ 
          imageBase64: base64List[0],       // Giữ tương thích bản cũ
          images: base64List                 // Hỗ trợ truyền mảng nhiều ảnh
        }),
      });

      const d = await res.json();
      if (d.success && Array.isArray(d.data) && d.data.length > 0) {
        setPreviewParsedSchedules(d.data);
      } else {
        alert(d.message || "Không thể nhận diện lịch học. Vui lòng chụp rõ nét bảng thời khóa biểu!");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ khi phân tích ảnh!");
    } finally {
      setIsScanning(false);
      setScanStatusText("");
      e.target.value = "";
    }
  };

  const handleConfirmBulkSave = async () => {
    if (!previewParsedSchedules) return;
    try {
      const res = await fetch(`${API_BASE}/schedules/bulk-import`, {
        method: "POST",
        headers: getScheduleHeaders(),
        body: JSON.stringify({ schedules: previewParsedSchedules }),
      });
      const d = await res.json();
      if (d.success) {
        alert(d.message || "Đã lưu toàn bộ lịch học vào thời khóa biểu!");
        setPreviewParsedSchedules(null);
        fetchStudentSchedules();
      } else {
        alert(d.message || "Không thể lưu lịch học!");
      }
    } catch (err) {
      alert("Lỗi máy chủ khi lưu danh sách lịch học!");
    }
  };

  const currentWeekDays = useMemo(() => {
    const base = new Date(currentViewDate);
    const day = base.getDay();
    const diff = base.getDate() - day + (day === 0 ? -6 : 1);

    const monday = new Date(base.setDate(diff));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(monday);
      nextDate.setDate(monday.getDate() + i);
      days.push(nextDate);
    }
    return days;
  }, [currentViewDate]);

  const handleShiftWeek = (offsetWeeks) => {
    const next = new Date(currentViewDate);
    next.setDate(next.getDate() + offsetWeeks * 7);
    setCurrentViewDate(next);
  };

  const handleShiftMonth = (offsetMonths) => {
    const next = new Date(currentViewDate);
    next.setMonth(next.getMonth() + offsetMonths);
    setCurrentViewDate(next);
  };

  const filteredSchedules = useMemo(() => {
    let result = [...schedules].sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    if (categoryFilter !== "all") {
      result = result.filter((s) => s.category === categoryFilter);
    }

    if (viewMode === "all") return result;
    if (viewMode === "day") return result.filter((s) => s.date === selectedDayKey);
    if (viewMode === "week") {
      const weekKeys = new Set(currentWeekDays.map((d) => getLocalDateString(d)));
      return result.filter((s) => weekKeys.has(s.date));
    }
    if (viewMode === "month") {
      const viewMonth = currentViewDate.getMonth() + 1;
      const viewYear = currentViewDate.getFullYear();
      return result.filter((s) => {
        if (!s.date) return false;
        const [y, m] = s.date.split("-").map(Number);
        return y === viewYear && m === viewMonth;
      });
    }
    return result;
  }, [schedules, viewMode, selectedDayKey, currentWeekDays, currentViewDate, categoryFilter]);

  const groupedSchedules = useMemo(() => {
    const map = {};
    filteredSchedules.forEach((item) => {
      const key = item.date || "Chưa xác định";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [filteredSchedules]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/schedules`, {
        method: "POST",
        headers: getScheduleHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          specificDate: formDate,
          timeSlot: periodToTimeSlot(period),
          startPeriod: parseInt(period.split("-")[0], 10) || 1,
          endPeriod: parseInt(period.split("-")[1], 10) || 3,
          room: room.trim() || "C201",
          teacherName: teacher.trim() || "Giảng viên bộ môn",
          scheduleScope: "personal",
          scheduleType: category,
          category: category === "exam" ? "Lịch thi" : category === "online" ? "Lịch trực tuyến" : "Lịch học",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowAddForm(false);
        setTitle("");
        setTeacher("");
        fetchStudentSchedules();
      } else {
        alert(data.error || data.message || "Không thể lưu lịch biểu");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bạn muốn xóa tiết học/sự kiện này?")) return;
    try {
      const res = await fetch(`${API_BASE}/schedules/${id}`, {
        method: "DELETE",
        headers: getScheduleHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        const nextList = schedules.filter((s) => s.id !== id);
        setSchedules(nextList);
        syncToLocalAndApp(nextList);
      }
    } catch (err) {
      const nextList = schedules.filter((s) => s.id !== id);
      setSchedules(nextList);
      syncToLocalAndApp(nextList);
    }
  };

  const getDayName = (dStr) => {
    if (!dStr || dStr === "Chưa xác định") return "Lịch tự do";
    const parts = dStr.split("-").map(Number);
    if (parts.length < 3) return dStr;
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const names = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    return names[dateObj.getDay()] || dStr;
  };

  const getCategoryMeta = (cat) => {
    switch (cat) {
      case "exam":
        return { bar: "bg-amber-500", tag: "bg-amber-50 text-amber-700 border-amber-200", label: "Lịch thi" };
      case "online":
        return { bar: "bg-purple-600", tag: "bg-purple-50 text-purple-700 border-purple-200", label: "Trực tuyến" };
      default:
        return { bar: "bg-blue-600", tag: "bg-blue-50 text-blue-700 border-blue-200", label: "Chính khóa" };
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column z-50 animate-in fade-in duration-200"
      style={{ overflowY: "auto", overflowX: "hidden" }}
    >
      {/* Input hỗ trợ chọn NHIỀU ẢNH cùng lúc */}
      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        className="d-none"
        onChange={handleScanScheduleImages}
      />

      {/* 1. Header Bar chuẩn Zalo */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white sticky-top shadow-xs select-none">
        <div style={{ height: "max(var(--sat, 0px), 38px)", width: "100%" }} />

        <div className="px-4 pb-3 pt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center border-0 text-white transition shrink-0 cursor-pointer shadow-2xs"
              title="Quay lại"
            >
              <i className="bi bi-chevron-left text-sm font-black"></i>
            </button>
            
            <div className="flex flex-col justify-center min-w-0 flex-1">
              <h6 className="mb-0 font-black text-[16px] tracking-tight leading-tight truncate text-white">
                Thời khóa biểu đào tạo
              </h6>
              <span className="text-blue-100/90 text-[11px] font-medium block truncate mt-0.5">
                {loading ? "Đang đồng bộ..." : `Học kỳ hiện tại: ${schedules.length} môn học`}
              </span>
            </div>
          </div>

          <div className="w-[105px] shrink-0 pointer-events-none" />
        </div>
      </div>

      {/* 2. KHU VỰC ĐIỀU KHIỂN ĐÃ TỐI ƯU GIAO DIỆN KHÔNG BỊ ÉP CHỮ */}
      <div className="bg-white px-3.5 py-2.5 border-b border-slate-200/80 flex flex-col gap-2.5 shadow-2xs">
        {/* HÀNG 1: TABS MỐC THỜI GIAN (Trải rộng 100%, không bao giờ bị rớt dòng chữ "Hôm nay") */}
        <div className="bg-slate-100 p-1 rounded-2xl flex items-center border border-slate-200/60 w-full">
          {[
            { id: "all", label: "Tất cả" },
            { id: "day", label: "Hôm nay" },
            { id: "week", label: "Tuần" },
            { id: "month", label: "Tháng" },
          ].map((tab) => {
            const isActive = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setViewMode(tab.id);
                  if (tab.id === "day") {
                    setSelectedDayKey(getLocalDateString());
                    setCurrentViewDate(new Date());
                  }
                }}
                className={`flex-1 py-1.5 rounded-xl text-[11.5px] font-extrabold transition border-0 text-center cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* HÀNG 2: BỘ ĐÔI NÚT HÀNH ĐỘNG (Quét nhiều ảnh AI + Thêm thủ công) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isScanning}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 border-0 bg-amber-400 hover:bg-amber-500 text-slate-950 active:scale-95 transition cursor-pointer shadow-xs"
            title="Chọn một hoặc nhiều ảnh thời khóa biểu để AI quét"
          >
            {isScanning ? (
              <>
                <span className="spinner-border spinner-border-sm text-dark" style={{ width: 13, height: 13 }}></span>
                <span className="truncate">{scanStatusText || "Đang quét..."}</span>
              </>
            ) : (
              <>
                <i className="bi bi-camera-fill text-sm"></i>
                <span>Quét ảnh </span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={`py-2 px-3.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 border-0 shadow-xs active:scale-95 transition cursor-pointer shrink-0 ${
              showAddForm
                ? "bg-slate-200 text-slate-700"
                : "bg-blue-600 text-white shadow-blue-500/25"
            }`}
          >
            <i className={`bi ${showAddForm ? "bi-x-lg" : "bi-plus-lg"} text-xs`}></i>
            <span>{showAddForm ? "Đóng" : "Thêm môn"}</span>
          </button>
        </div>
      </div>

      {/* 3. Bộ lọc phân loại môn học */}
      <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: "all", label: "Tất cả", icon: "bi-grid-fill" },
          { id: "study", label: "Chính khóa", icon: "bi-mortarboard-fill" },
          { id: "exam", label: "Lịch thi", icon: "bi-calendar-check-fill" },
          { id: "online", label: "Trực tuyến", icon: "bi-camera-video-fill" },
        ].map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={`px-3 py-1 rounded-full text-[10.5px] font-black border transition shrink-0 cursor-pointer flex items-center gap-1 ${
              categoryFilter === c.id
                ? "bg-white text-blue-700 border-blue-300 shadow-2xs"
                : "bg-transparent text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            <i className={`bi ${c.icon}`}></i>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* 4. Điều hướng Tuần / Tháng */}
      {viewMode === "week" && (
        <div className="bg-white px-3 py-2 border-b border-slate-200 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1 text-xs font-black text-slate-700">
            <button
              onClick={() => handleShiftWeek(-1)}
              className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95 cursor-pointer"
            >
              <i className="bi bi-chevron-left"></i>
            </button>
            <span>
              Tuần {getLocalDateString(currentWeekDays[0]).split("-").reverse().slice(0, 2).join("/")} - {getLocalDateString(currentWeekDays[6]).split("-").reverse().slice(0, 2).join("/")}
            </span>
            <button
              onClick={() => handleShiftWeek(1)}
              className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95 cursor-pointer"
            >
              <i className="bi bi-chevron-right"></i>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {currentWeekDays.map((d, i) => {
              const dKey = getLocalDateString(d);
              const isSelected = dKey === selectedDayKey;
              const isSunday = d.getDay() === 0;
              const hasItems = schedules.some((s) => s.date === dKey);

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDayKey(dKey)}
                  className={`py-1.5 rounded-2xl transition cursor-pointer flex flex-col items-center justify-center relative ${
                    isSelected ? "bg-blue-600 text-white shadow-sm" : "hover:bg-slate-100 text-slate-800"
                  }`}
                >
                  <span className={`text-[10px] font-bold ${isSelected ? "text-blue-100" : isSunday ? "text-rose-500" : "text-slate-400"}`}>
                    {isSunday ? "CN" : `T${d.getDay() + 1}`}
                  </span>
                  <span className="text-[13px] font-black">{d.getDate()}</span>
                  {hasItems && (
                    <span className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-white" : "bg-blue-600"}`}></span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "month" && (
        <div className="bg-white px-3 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-black text-slate-700">
          <button
            onClick={() => handleShiftMonth(-1)}
            className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95 cursor-pointer"
          >
            <i className="bi bi-chevron-left"></i>
          </button>
          <span>
            Tháng {currentViewDate.getMonth() + 1}, {currentViewDate.getFullYear()}
          </span>
          <button
            onClick={() => handleShiftMonth(1)}
            className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95 cursor-pointer"
          >
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      )}

      {/* 5. Form thêm môn học thủ công */}
      {showAddForm && (
        <div className="p-3.5 bg-white border-b border-slate-200 shadow-sm animate-in slide-in-from-top duration-200">
          <h6 className="font-extrabold text-slate-900 text-xs mb-2.5 flex items-center gap-1.5">
            <i className="bi bi-calendar-plus text-blue-600"></i> Bổ sung môn học / Lịch cá nhân
          </h6>
          <form onSubmit={handleAddSubmit} className="space-y-2.5 text-xs">
            <div>
              <label className="font-bold text-slate-700 mb-1 block text-[11px]">Tên môn học / Sự kiện *</label>
              <input
                type="text"
                required
                placeholder="VD: Lập trình di động"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-slate-700 mb-1 block text-[11px]">Ngày học</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 mb-1 block text-[11px]">Tiết học</label>
                <input
                  type="text"
                  placeholder="1 - 3"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-slate-700 mb-1 block text-[11px]">Phòng học</label>
                <input
                  type="text"
                  placeholder="C201"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 mb-1 block text-[11px]">Phân loại</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none"
                >
                  <option value="study">Chính khóa</option>
                  <option value="exam">Lịch thi</option>
                  <option value="online">Trực tuyến</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md active:scale-95 transition border-0 cursor-pointer mt-1"
            >
              Lưu vào lịch học
            </button>
          </form>
        </div>
      )}

      {/* 6. Danh sách lịch trình */}
      <div className="p-3.5 space-y-4 flex-1 pb-16">
        {loading ? (
          <div className="text-center py-12 text-slate-400 text-xs font-bold">
            <div className="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
            <div>Đang tải dữ liệu thời khóa biểu...</div>
          </div>
        ) : pendingNotice ? (
          <div className="bg-white rounded-3xl p-6 text-center border border-amber-200 shadow-2xs mx-1 my-3">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3 ${
                pendingNotice.status === "rejected" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
              }`}
            >
              <i
                className={`bi ${
                  pendingNotice.status === "rejected" ? "bi-x-circle-fill" : "bi-hourglass-split"
                }`}
              ></i>
            </div>
            <h6 className="font-black text-slate-900 text-sm mb-1.5">
              {pendingNotice.status === "rejected" ? "Yêu Cầu Bị Từ Chối" : "Đang Chờ Phê Duyệt Lớp"}
            </h6>
            <p className="text-xs text-slate-500 mb-0 leading-relaxed font-medium">
              {pendingNotice.message}
            </p>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mx-auto mb-3">
              <i className="bi bi-calendar-x"></i>
            </div>
            <h6 className="font-black text-slate-800 text-xs mb-1">Không có lịch học nào</h6>
            <p className="text-[11px] text-slate-400 mb-3">
              Không tìm thấy môn học nào trong mốc thời gian đang lọc.
            </p>
            <button
              onClick={() => { setViewMode("all"); setCategoryFilter("all"); }}
              className="px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 font-extrabold text-[11px] border border-blue-200 cursor-pointer"
            >
              Xem tất cả ({schedules.length} môn)
            </button>
          </div>
        ) : (
          Object.entries(groupedSchedules).map(([dateKey, items]) => (
            <div key={dateKey} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="px-3 py-1 rounded-full bg-blue-600 text-white text-[10.5px] font-extrabold tracking-wide shadow-2xs">
                  {getDayName(dateKey)}, {dateKey.split("-").reverse().join("/")}
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  ({items.length} ca học)
                </span>
              </div>

              <div className="space-y-2.5">
                {items.map((item) => {
                  const meta = getCategoryMeta(item.category);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs relative overflow-hidden flex items-start justify-between gap-3 hover:border-blue-300 transition"
                    >
                      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${meta.bar}`}></div>

                      <div className="pl-1.5 space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${meta.tag}`}>
                            {meta.label}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                            <i className="bi bi-clock"></i> {item.time}
                          </span>
                        </div>

                        <h3 className="font-black text-slate-900 text-[13.5px] leading-snug m-0 break-words">
                          {item.title}
                        </h3>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-500 font-medium pt-0.5">
                          <span className="flex items-center gap-1 truncate">
                            <span className="text-slate-400">Tiết:</span>
                            <b className="text-slate-700">{item.period || "1 - 3"}</b>
                          </span>
                          <span className="flex items-center gap-1 truncate">
                            <span className="text-slate-400">Phòng:</span>
                            <b className="text-slate-700">{item.room || "C201"}</b>
                          </span>
                          <span className="col-span-2 flex items-center gap-1 truncate">
                            <span className="text-slate-400">GV:</span>
                            <b className="text-slate-700">{item.teacher || "Giảng viên bộ môn"}</b>
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(item.id)}
                        className="w-7 h-7 rounded-full bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs transition border border-slate-200 shrink-0 cursor-pointer"
                        title="Xóa môn này"
                      >
                        <i className="bi bi-trash3"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 7. MODAL XEM TRƯỚC KẾT QUẢ QUÉT ẢNH TKB (PREVIEW MODAL) */}
      {previewParsedSchedules && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3 z-50 animate-in fade-in" style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-3xl p-4 w-full shadow-2xl border border-slate-200 flex flex-col gap-3" style={{ maxWidth: "420px", maxHeight: "88vh" }}>
            <div className="flex items-center justify-between border-b pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center text-sm font-black">
                  <i className="bi bi-stars"></i>
                </span>
                <div>
                  <h6 className="font-black text-sm m-0 text-slate-900 leading-tight">
                    Kết Quả Quét TKB ({previewParsedSchedules.length} môn)
                  </h6>
                  <span className="text-[10.5px] text-slate-400 font-medium">Bóc tách tự động bởi Gemini Vision</span>
                </div>
              </div>
              <button onClick={() => setPreviewParsedSchedules(null)} className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 border-0 cursor-pointer text-xs">✕</button>
            </div>

            <div className="overflow-y-auto space-y-2 pr-1" style={{ maxHeight: "320px" }}>
              {previewParsedSchedules.map((item, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs flex flex-col gap-1.5 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <h6 className="font-black text-slate-900 m-0 text-xs leading-snug flex-1">
                      {item.title}
                    </h6>
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px] shrink-0 border border-blue-200">
                      Thứ {item.dayOfWeek || 2}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between pt-1 border-t border-slate-200/50">
                    <span>
                      Tiết {item.startPeriod} - {item.endPeriod} ({periodToTimeSlot(`${item.startPeriod} - ${item.endPeriod}`)})
                    </span>
                    <span className="font-bold text-slate-700">Phòng: {item.room}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPreviewParsedSchedules(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold border-0 cursor-pointer text-slate-600 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkSave}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black border-0 cursor-pointer shadow-md active:scale-95 transition flex items-center justify-center gap-1.5"
              >
                <i className="bi bi-check2-circle"></i>
                <span>Lưu toàn bộ vào TKB</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleModal;