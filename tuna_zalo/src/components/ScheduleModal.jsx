// src/components/ScheduleModal.jsx
import React, { useState, useEffect, useMemo } from "react";

const API_BASE = "https://tuna-project.onrender.com/api";

const getScheduleHeaders = () => {
  const token = localStorage.getItem("token") || localStorage.getItem("user_token");
  let userId = "B2300001";
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    userId = user.student_code || user.zalo_id || user.id || "B2300001";
  } catch (e) {}

  const headers = {
    "Content-Type": "application/json",
    "x-user-id": String(userId),
  };
  if (token && token !== "null" && token !== "undefined") {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

export const ScheduleModal = ({ isOpen, onClose }) => {
  const [viewMode, setViewMode] = useState("all");
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

  const [title, setTitle] = useState("");
  const [formDate, setFormDate] = useState(getLocalDateString());
  const [period, setPeriod] = useState("1 - 3");
  const [room, setRoom] = useState("C201");
  const [teacher, setTeacher] = useState("");
  const [category, setCategory] = useState("study");

  const fetchStudentSchedules = async () => {
    setLoading(true);
    setPendingNotice(null);
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const studentCode = user.student_code || localStorage.getItem("tuna_user_id") || "B2300001";
      const zaloId = user.zalo_id || "";

      const res = await fetch(
        `${API_BASE}/schedules/student-schedule?studentCode=${encodeURIComponent(studentCode)}&zaloId=${encodeURIComponent(zaloId)}`,
        { headers: getScheduleHeaders() }
      );
      const data = await res.json();

      if (data.success) {
        if (data.isPending) {
          setPendingNotice({
            status: data.verificationStatus,
            message: data.message,
          });
          setSchedules([]);
          return;
        }

        const normalized = (data.data || []).map((s) => ({
          id: s.id,
          title: s.title || s.subjectName,
          date: s.date || s.specificDate,
          period: s.time || `Tiết ${s.startPeriod} - ${s.endPeriod}`,
          time: s.timeSlot || "Theo tiết học",
          room: s.room || "C201",
          teacher: s.teacher || s.teacherName || "Chưa phân công",
          category:
            s.category === "Lịch trực tuyến" || s.room?.toLowerCase().includes("truc tuyen")
              ? "online"
              : s.scheduleType === "exam" || s.category === "Lịch thi"
              ? "exam"
              : "study",
        }));
        setSchedules(normalized);
      }
    } catch (err) {
      console.error("Lỗi lấy thời khóa biểu:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStudentSchedules();
    }
  }, [isOpen]);

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
    const sorted = [...schedules].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (viewMode === "all") return sorted;
    if (viewMode === "day") return sorted.filter((s) => s.date === selectedDayKey);
    if (viewMode === "week") {
      const weekKeys = new Set(currentWeekDays.map((d) => getLocalDateString(d)));
      return sorted.filter((s) => weekKeys.has(s.date));
    }
    if (viewMode === "month") {
      const viewMonth = currentViewDate.getMonth();
      const viewYear = currentViewDate.getFullYear();
      return sorted.filter((s) => {
        if (!s.date) return false;
        const [y, m] = s.date.split("-").map(Number);
        return y === viewYear && m === viewMonth + 1;
      });
    }
    return sorted;
  }, [schedules, viewMode, selectedDayKey, currentWeekDays, currentViewDate]);

  const groupedSchedules = useMemo(() => {
    const map = {};
    filteredSchedules.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
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
          title,
          date: formDate,
          time: period,
          location: room || "C201",
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
        alert(data.error || "Không thể lưu lịch biểu");
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
        fetchStudentSchedules();
      } else {
        setSchedules((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const getDayName = (dStr) => {
    if (!dStr) return "";
    const [y, m, d] = dStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const names = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    return names[dateObj.getDay()];
  };

  const getCategoryMeta = (cat) => {
    switch (cat) {
      case "exam":
        return { bar: "bg-amber-500", tag: "bg-amber-50 text-amber-700 border-amber-200", label: "Lịch thi" };
      case "online":
        return { bar: "bg-blue-600", tag: "bg-blue-50 text-blue-700 border-blue-200", label: "Trực tuyến" };
      case "cancel":
        return { bar: "bg-rose-500", tag: "bg-rose-50 text-rose-700 border-rose-200", label: "Tạm ngưng" };
      default:
        return { bar: "bg-emerald-500", tag: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Lịch học" };
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="position-absolute top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column"
      style={{ zIndex: 1050, overflowY: "auto", overflowX: "hidden" }}
    >
      {/* Header Bar */}
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
                Thời khóa biểu
              </h6>
              <span className="text-blue-100/80 text-[11px] font-medium block truncate mt-0.5">
                {loading ? "Đang đồng bộ..." : `Tổng cộng: ${schedules.length} học phần`}
              </span>
            </div>
          </div>

          <div className="w-[105px] shrink-0 pointer-events-none" />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white px-3.5 py-2.5 border-b border-slate-200/80 flex items-center justify-between gap-2 shadow-2xs">
        <div className="bg-slate-100 p-1 rounded-2xl flex flex-1 items-center border border-slate-200/60">
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
                className={`flex-1 py-1.5 rounded-xl text-[11px] font-extrabold transition border-0 text-center ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1.5 border-0 shadow-xs active:scale-95 transition cursor-pointer shrink-0 ${
            showAddForm
              ? "bg-slate-100 text-slate-700"
              : "bg-blue-600 text-white shadow-blue-500/25"
          }`}
        >
          <i className={`bi ${showAddForm ? "bi-x-lg" : "bi-plus-lg"} text-[11px]`}></i>
          <span>{showAddForm ? "Đóng" : "Thêm"}</span>
        </button>
      </div>

      {/* Điều hướng Tuần / Tháng */}
      {viewMode === "week" && (
        <div className="bg-white px-3 py-2 border-b border-slate-200 flex flex-col gap-2">
          <div className="flex items-center justify-between px-1 text-xs font-black text-slate-700">
            <button
              onClick={() => handleShiftWeek(-1)}
              className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95"
            >
              <i className="bi bi-chevron-left"></i>
            </button>
            <span>
              Tuần {getLocalDateString(currentWeekDays[0]).split("-").reverse().slice(0, 2).join("/")} - {getLocalDateString(currentWeekDays[6]).split("-").reverse().slice(0, 2).join("/")}
            </span>
            <button
              onClick={() => handleShiftWeek(1)}
              className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95"
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
            className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95"
          >
            <i className="bi bi-chevron-left"></i>
          </button>
          <span>
            Tháng {currentViewDate.getMonth() + 1}, {currentViewDate.getFullYear()}
          </span>
          <button
            onClick={() => handleShiftMonth(1)}
            className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-95"
          >
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      )}

      {/* Form thêm mới */}
      {showAddForm && (
        <div className="p-3 bg-white border-b border-slate-200 shadow-sm">
          <h6 className="font-extrabold text-slate-900 text-xs mb-2.5 flex items-center gap-1.5">
            <i className="bi bi-calendar-plus text-blue-600"></i> Thêm môn học / sự kiện mới
          </h6>
          <form onSubmit={handleAddSubmit} className="space-y-2 text-xs">
            <div>
              <label className="font-bold text-slate-700 mb-1 block text-[11px]">Tên môn học / Sự kiện</label>
              <input
                type="text"
                required
                placeholder="VD: Lập trình Web"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-slate-700 mb-1 block text-[11px]">Ngày diễn ra</label>
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
                  <option value="study">Lịch học</option>
                  <option value="exam">Lịch thi</option>
                  <option value="online">Trực tuyến</option>
                  <option value="cancel">Tạm ngưng</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black shadow-md active:scale-95 transition border-0 cursor-pointer"
            >
              Lưu vào cơ sở dữ liệu
            </button>
          </form>
        </div>
      )}

      {/* Danh sách */}
      <div className="p-3.5 space-y-4 flex-1 pb-16">
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-xs font-bold">
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
              {pendingNotice.message ||
                "Hồ sơ của bạn đang chờ hệ thống phê duyệt để xem thời khóa biểu chính thức."}
            </p>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mx-auto mb-3">
              <i className="bi bi-calendar-x"></i>
            </div>
            <h6 className="font-black text-slate-800 text-xs mb-1">Không có môn học nào</h6>
            <p className="text-[11px] text-slate-400 mb-3">
              Không tìm thấy lịch trình trong mốc thời gian đang lọc.
            </p>
            <button
              onClick={() => setViewMode("all")}
              className="px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 font-extrabold text-[11px] border border-blue-200"
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
                  ({items.length} môn)
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
                          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                            <i className="bi bi-clock"></i> {item.time || "07:30 - 09:50"}
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
                        className="w-7 h-7 rounded-full bg-slate-50 hover:bg-rose-50 text-slate-300 hover:text-rose-600 flex items-center justify-center text-xs transition border border-slate-200 shrink-0"
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
    </div>
  );
};

export default ScheduleModal;