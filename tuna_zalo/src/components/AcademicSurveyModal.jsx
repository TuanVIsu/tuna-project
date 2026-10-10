// src/components/AcademicSurveyModal.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";

const API_BASE = "https://tuna-project.onrender.com/api";

export const AcademicSurveyModal = ({ isOpen, onSave, onDismiss }) => {
  // 1. Tự động tính toán Khóa và Năm học theo MSSV / Email
  const { detectedYear, detectedCohort, detectedMajor } = useMemo(() => {
    let studentCode = "";
    let faculty = "Hệ Thống Thông Tin";

    try {
      const u = JSON.parse(localStorage.getItem("user") || localStorage.getItem("user_info") || "{}");
      studentCode = u.student_code || u.email || "";
      if (u.faculty) faculty = u.faculty;
    } catch (e) {}

    if (!studentCode) {
      studentCode = localStorage.getItem("tuna_user_id") || localStorage.getItem("user_email") || "";
    }

    const match = String(studentCode).match(/(?:20)?(2[0-6])\d{5}/) || String(studentCode).match(/K?(2[0-6])/i);
    const admissionYearShort = match ? parseInt(match[1], 10) : 23;
    const admissionYearFull = 2000 + admissionYearShort; // 2023

    const currentYear = new Date().getFullYear(); // 2026
    let calcYear = currentYear - admissionYearFull + 1; // 2026 - 2023 + 1 = 4
    if (calcYear < 1) calcYear = 1;
    if (calcYear > 4) calcYear = 4;

    return {
      detectedYear: calcYear,
      detectedCohort: `K${admissionYearShort}`,
      detectedMajor: faculty,
    };
  }, []);

  const [major, setMajor] = useState(detectedMajor);
  const [year, setYear] = useState(detectedYear);
  const [semester, setSemester] = useState(1);

  const [dbSubjects, setDbSubjects] = useState([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [subjectLevels, setSubjectLevels] = useState({});
  const [customSubjectInput, setCustomSubjectInput] = useState("");
  const [currentGpa, setCurrentGpa] = useState(3.0);
  const [targetGoal, setTargetGoal] = useState("KhaGioi");
  const [dailyPace, setDailyPace] = useState(15);
  const [reminderTime, setReminderTime] = useState("20:00");

  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  const majors = ["Hệ Thống Thông Tin", "Công Nghệ Thông Tin", "Kỹ Thuật Phần Mềm", "An Ninh Mạng"];

  // 2. Tải trực tiếp môn học từ CSDL PostgreSQL (Không gán cứng)
  const fetchSubjectsFromDB = useCallback(async (selectedMajor, selectedYear, selectedSem, selectedCohort) => {
    setIsLoadingSubjects(true);
    try {
      const cohortParam = selectedCohort || detectedCohort;
      const res = await fetch(
        `${API_BASE}/curriculum?major=${encodeURIComponent(selectedMajor)}&year=${selectedYear}&semester=${selectedSem}&cohort=${encodeURIComponent(cohortParam)}`,
        {
          headers: {
            "Content-Type": "application/json",
            "bypass-tunnel-reminder": "true",
          },
        }
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const normalized = json.data.map((item) => ({
          subjectName: item.subject_name || item.subjectName || "Môn học chuyên ngành",
          credits: item.credits || 3,
        }));

        setDbSubjects(normalized);
        const init = {};
        normalized.forEach((item) => {
          if (item.subjectName && item.subjectName !== "undefined") {
            init[item.subjectName] = "medium";
          }
        });
        setSubjectLevels(init);
      } else {
        setDbSubjects([]);
        setSubjectLevels({});
      }
    } catch (err) {
      console.error("Lỗi nạp môn học từ CSDL:", err.message);
      setDbSubjects([]);
      setSubjectLevels({});
    } finally {
      setIsLoadingSubjects(false);
    }
  }, [detectedCohort]);

  useEffect(() => {
    if (!isOpen) return;

    let initMajor = detectedMajor;
    let initYear = detectedYear;
    let initSem = 1;

    try {
      const saved = localStorage.getItem("user_academic_profile");
      if (saved && saved !== "undefined") {
        const parsed = JSON.parse(saved);
        if (parsed.major) { initMajor = parsed.major; setMajor(parsed.major); }
        if (parsed.year) { initYear = parsed.year; setYear(parsed.year); }
        if (parsed.semester) { initSem = parsed.semester; setSemester(parsed.semester); }
        if (parsed.currentGpa !== undefined) setCurrentGpa(parsed.currentGpa);
        if (parsed.targetGoal) setTargetGoal(parsed.targetGoal);
        if (parsed.dailyPace) setDailyPace(parsed.dailyPace);
        if (parsed.reminderTime) setReminderTime(parsed.reminderTime);

        fetchSubjectsFromDB(initMajor, initYear, initSem, detectedCohort).then(() => {
          if (parsed.subjectLevels) {
            const cleanLevels = {};
            Object.keys(parsed.subjectLevels).forEach((k) => {
              if (k && k !== "undefined") {
                cleanLevels[k] = parsed.subjectLevels[k];
              }
            });
            setSubjectLevels(cleanLevels);
          }
        });
        return;
      }
    } catch (e) {
      console.error("Lỗi đọc academic profile:", e);
    }

    setMajor(initMajor);
    setYear(initYear);
    setSemester(initSem);
    fetchSubjectsFromDB(initMajor, initYear, initSem, detectedCohort);
  }, [isOpen, detectedMajor, detectedYear, detectedCohort, fetchSubjectsFromDB]);

  const handleSelectFramework = (newMajor, newYear, newSemester) => {
    fetchSubjectsFromDB(newMajor, newYear, newSemester, detectedCohort);
  };

  if (!isOpen) return null;

  const toggleSubject = (subName) => {
    if (!subName || subName === "undefined") return;
    setSubjectLevels((prev) => {
      const updated = { ...prev };
      if (updated[subName]) delete updated[subName];
      else updated[subName] = "medium";
      return updated;
    });
  };

  const changeLevel = (subName, level, e) => {
    e.stopPropagation();
    if (!subName || subName === "undefined") return;
    setSubjectLevels((prev) => ({ ...prev, [subName]: level }));
  };

  const handleAddCustomSubject = () => {
    const trimmed = customSubjectInput.trim();
    if (!trimmed || trimmed === "undefined") return;
    setSubjectLevels((prev) => ({ ...prev, [trimmed]: "medium" }));
    setCustomSubjectInput("");
    showToast(`Đã thêm môn "${trimmed}" vào danh sách!`);
  };

  const handleConfirm = async () => {
    const selectedSubs = Object.keys(subjectLevels).filter(
      (s) => s && s.trim() !== "" && s !== "undefined"
    );

    if (selectedSubs.length === 0) {
      showToast("Vui lòng chọn ít nhất 1 môn học để tạo lộ trình!", "error");
      return;
    }

    const cleanSubjectLevels = {};
    selectedSubs.forEach((sub) => {
      cleanSubjectLevels[sub] = subjectLevels[sub] || "medium";
    });

    const studyPlan = {
      major,
      cohort: detectedCohort,
      year: Number(year),
      semester: Number(semester),
      subjects: selectedSubs,
      subjectLevels: cleanSubjectLevels,
      currentGpa: Number(currentGpa) || 3.0,
      targetGoal,
      dailyPace: Number(dailyPace),
      reminderTime,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem("user_academic_profile", JSON.stringify(studyPlan));
    showToast("Đã lưu kế hoạch và lộ trình học tập cá nhân!");

    if (onSave) {
      setTimeout(() => onSave(studyPlan), 500);
    }
  };

  return (
    <div
      className="position-absolute top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column"
      style={{ zIndex: 1200, overflowY: "auto", overflowX: "hidden" }}
    >
      {toastMessage && (
        <div 
          className="fixed top-24 left-3 right-3 z-50 flex items-center justify-between p-3.5 rounded-2xl shadow-xl border animate-in slide-in-from-top duration-300 backdrop-blur-md break-words"
          style={{
            backgroundColor: toastMessage.type === "error" ? "rgba(239, 68, 68, 0.95)" : "rgba(16, 185, 129, 0.95)",
            color: "white",
            borderColor: toastMessage.type === "error" ? "#f87171" : "#34d399",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center text-sm shrink-0">
              <i className={`bi ${toastMessage.type === "error" ? "bi-exclamation-triangle-fill" : "bi-check2-circle"} text-base`}></i>
            </span>
            <span className="text-xs font-black truncate leading-snug">
              {toastMessage.message}
            </span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center border-0 cursor-pointer shrink-0 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[#0045ce] text-white sticky-top shadow-xs select-none flex-shrink-0">
        <div style={{ height: "max(var(--sat, 0px), 38px)", width: "100%" }} />

        <div className="px-4 pb-3 pt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={onDismiss}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center border-0 text-white transition shrink-0 cursor-pointer shadow-2xs"
              title="Quay lại"
            >
              <i className="bi bi-arrow-left text-sm font-black"></i>
            </button>
            <div className="flex flex-col justify-center min-w-0 flex-1">
              <h6 className="mb-0 font-black text-[16px] tracking-tight leading-tight truncate text-white">
                Kế hoạch & Lộ trình học tập
              </h6>
              <span className="text-blue-100/80 text-[11px] font-medium block truncate mt-0.5">
                Đồng bộ Khóa {detectedCohort} • {major}
              </span>
            </div>
          </div>
          <div className="w-[105px] shrink-0 pointer-events-none" />
        </div>
      </div>

      <div className="p-3.5 space-y-4 flex-1 pb-24 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-slate-500">Thông số lộ trình</span>
          <button
            onClick={handleConfirm}
            className="px-3.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs border-0 shadow-xs active:scale-95 transition cursor-pointer flex items-center gap-1"
          >
            <i className="bi bi-check-lg"></i>
            <span>Lưu lại</span>
          </button>
        </div>

        {/* Khối 1: Ngành */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-2">
          <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">1</span>
            Chuyên ngành đào tạo:
          </label>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {majors.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => {
                  setMajor(item);
                  handleSelectFramework(item, year, semester);
                }}
                className={`p-2.5 rounded-2xl border text-left font-bold transition text-[11px] ${
                  major === item
                    ? "bg-[#0045ce] text-white border-[#0045ce] shadow-xs"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Khối 2: Năm & Kỳ (Tự chọn Năm 4 cho Khóa 23) */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">2</span>
              Thời điểm học hiện tại:
            </label>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              Khóa: {detectedCohort}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="font-bold text-slate-500 mb-1 block text-[10.5px]">Năm học</label>
              <select
                value={year}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setYear(val);
                  handleSelectFramework(major, val, semester);
                }}
                className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-xs"
              >
                <option value={1}>Năm 1</option>
                <option value={2}>Năm 2</option>
                <option value={3}>Năm 3</option>
                <option value={4}>Năm 4 (Hiện tại)</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-500 mb-1 block text-[10.5px]">Học kỳ</label>
              <select
                value={semester}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSemester(val);
                  handleSelectFramework(major, year, val);
                }}
                className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-xs"
              >
                <option value={1}>Học kỳ 1</option>
                <option value={2}>Học kỳ 2</option>
                <option value={3}>Học kỳ 3 (Hè)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Khối 3: Danh sách môn */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">3</span>
              Môn học cần ôn tập ({Object.keys(subjectLevels).filter((k) => k !== "undefined").length} môn đã chọn):
            </label>
            <span className="text-[10px] text-slate-400 font-bold">CTĐT {detectedCohort}</span>
          </div>

          {isLoadingSubjects ? (
            <div className="py-6 text-center text-xs font-bold text-slate-400">
              <span className="spinner-border spinner-border-sm text-[#0045ce] me-2"></span>
              Đang tải môn học từ CSDL...
            </div>
          ) : dbSubjects.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Chưa có môn học trong CSDL cho học kỳ này. Bạn có thể tự thêm môn bên dưới.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {dbSubjects.map((sub, idx) => {
                const subName = sub.subjectName;
                if (!subName || subName === "undefined") return null;

                const isChecked = !!subjectLevels[subName];
                const currentLvl = subjectLevels[subName] || "medium";

                return (
                  <div
                    key={idx}
                    onClick={() => toggleSubject(subName)}
                    className={`p-2 rounded-2xl border transition cursor-pointer ${
                      isChecked ? "bg-blue-50/70 border-blue-300" : "bg-slate-50 border-slate-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-xs text-slate-800 break-words">{subName}</span>
                        <span className="text-[10px] text-slate-500 ml-2 font-semibold">({sub.credits} tín chỉ)</span>
                      </div>
                      <i className={`bi ${isChecked ? "bi-check-circle-fill text-[#0045ce]" : "bi-circle text-slate-300"}`}></i>
                    </div>

                    {isChecked && (
                      <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-blue-100/80" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] font-extrabold text-slate-500">Độ tự tin:</span>
                        {[
                          { id: "weak", label: "Yếu", color: currentLvl === "weak" ? "bg-rose-500 text-white" : "bg-white text-rose-600 border-rose-200" },
                          { id: "medium", label: "Vừa", color: currentLvl === "medium" ? "bg-amber-500 text-white" : "bg-white text-amber-700 border-amber-200" },
                          { id: "good", label: "Tốt", color: currentLvl === "good" ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 border-emerald-200" },
                        ].map((btn) => (
                          <button
                            key={btn.id}
                            type="button"
                            onClick={(e) => changeLevel(subName, btn.id, e)}
                            className={`px-2 py-0.5 rounded-lg border text-[10px] font-black transition ${btn.color}`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-1.5 pt-1">
            <input
              type="text"
              value={customSubjectInput}
              onChange={(e) => setCustomSubjectInput(e.target.value)}
              placeholder="Thêm môn học ngoài khung..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            />
            <button
              type="button"
              onClick={handleAddCustomSubject}
              className="px-3.5 py-2 bg-slate-900 text-white rounded-xl font-black text-xs border-0 cursor-pointer"
            >
              + Thêm
            </button>
          </div>
        </div>

        {/* Khối 4: Điểm GPA */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">4</span>
              Điểm GPA hiện tại & Mục tiêu:
            </label>
            <span className="text-[10px] text-slate-400 font-bold">Thang điểm 4.0</span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-black text-slate-800 block">GPA tích lũy hiện tại:</span>
              <span className="text-[10px] text-slate-400 font-medium">Bù trừ trọng số theo khoảng cách điểm mục tiêu</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.05"
                min="0.0"
                max="4.0"
                value={currentGpa}
                onChange={(e) => setCurrentGpa(e.target.value)}
                className="w-16 p-1.5 bg-white rounded-xl border border-blue-300 font-black text-center text-sm text-[#0045ce] focus:outline-none shadow-2xs"
                placeholder="3.0"
              />
              <span className="text-xs font-black text-slate-500">/ 4.0</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-0.5">
            {[
              { id: "QuaMon", label: "Qua môn", gpa: "GPA 2.0 - 2.5" },
              { id: "KhaGioi", label: "Khá / Giỏi", gpa: "GPA 3.0 - 3.5" },
              { id: "HocBong", label: "Học bổng", gpa: "GPA 3.6+" },
            ].map((g) => (
              <button
                type="button"
                key={g.id}
                onClick={() => setTargetGoal(g.id)}
                className={`p-2.5 rounded-2xl border text-center transition ${
                  targetGoal === g.id
                    ? "bg-[#0045ce] text-white border-[#0045ce] shadow-sm"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <div className="font-black text-xs">{g.label}</div>
                <div className="text-[9.5px] font-bold mt-0.5 opacity-80">{g.gpa}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Khối 5: Kế hoạch tự học */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-2">
          <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">5</span>
            Kế hoạch tự học mỗi ngày:
          </label>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="font-bold text-slate-600 mb-1 block text-[11px]">Thời lượng</label>
              <div className="flex gap-1">
                {[15, 30, 45].map((pace) => (
                  <button
                    type="button"
                    key={pace}
                    onClick={() => setDailyPace(pace)}
                    className={`flex-1 py-2 rounded-xl border font-black text-xs transition ${
                      dailyPace === pace
                        ? "bg-[#0045ce] text-white border-[#0045ce] shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    {pace}p
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="font-bold text-slate-600 mb-1 block text-[11px]">Giờ nhắc học</label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-xs text-slate-800"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleConfirm}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/25 active:scale-95 transition border-0 cursor-pointer"
        >
          Lập lịch tối ưu với WRR 🚀
        </button>
      </div>
    </div>
  );
};

export default AcademicSurveyModal;