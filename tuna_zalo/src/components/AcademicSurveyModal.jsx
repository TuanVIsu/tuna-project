// src/components/AcademicSurveyModal.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API_BASE = "https://tuna-project.onrender.com/api";

const DEFAULT_MAJORS = [
  { major_name: "Hệ Thống Thông Tin", icon: "bi-hdd-network", semesters_per_year: 3, total_years: 4 },
  { major_name: "Công Nghệ Thông Tin", icon: "bi-cpu", semesters_per_year: 3, total_years: 4 },
  { major_name: "Kỹ Thuật Phần Mềm", icon: "bi-code-square", semesters_per_year: 3, total_years: 4 },
  { major_name: "An Ninh Mạng", icon: "bi-shield-lock", semesters_per_year: 3, total_years: 4 },
];

const safeParseJSON = (raw, fallback = {}) => {
  if (!raw || raw === "undefined" || raw === "null") return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
};

export const AcademicSurveyModal = ({ isOpen, onSave, onDismiss }) => {
  const { detectedYear, detectedCohort, detectedMajor, detectedGpa } = useMemo(() => {
    let studentCode = "";
    let faculty = "Hệ Thống Thông Tin";
    let defaultGpa = 3.0;

    try {
      const rawUser = localStorage.getItem("user");
      const rawUserInfo = localStorage.getItem("user_info");
      const u = safeParseJSON(
        rawUser && rawUser !== "undefined" ? rawUser : rawUserInfo,
        {}
      );
      studentCode = u.student_code || u.email || "";
      if (u.faculty && u.faculty !== "undefined") faculty = u.faculty;
      if (u.gpa && !isNaN(parseFloat(u.gpa))) defaultGpa = parseFloat(u.gpa);
    } catch (e) {}

    if (!studentCode || studentCode === "undefined") {
      const backupId = localStorage.getItem("tuna_user_id");
      const backupEmail = localStorage.getItem("user_email");
      studentCode =
        (backupId && backupId !== "undefined" ? backupId : "") ||
        (backupEmail && backupEmail !== "undefined" ? backupEmail : "");
    }

    const match =
      String(studentCode).match(/(?:20)?(2[0-6])\d{5}/) ||
      String(studentCode).match(/K?(2[0-6])/i);
    const admissionYearShort = match ? parseInt(match[1], 10) : 23;
    const admissionYearFull = 2000 + admissionYearShort;

    const currentYear = new Date().getFullYear();
    let calcYear = currentYear - admissionYearFull + 1;
    if (calcYear < 1) calcYear = 1;
    if (calcYear > 4) calcYear = 4;

    return {
      detectedYear: calcYear,
      detectedCohort: `K${admissionYearShort}`,
      detectedMajor: faculty,
      detectedGpa: defaultGpa,
    };
  }, []);

  const [major, setMajor] = useState(detectedMajor);
  const [year, setYear] = useState(detectedYear);
  const [semester, setSemester] = useState(1);
  const [semestersPerYear, setSemestersPerYear] = useState(3);
  const [totalYears, setTotalYears] = useState(4);
  const [availableMajors, setAvailableMajors] = useState(DEFAULT_MAJORS);
  const [dbSubjects, setDbSubjects] = useState([]);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false);
  const [subjectLevels, setSubjectLevels] = useState({});
  const [customSubjectInput, setCustomSubjectInput] = useState("");
  const [currentGpa, setCurrentGpa] = useState(detectedGpa);
  const [targetGoal, setTargetGoal] = useState("KhaGioi");
  const [dailyPace, setDailyPace] = useState(15);
  const [reminderTime, setReminderTime] = useState("20:00");
  const [toastMessage, setToastMessage] = useState(null);

  // State điều khiển Custom Dropdowns 
  const [openDropdown, setOpenDropdown] = useState(null); // 'major'
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  const getMajorIcon = (majorName = "") => {
    const lower = majorName.toLowerCase();
    if (lower.includes("hệ thống")) return "bi-hdd-network";
    if (lower.includes("công nghệ")) return "bi-cpu";
    if (lower.includes("phần mềm")) return "bi-code-square";
    if (lower.includes("an ninh") || lower.includes("an toàn")) return "bi-shield-lock";
    return "bi-journal-code";
  };

  const fetchMajorsMeta = useCallback(async (selectedMajorName) => {
    try {
      const res = await fetch(`${API_BASE}/faculty-majors`, {
        headers: {
          "Content-Type": "application/json",
          "bypass-tunnel-reminder": "true",
        },
      });
      if (!res.ok) return;
      const text = await res.text();
      const json = safeParseJSON(text, null);

      if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
        const formatted = json.data.map((m) => ({
          ...m,
          major_name: m.major_name || m.name || "Chuyên ngành",
          icon: m.icon || getMajorIcon(m.major_name || m.name),
          semesters_per_year: Number(m.semesters_per_year) || 3,
          total_years: Math.ceil(Number(m.total_years) || 4),
        }));
        setAvailableMajors(formatted);

        const targetName = selectedMajorName || detectedMajor;
        const currentMeta = formatted.find(
          (m) => m.major_name.toLowerCase() === targetName.toLowerCase()
        );
        if (currentMeta) {
          setSemestersPerYear(currentMeta.semesters_per_year);
          setTotalYears(currentMeta.total_years);
        }
      }
    } catch (e) {}
  }, [detectedMajor]);

  const fetchSubjectsFromDB = useCallback(
    async (selectedMajor, selectedYear, selectedSem, selectedCohort, currentSemPerYear = 3) => {
      setIsLoadingSubjects(true);
      try {
        const cohortParam = selectedCohort || detectedCohort;
        const semIndex = (Number(selectedYear) - 1) * Number(currentSemPerYear) + Number(selectedSem);

        const res = await fetch(
          `${API_BASE}/curriculum?major=${encodeURIComponent(
            selectedMajor
          )}&year=${selectedYear}&semester=${selectedSem}&semester_index=${semIndex}&cohort=${encodeURIComponent(
            cohortParam
          )}`,
          {
            headers: {
              "Content-Type": "application/json",
              "bypass-tunnel-reminder": "true",
            },
          }
        );

        const text = await res.text();
        const json = safeParseJSON(text, { success: false, data: [] });

        if (json.semesters_per_year) {
          setSemestersPerYear(Number(json.semesters_per_year));
        }

        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const normalized = json.data.map((item) => ({
            subjectCode: item.subject_code || item.subjectCode || "",
            subjectName: item.subject_name || item.subjectName || "Môn học chuyên ngành",
            credits: item.credits || 3,
            subjectType: item.subject_type || "mandatory",
            isCustom: false,
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
    },
    [detectedCohort]
  );

  useEffect(() => {
    if (!isOpen) return;

    let initMajor = detectedMajor;
    let initYear = detectedYear;
    let initSem = 1;

    const savedRaw = localStorage.getItem("user_academic_profile");
    const parsed = safeParseJSON(savedRaw, null);

    if (parsed && Object.keys(parsed).length > 0) {
      if (parsed.major && parsed.major !== "undefined") {
        initMajor = parsed.major;
        setMajor(parsed.major);
      }
      if (parsed.year) {
        initYear = Number(parsed.year);
        setYear(Number(parsed.year));
      }
      if (parsed.semester) {
        initSem = Number(parsed.semester);
        setSemester(Number(parsed.semester));
      }
      if (parsed.currentGpa !== undefined) setCurrentGpa(parsed.currentGpa);
      if (parsed.targetGoal) setTargetGoal(parsed.targetGoal);
      if (parsed.dailyPace) setDailyPace(Number(parsed.dailyPace));
      if (parsed.reminderTime) setReminderTime(parsed.reminderTime);

      fetchMajorsMeta(initMajor);
      fetchSubjectsFromDB(initMajor, initYear, initSem, detectedCohort, semestersPerYear).then(() => {
        if (parsed.subjectLevels && typeof parsed.subjectLevels === "object") {
          const cleanLevels = {};
          Object.keys(parsed.subjectLevels).forEach((k) => {
            if (k && k !== "undefined") {
              cleanLevels[k] = parsed.subjectLevels[k];
            }
          });
          // Nếu có môn học trong bộ nhớ tạm, ưu tiên merge đè lên dbSubjects
          if (Object.keys(cleanLevels).length > 0) {
              setSubjectLevels(cleanLevels);
          }
        }
      });
      return;
    }

    setMajor(initMajor);
    setYear(initYear);
    setSemester(initSem);
    fetchMajorsMeta(initMajor);
    fetchSubjectsFromDB(initMajor, initYear, initSem, detectedCohort, semestersPerYear);
  }, [isOpen, detectedMajor, detectedYear, detectedCohort, fetchMajorsMeta, fetchSubjectsFromDB]);

  const handleSelectMajor = (newMajor) => {
    setMajor(newMajor);
    setOpenDropdown(null);
    const meta = availableMajors.find((m) => (m.major_name || m.name) === newMajor);
    let nextSemPerYear = semestersPerYear;
    if (meta?.semesters_per_year) {
      nextSemPerYear = Number(meta.semesters_per_year);
      setSemestersPerYear(nextSemPerYear);
    }
    if (meta?.total_years) {
      setTotalYears(Math.ceil(Number(meta.total_years)));
    }
    const validSem = semester > nextSemPerYear ? 1 : semester;
    if (validSem !== semester) setSemester(validSem);

    fetchSubjectsFromDB(newMajor, year, validSem, detectedCohort, nextSemPerYear);
  };

  const handleSelectYear = (newYear) => {
    const val = Number(newYear);
    setYear(val);
    fetchSubjectsFromDB(major, val, semester, detectedCohort, semestersPerYear);
  };

  const handleSelectSemester = (newSemester) => {
    const val = Number(newSemester);
    setSemester(val);
    fetchSubjectsFromDB(major, year, val, detectedCohort, semestersPerYear);
  };

  const semesterButtons = useMemo(() => {
    const count = Math.max(1, Number(semestersPerYear) || 3);
    const list = [];
    for (let i = 1; i <= count; i++) {
      let label = `Học kỳ ${i}`;
      let subText = "Kỳ chính";
      if (i === 3) {
        label = "Học kỳ 3";
        subText = "Kỳ hè / Phụ";
      } else if (i > 3) {
        subText = "Kỳ phụ";
      }
      list.push({ id: i, label, subText });
    }
    return list;
  }, [semestersPerYear]);

  const allDisplaySubjects = useMemo(() => {
    const dbNames = new Set(dbSubjects.map((s) => s.subjectName));
    const customSubs = Object.keys(subjectLevels)
      .filter((name) => name && name !== "undefined" && !dbNames.has(name))
      .map((name) => ({
        subjectCode: "",
        subjectName: name,
        credits: "Tự chọn",
        subjectType: "elective",
        isCustom: true,
      }));
    return [...dbSubjects, ...customSubs];
  }, [dbSubjects, subjectLevels]);

  const selectedCount = useMemo(() => {
    return Object.keys(subjectLevels).filter((k) => k && k !== "undefined").length;
  }, [subjectLevels]);

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

  const toggleAllSubjects = () => {
    if (selectedCount === allDisplaySubjects.length && allDisplaySubjects.length > 0) {
      setSubjectLevels({});
    } else {
      const next = {};
      allDisplaySubjects.forEach((s) => {
        if (s.subjectName && s.subjectName !== "undefined") {
          next[s.subjectName] = subjectLevels[s.subjectName] || "medium";
        }
      });
      setSubjectLevels(next);
    }
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

  // ĐÃ SỬA: Lưu đúng biến major, year, semester và chuyển thẳng các môn học qua để Python xếp lịch
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

    const parsedGpa = Math.min(4.0, Math.max(0.0, Number(currentGpa) || 3.0));

    const studyPlan = {
      major,
      cohort: detectedCohort,
      year: Number(year),
      semester: Number(semester),
      semesterIndex: (Number(year) - 1) * Number(semestersPerYear) + Number(semester),
      subjects: selectedSubs,
      subjectLevels: cleanSubjectLevels,
      currentGpa: parsedGpa,
      targetGoal,
      dailyPace: Number(dailyPace),
      reminderTime,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem("user_academic_profile", JSON.stringify(studyPlan));
    showToast("Đã lưu kế hoạch và lộ trình học tập cá nhân!");

    if (onSave) {
      // Đóng modal sau 500ms và kích hoạt lại hàm fetch phía bên ngoài với data mới nhất
      setTimeout(() => onSave(studyPlan), 500);
    }
  };

  const majorsListToRender =
    Array.isArray(availableMajors) && availableMajors.length > 0
      ? availableMajors
      : DEFAULT_MAJORS;

  return (
    <div
      className="fixed inset-0 w-full h-full bg-[#F4F7FE] flex flex-col z-[1200] overflow-y-auto overflow-x-hidden select-none"
    >
      {toastMessage && (
        <div
          className="fixed top-20 left-3 right-3 z-[1300] flex items-center justify-between p-3.5 rounded-2xl shadow-xl border transition-all duration-300 backdrop-blur-md break-words"
          style={{
            backgroundColor:
              toastMessage.type === "error"
                ? "rgba(239, 68, 68, 0.96)"
                : "rgba(16, 185, 129, 0.96)",
            color: "white",
            borderColor: toastMessage.type === "error" ? "#f87171" : "#34d399",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center text-sm shrink-0">
              <i
                className={`bi ${
                  toastMessage.type === "error"
                    ? "bi-exclamation-triangle-fill"
                    : "bi-check2-circle"
                } text-base`}
              ></i>
            </span>
            <span className="text-xs font-black truncate leading-snug">
              {toastMessage.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center border-0 cursor-pointer shrink-0 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[#0045ce] text-white sticky top-0 shadow-xs select-none flex-shrink-0 z-30 w-full">
        <div style={{ height: "max(var(--sat, 0px), 36px)", width: "100%" }} />

        <div className="px-3.5 pb-3 pt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={onDismiss}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center border-0 text-white transition shrink-0 cursor-pointer shadow-2xs"
              title="Quay lại"
            >
              <i className="bi bi-arrow-left text-sm font-black"></i>
            </button>
            <div className="flex flex-col justify-center min-w-0 flex-1">
              <h6 className="mb-0 font-black text-[15px] tracking-tight leading-tight truncate text-white">
                Kế hoạch & Lộ trình học tập
              </h6>
              <span className="text-blue-100/90 text-[11px] font-medium block truncate mt-0.5">
                Đồng bộ Khóa {detectedCohort} • {major}
              </span>
            </div>
          </div>
          <div className="w-[88px] shrink-0 pointer-events-none" />
        </div>
      </div>

      {/* Nội dung chính */}
      <div className="p-3.5 space-y-3.5 flex-1 pb-28 max-w-lg mx-auto w-full overflow-x-hidden relative">
        
        {/* Thanh trạng thái + Nút Lưu nhanh */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-extrabold text-slate-600">
              Thông số lộ trình
            </span>
            <span className="text-[10.5px] font-bold text-[#0045ce] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
              Năm {year} • HK{semester}
            </span>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-3.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs border-0 shadow-xs active:scale-95 transition cursor-pointer flex items-center gap-1"
          >
            <i className="bi bi-check-lg"></i>
            <span>Lưu lại</span>
          </button>
        </div>

        {/* Khối 1: Chuyên ngành đào tạo */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5 z-20 relative" ref={dropdownRef}>
          <div className="flex items-center justify-between">
            <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">
                1
              </span>
              Chuyên ngành đào tạo:
            </label>
            <span className="text-[10px] font-bold text-slate-400">Khoa CNTT</span>
          </div>

          <div className="relative w-full mt-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenDropdown((prev) => (prev === "major" ? null : "major"));
              }}
              className={`w-full flex items-center justify-between bg-slate-50 border rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-800 transition cursor-pointer ${
                openDropdown === "major" ? "border-[#0045ce] bg-white ring-2 ring-blue-100" : "border-slate-200 hover:bg-slate-100/80"
              }`}
            >
              <div className="flex items-center gap-2">
                 <i className={`bi ${getMajorIcon(major)} text-[#0045ce] text-sm`}></i>
                 <span className="truncate">{major || "Chọn chuyên ngành..."}</span>
              </div>
              <i className={`bi bi-chevron-down text-[10px] text-slate-400 transition-transform duration-200 ${openDropdown === "major" ? "rotate-180 text-[#0045ce]" : ""}`}></i>
            </button>

            {openDropdown === "major" && (
              <div 
                className="absolute left-0 top-full mt-1.5 w-full max-h-60 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {majorsListToRender.map((item, idx) => {
                  const name = item.major_name || item.name;
                  const iconCls = item.icon || getMajorIcon(name);
                  const isSelected = major === name;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectMajor(name)}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold transition flex items-center justify-between border-0 cursor-pointer ${
                        isSelected ? "bg-blue-50 text-[#0045ce]" : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <i className={`bi ${iconCls} text-sm ${isSelected ? "text-amber-500" : "text-slate-400"}`}></i>
                        <span className="truncate">{name}</span>
                      </div>
                      {isSelected && <i className="bi bi-check2 text-sm shrink-0"></i>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Khối 2: Thời điểm học hiện tại */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-3 z-10 relative">
          <div className="flex items-center justify-between">
            <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">
                2
              </span>
              Thời điểm học hiện tại:
            </label>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              Khóa: {detectedCohort}
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-slate-500 block text-[10.5px] m-0">
              Năm học
            </label>
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${totalYears || 4}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: totalYears || 4 }, (_, idx) => idx + 1).map((y) => {
                const active = Number(year) === y;
                const isCurrentCohortYear = y === detectedYear;
                return (
                  <button
                    type="button"
                    key={y}
                    onClick={() => handleSelectYear(y)}
                    className={`py-2 px-1 rounded-xl border text-center transition cursor-pointer ${
                      active
                        ? "bg-[#0045ce] text-white border-[#0045ce] font-black shadow-2xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 font-bold hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-xs">Năm {y}</div>
                    {isCurrentCohortYear && (
                      <div
                        className={`text-[9px] font-bold leading-none mt-0.5 ${
                          active ? "text-amber-300" : "text-[#0045ce]"
                        }`}
                      >
                        Hiện tại
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-500 block text-[10.5px] m-0">
                Học kỳ
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">
                {semestersPerYear} học kỳ / năm
              </span>
            </div>
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${semesterButtons.length}, minmax(0, 1fr))`,
              }}
            >
              {semesterButtons.map((sem) => {
                const active = Number(semester) === sem.id;
                return (
                  <button
                    type="button"
                    key={sem.id}
                    onClick={() => handleSelectSemester(sem.id)}
                    className={`py-2 px-1.5 rounded-xl border text-center transition cursor-pointer ${
                      active
                        ? "bg-[#0045ce] text-white border-[#0045ce] font-black shadow-2xs"
                        : "bg-slate-50 text-slate-700 border-slate-200 font-bold hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-xs">{sem.label}</div>
                    <div
                      className={`text-[9.5px] font-semibold mt-0.5 leading-none ${
                        active ? "text-blue-100" : "text-slate-400"
                      }`}
                    >
                      {sem.subText}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Khối 3: Danh sách môn học cần ôn tập */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5 z-0 relative">
          <div className="flex items-center justify-between gap-2">
            <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black shrink-0">
                3
              </span>
              <span>
                Môn học cần ôn tập ({selectedCount} môn đã chọn):
              </span>
            </label>

            {allDisplaySubjects.length > 0 && (
              <button
                type="button"
                onClick={toggleAllSubjects}
                className="text-[10.5px] font-extrabold text-[#0045ce] bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg border-0 cursor-pointer transition shrink-0"
              >
                {selectedCount === allDisplaySubjects.length
                  ? "Bỏ chọn hết"
                  : "Chọn tất cả"}
              </button>
            )}
          </div>

          {isLoadingSubjects ? (
            <div className="py-7 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="spinner-border spinner-border-sm text-[#0045ce] me-2"></span>
              Đang tải môn học từ CSDL...
            </div>
          ) : allDisplaySubjects.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 font-bold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Chưa có môn học trong CSDL cho học kỳ này. Bạn có thể tự thêm môn bên dưới.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {allDisplaySubjects.map((sub, idx) => {
                const subName = sub.subjectName;
                if (!subName || subName === "undefined") return null;

                const isChecked = !!subjectLevels[subName];
                const currentLvl = subjectLevels[subName] || "medium";

                return (
                  <div
                    key={`${subName}-${idx}`}
                    onClick={() => toggleSubject(subName)}
                    className={`p-2.5 rounded-2xl border transition cursor-pointer ${
                      isChecked
                        ? "bg-blue-50/70 border-blue-300 shadow-2xs"
                        : "bg-slate-50 border-slate-200 opacity-65 hover:opacity-95"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs text-slate-800 break-words leading-snug block">
                          {subName}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-slate-500 font-semibold bg-white px-2 py-0.5 rounded-md border border-slate-200/80">
                            {typeof sub.credits === "number"
                              ? `${sub.credits} tín chỉ`
                              : sub.credits}
                          </span>
                          {sub.isCustom && (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                              Ngoài khung
                            </span>
                          )}
                        </div>
                      </div>
                      <i
                        className={`bi text-base shrink-0 ${
                          isChecked
                            ? "bi-check-circle-fill text-[#0045ce]"
                            : "bi-circle text-slate-300"
                        }`}
                      ></i>
                    </div>

                    {isChecked && (
                      <div
                        className="flex items-center justify-between gap-1.5 mt-2 pt-2 border-t border-blue-100/90"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[10px] font-extrabold text-slate-500">
                          Độ tự tin:
                        </span>
                        <div className="flex items-center gap-1">
                          {[
                            {
                              id: "weak",
                              label: "Yếu",
                              color:
                                currentLvl === "weak"
                                  ? "bg-rose-500 text-white border-rose-500"
                                  : "bg-white text-rose-600 border-rose-200",
                            },
                            {
                              id: "medium",
                              label: "Vừa",
                              color:
                                currentLvl === "medium"
                                  ? "bg-amber-500 text-white border-amber-500"
                                  : "bg-white text-amber-700 border-amber-200",
                            },
                            {
                              id: "good",
                              label: "Tốt",
                              color:
                                currentLvl === "good"
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-white text-emerald-700 border-emerald-200",
                            },
                          ].map((btn) => (
                            <button
                              key={btn.id}
                              type="button"
                              onClick={(e) => changeLevel(subName, btn.id, e)}
                              className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-black transition cursor-pointer ${btn.color}`}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomSubject();
                }
              }}
              placeholder="Thêm môn học ngoài khung..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#0045ce]"
            />
            <button
              type="button"
              onClick={handleAddCustomSubject}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs border-0 cursor-pointer shrink-0 transition"
            >
              + Thêm
            </button>
          </div>
        </div>

        {/* Khối 4: Điểm GPA */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-3 z-0 relative">
          <div className="flex items-center justify-between">
            <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">
                4
              </span>
              Điểm GPA hiện tại & Mục tiêu:
            </label>
            <span className="text-[10px] text-slate-400 font-bold">
              Thang điểm 4.0
            </span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-black text-slate-800 block">
                GPA tích lũy hiện tại:
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Bù trừ trọng số theo khoảng cách điểm mục tiêu
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
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
                className={`p-2.5 rounded-2xl border text-center transition cursor-pointer ${
                  targetGoal === g.id
                    ? "bg-[#0045ce] text-white border-[#0045ce] shadow-sm"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <div className="font-black text-xs">{g.label}</div>
                <div className="text-[9.5px] font-bold mt-0.5 opacity-80">
                  {g.gpa}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Khối 5: Kế hoạch */}
        <div className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs space-y-2 z-0 relative">
          <label className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 m-0">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0045ce] flex items-center justify-center text-[10.5px] font-black">
              5
            </span>
            Kế hoạch tự học mỗi ngày:
          </label>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="font-bold text-slate-600 mb-1 block text-[11px]">
                Thời lượng
              </label>
              <div className="flex gap-1">
                {[15, 30, 45].map((pace) => (
                  <button
                    type="button"
                    key={pace}
                    onClick={() => setDailyPace(pace)}
                    className={`flex-1 py-2 rounded-xl border font-black text-xs transition cursor-pointer ${
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
              <label className="font-bold text-slate-600 mb-1 block text-[11px]">
                Giờ nhắc học
              </label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-xs text-slate-800 focus:outline-none focus:border-[#0045ce]"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
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