// src/admin/ManageSchedules.jsx
import React, { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:5000/api";

export const ManageSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);

  // Danh mục nạp trực tiếp từ bảng faculty_majors & academic_cohorts
  const [options, setOptions] = useState({
    majors: [],
    cohorts: [],
    classes: {},
  });

  // Bộ lọc
  const [filterMajor, setFilterMajor] = useState("");
  const [filterCohort, setFilterCohort] = useState("");
  const [filterYear, setFilterYear] = useState("4");
  const [filterSemester, setFilterSemester] = useState("1");
  const [filterType, setFilterType] = useState("all");

  // Floating Action Menu Fixed
  const [activeMenuData, setActiveMenuData] = useState(null);
  const menuDropdownRef = useRef(null);

  // Modal Xếp Lịch
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Chế độ nhập môn: 'from_curriculum' | 'custom'
  const [entryMode, setEntryMode] = useState("from_curriculum");
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const getTodayStr = () => new Date().toISOString().split("T")[0];

  // Form State tinh gọn
  const [formData, setFormData] = useState({
    facultyMajor: "",
    cohort: "",
    className: "HTTT2311",
    academicYear: 4,
    semester: 1,
    semesterIndex: 10,
    curriculumPlanId: null,
    subjectCode: "",
    subjectName: "",
    credits: 3,
    creditsStructure: "3(3,0,0)",
    scheduleType: "study",
    specificDate: getTodayStr(),
    startPeriod: 1,
    endPeriod: 3,
    room: "C201",
    teacherName: "",
    note: "",
  });

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
  });

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target)) {
        setActiveMenuData(null);
      }
    };
    const handleScroll = () => setActiveMenuData(null);

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  // 1. Tải danh mục Ngành (faculty_majors) & Khóa (academic_cohorts) từ CSDL
  useEffect(() => {
    const fetchMetaOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/schedules/admin/meta-options`, { headers: getHeaders() });
        const d = await res.json();
        if (d.success && d.data) {
          const loadedMajors = d.data.majors || [];
          const loadedCohorts = d.data.cohorts || [];

          setOptions({
            majors: loadedMajors,
            cohorts: loadedCohorts,
            classes: d.data.classes || {},
          });

          // Tự động gán lựa chọn đầu tiên làm mặc định cho bộ lọc nếu chưa có
          if (loadedMajors.length > 0) {
            setFilterMajor((prev) => prev || loadedMajors[0].majorName);
          }
          if (loadedCohorts.length > 0) {
            // Ưu tiên chọn K23 nếu có, không thì lấy khóa đầu tiên
            const hasK23 = loadedCohorts.find((c) => c === "K23");
            setFilterCohort((prev) => prev || hasK23 || loadedCohorts[0]);
          }
        }
      } catch (e) {
        console.error("Lỗi nạp danh mục ngành & khóa từ CSDL:", e);
      }
    };
    fetchMetaOptions();
  }, []);

  // 2. Tải thời khóa biểu từ academic_schedules
  const fetchSchedules = async () => {
    if (!filterMajor || !filterCohort) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        major: filterMajor,
        cohort: filterCohort,
        year: filterYear,
        semester: filterSemester,
        type: filterType,
      }).toString();

      const res = await fetch(`${API_BASE}/schedules/admin/list?${q}`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success) setSchedules(d.data || []);
    } catch (e) {
      console.error("Lỗi tải lịch học:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    setCurrentPage(1);
    setActiveMenuData(null);
  }, [filterMajor, filterCohort, filterYear, filterSemester, filterType]);

  const getCalculatedSemesterIndex = (year, sem) => {
    return (Number(year) - 1) * 3 + Number(sem);
  };

  // Nạp môn từ Khung CTĐT
  const loadCurriculumSubjects = async (cls, semIdx) => {
    setLoadingCurriculum(true);
    try {
      const res = await fetch(`${API_BASE}/schedules/available-subjects?className=${cls}&semesterIndex=${semIdx}`, {
        headers: getHeaders(),
      });
      const d = await res.json();
      if (d.success && d.data && d.data.length > 0) {
        setCurriculumSubjects(d.data);
        const first = d.data[0];
        setSelectedPlanId(first.curriculum_plan_id);
        setFormData((prev) => ({
          ...prev,
          curriculumPlanId: first.curriculum_plan_id,
          subjectCode: first.subject_code,
          subjectName: first.subject_name,
          credits: first.credits,
          creditsStructure: first.credits_structure || "3(3,0,0)",
        }));
      } else {
        setCurriculumSubjects([]);
        setSelectedPlanId("");
      }
    } catch (e) {
      setCurriculumSubjects([]);
    } finally {
      setLoadingCurriculum(false);
    }
  };

  const handleOpenScheduleModal = () => {
    setActiveMenuData(null);
    setEditingItem(null);
    setEntryMode("from_curriculum");

    const defaultMajor = filterMajor || options.majors[0]?.majorName || "Hệ Thống Thông Tin";
    const defaultCohort = filterCohort || options.cohorts[0] || "K23";
    const targetClass = defaultCohort.includes("25") ? "HTTT2511" : "HTTT2311";
    const semIndex = getCalculatedSemesterIndex(filterYear, filterSemester);

    setFormData({
      facultyMajor: defaultMajor,
      cohort: defaultCohort,
      className: targetClass,
      academicYear: Number(filterYear),
      semester: Number(filterSemester),
      semesterIndex: semIndex,
      curriculumPlanId: null,
      subjectCode: "",
      subjectName: "",
      credits: 3,
      creditsStructure: "3(3,0,0)",
      scheduleType: "study",
      specificDate: getTodayStr(),
      startPeriod: 1,
      endPeriod: 3,
      room: "C201",
      teacherName: "",
      note: "",
    });

    setShowScheduleModal(true);
    loadCurriculumSubjects(targetClass, semIndex);
  };

  const handleSelectCurriculumSubject = (e) => {
    const planId = e.target.value;
    setSelectedPlanId(planId);
    const sub = curriculumSubjects.find((s) => String(s.curriculum_plan_id) === String(planId));
    if (sub) {
      setFormData((prev) => ({
        ...prev,
        curriculumPlanId: sub.curriculum_plan_id,
        subjectCode: sub.subject_code,
        subjectName: sub.subject_name,
        credits: sub.credits,
        creditsStructure: sub.credits_structure || "3(3,0,0)",
      }));
    }
  };

  const handleOpenEdit = (item) => {
    setActiveMenuData(null);
    setEditingItem(item);
    setEntryMode(item.curriculumPlanId ? "from_curriculum" : "custom");

    setFormData({
      facultyMajor: item.facultyMajor,
      cohort: item.cohort,
      className: item.className || "",
      academicYear: item.academicYear,
      semester: item.semester,
      semesterIndex: item.semesterIndex || getCalculatedSemesterIndex(item.academicYear, item.semester),
      curriculumPlanId: item.curriculumPlanId || null,
      subjectCode: item.subjectCode || "",
      subjectName: item.subjectName,
      credits: item.credits || 3,
      creditsStructure: "3(3,0,0)",
      scheduleType: item.scheduleType,
      specificDate: item.specificDate || getTodayStr(),
      startPeriod: item.startPeriod,
      endPeriod: item.endPeriod,
      room: item.room,
      teacherName: item.teacherName,
      note: item.note || "",
    });

    setShowScheduleModal(true);
  };

  const toggleActionMenu = (e, item) => {
    e.stopPropagation();
    if (activeMenuData && activeMenuData.item.id === item.id) {
      setActiveMenuData(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    let top = rect.bottom + 4;
    if (spaceBelow < 90) top = rect.top - 90 - 4;

    setActiveMenuData({
      item,
      top,
      right: window.innerWidth - rect.right,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.subjectName.trim()) {
      alert("Vui lòng điền tên môn học!");
      return;
    }
    if (!formData.specificDate) {
      alert("Vui lòng chọn ngày diễn ra!");
      return;
    }

    try {
      const isEdit = !!editingItem;
      const url = isEdit ? `${API_BASE}/schedules/admin/${editingItem.id}` : `${API_BASE}/schedules/admin/create`;
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        ...formData,
        curriculumPlanId: entryMode === "from_curriculum" ? formData.curriculumPlanId : null,
      };

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ " + data.message);
        setShowScheduleModal(false);
        fetchSchedules();
      } else {
        alert("Lỗi: " + data.message);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleDelete = async (item) => {
    setActiveMenuData(null);
    if (!window.confirm(`Xác nhận xóa môn/tiết học "${item.subjectName}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/schedules/admin/${item.id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) fetchSchedules();
      else alert(data.message);
    } catch (e) {
      alert("Lỗi máy chủ");
    }
  };

  const formatTimeSlot = (item) => {
    const days = { 2: "Thứ Hai", 3: "Thứ Ba", 4: "Thứ Tư", 5: "Thứ Năm", 6: "Thứ Sáu", 7: "Thứ Bảy", 8: "Chủ Nhật" };
    const dayLabel = days[item.dayOfWeek] || "";
    if (item.specificDate) {
      return (
        <div>
          <span className="fw-semibold text-dark">{item.specificDate}</span>
          {dayLabel && <small className="text-secondary d-block" style={{ fontSize: "11px" }}>({dayLabel})</small>}
        </div>
      );
    }
    return <span className="fw-semibold text-dark">{dayLabel || "Lịch linh hoạt"}</span>;
  };

  const totalPages = Math.ceil(schedules.length / itemsPerPage) || 1;
  const paginatedData = schedules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="d-flex flex-column gap-3 w-100">
      {/* 1. Header Toolbar & Bộ lọc */}
      <div className="p-3 bg-white rounded-4 shadow-sm border d-flex flex-column gap-2.5">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-calendar3-range-fill text-primary fs-5"></i>
              Thời Khóa Biểu Theo Lớp & Chuyên Ngành
            </h6>
            <small className="text-muted" style={{ fontSize: "11.5px" }}>
              Đồng bộ lịch học, ngày diễn ra và thời khóa biểu cùng khung CTĐT
            </small>
          </div>

          <button
            onClick={handleOpenScheduleModal}
            className="btn btn-primary rounded-pill px-3.5 py-1.5 fw-bold shadow-sm d-flex align-items-center gap-1.5 border-0 text-white"
            style={{ fontSize: "12.5px", background: "linear-gradient(180deg, #185bf0 0%, #1546cd 100%)" }}
          >
            <i className="bi bi-plus-circle-fill fs-6"></i>
            <span>Xếp Lịch Học / Thi</span>
          </button>
        </div>

        {/* Thanh lọc dữ liệu */}
        <div className="row g-2 pt-2 border-top">
          {/* Dropdown Ngành lấy từ bảng faculty_majors */}
          <div className="col-12 col-md-3">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Ngành Đào Tạo</label>
            <select
              value={filterMajor}
              onChange={(e) => setFilterMajor(e.target.value)}
              className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
              style={{ fontSize: "12px" }}
            >
              {options.majors.map((m, idx) => (
                <option key={idx} value={m.majorName}>
                  [{m.majorCode}] {m.majorName}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown Khóa lấy từ bảng academic_cohorts */}
          <div className="col-6 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Khóa Tuyển Sinh</label>
            <select
              value={filterCohort}
              onChange={(e) => setFilterCohort(e.target.value)}
              className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
              style={{ fontSize: "12px" }}
            >
              {options.cohorts.map((c, idx) => (
                <option key={idx} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Năm Học</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
              style={{ fontSize: "12px" }}
            >
              <option value="1">Năm 1</option>
              <option value="2">Năm 2</option>
              <option value="3">Năm 3</option>
              <option value="4">Năm 4</option>
            </select>
          </div>

          <div className="col-6 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Học Kỳ</label>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
              style={{ fontSize: "12px" }}
            >
              <option value="1">Kỳ 1</option>
              <option value="2">Kỳ 2</option>
              <option value="3">Kỳ 3 (Hè)</option>
            </select>
          </div>

          <div className="col-6 col-md-3">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Phân Loại</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả</option>
              <option value="study">Lý thuyết</option>
              <option value="practice">Thực hành</option>
              <option value="exam">Lịch thi</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Bảng Danh Sách */}
      <div className="rounded-4 p-4 shadow-sm bg-white border">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-1.5 rounded-pill fw-bold">
            {filterMajor || "Hệ Thống Thông Tin"} • Khóa {filterCohort || "K23"} • Năm {filterYear} (Kỳ {filterSemester} - HK {getCalculatedSemesterIndex(filterYear, filterSemester)})
          </span>
          <small className="text-muted fw-semibold">Tổng: <b>{schedules.length}</b> tiết học/lịch thi</small>
        </div>

        <div className="table-responsive" style={{ minHeight: "240px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap" style={{ minWidth: "860px" }}>
            <thead className="table-light">
              <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                <th style={{ width: "50px", textAlign: "center" }}>STT</th>
                <th>Môn Học & Mã Học Phần</th>
                <th>Phân Loại</th>
                <th>Ngày Diễn Ra</th>
                <th>Tiết Học</th>
                <th>Phòng Học</th>
                <th>Giảng Viên</th>
                <th className="text-end pe-3" style={{ width: "80px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "13px" }}>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-5 text-muted">Đang nạp dữ liệu...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    Không có lịch học/thi cho tiêu chí đã chọn. Bấm <b>"Xếp Lịch Học / Thi"</b> để tạo lịch mới.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => {
                  const virtualIndex = (currentPage - 1) * itemsPerPage + index + 1;

                  return (
                    <tr key={item.id}>
                      <td className="fw-bold text-muted text-center" style={{ fontSize: "12px" }}>
                        {virtualIndex < 10 ? `#0${virtualIndex}` : `#${virtualIndex}`}
                      </td>
                      <td>
                        <span className="fw-bold text-dark d-block">{item.subjectName}</span>
                        <div className="d-flex align-items-center gap-1">
                          <code className="text-muted" style={{ fontSize: "11px" }}>{item.subjectCode || "NGOÀI_KHUNG"}</code>
                          {item.credits && (
                            <span className="badge bg-light text-secondary border px-1.5 py-0 font-monospace" style={{ fontSize: "9.5px" }}>
                              {item.credits} TC
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className="badge rounded-pill px-2.5 py-1 fw-bold"
                          style={{
                            background: item.scheduleType === "exam" ? "#fef2f2" : item.scheduleType === "practice" ? "#ecfeff" : "#eff6ff",
                            color: item.scheduleType === "exam" ? "#dc2626" : item.scheduleType === "practice" ? "#0891b2" : "#185bf0",
                            border: `1px solid ${item.scheduleType === "exam" ? "#fecaca" : item.scheduleType === "practice" ? "#a5f3fc" : "#bfdbfe"}`,
                            fontSize: "10.5px",
                          }}
                        >
                          {item.scheduleType === "exam" ? "Lịch Thi" : item.scheduleType === "practice" ? "Thực Hành" : "Lý Thuyết"}
                        </span>
                      </td>
                      <td>{formatTimeSlot(item)}</td>
                      <td>
                        <span className="badge bg-light text-secondary border px-2 py-1">
                          Tiết {item.startPeriod} - {item.endPeriod}
                        </span>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border px-2.5 py-1 fw-bold">
                          {item.room}
                        </span>
                      </td>
                      <td className="text-secondary">{item.teacherName}</td>
                      <td className="text-end pe-3">
                        <button
                          type="button"
                          onClick={(e) => toggleActionMenu(e, item)}
                          className="btn btn-sm btn-light rounded-circle d-inline-flex align-items-center justify-content-center p-0 border"
                          style={{ width: "32px", height: "32px", color: "#64748b" }}
                        >
                          <i className="bi bi-three-dots-vertical fs-6"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 3. Phân trang */}
        {!loading && (
          <div className="d-flex flex-wrap justify-content-between align-items-center pt-3 mt-2 border-top gap-2">
            <small className="text-muted" style={{ fontSize: "12px" }}>
              Hiển thị <b>{schedules.length ? (currentPage - 1) * itemsPerPage + 1 : 0}</b> -{" "}
              <b>{Math.min(currentPage * itemsPerPage, schedules.length)}</b> / <b>{schedules.length}</b> bản ghi
            </small>

            <div className="d-flex align-items-center gap-1 ms-auto">
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                title="Trang đầu"
              >
                <i className="bi bi-chevron-double-left small"></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Trang trước"
              >
                <i className="bi bi-chevron-left small"></i>
              </button>

              <span className="small fw-bold px-2 text-secondary" style={{ fontSize: "12px" }}>
                {currentPage} / {totalPages}
              </span>

              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Trang sau"
              >
                <i className="bi bi-chevron-right small"></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                title="Trang cuối"
              >
                <i className="bi bi-chevron-double-right small"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Floating Action Menu */}
      {activeMenuData && (
        <div
          ref={menuDropdownRef}
          className="card border-0 shadow-lg rounded-3 py-1 text-start position-fixed"
          style={{
            width: "155px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            fontSize: "12px",
            zIndex: 99999,
            top: `${activeMenuData.top}px`,
            right: `${activeMenuData.right}px`,
          }}
        >
          <button
            type="button"
            onClick={() => handleOpenEdit(activeMenuData.item)}
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent"
          >
            <i className="bi bi-pencil-fill text-primary" style={{ fontSize: "11px" }}></i>
            <span>Chỉnh sửa</span>
          </button>
          <div className="dropdown-divider my-1 border-top" style={{ borderColor: "#f1f5f9" }}></div>
          <button
            type="button"
            onClick={() => handleDelete(activeMenuData.item)}
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-danger border-0 bg-transparent"
          >
            <i className="bi bi-trash3-fill text-danger" style={{ fontSize: "11px" }}></i>
            <span>Xóa tiết học</span>
          </button>
        </div>
      )}

      {/* 5. MODAL XẾP LỊCH: CHỈ CẦN NGÀY DIỄN RA */}
      {showScheduleModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "500px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2 border-bottom">
                <div className="d-flex align-items-center gap-2.5">
                  <div
                    className="rounded-circle d-flex align-items-center justify-content-center text-white"
                    style={{ width: "36px", height: "36px", background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)" }}
                  >
                    <i className="bi bi-calendar-check fs-6"></i>
                  </div>
                  <div>
                    <h6 className="fw-bold mb-0 text-dark">
                      {editingItem ? "Cập Nhật Tiết Học / Thi" : "Xếp Lịch Thời Khóa Biểu"}
                    </h6>
                    <small className="text-secondary fw-semibold">
                      Lớp: <b className="text-primary font-monospace">{formData.className}</b> • Học kỳ: <b>{formData.semesterIndex}</b>
                    </small>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="btn btn-sm btn-light rounded-circle p-0"
                  style={{ width: "30px", height: "30px" }}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-3">
                  {!editingItem && (
                    <div className="p-1 bg-slate-100 rounded-pill border d-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEntryMode("from_curriculum")}
                        className={`btn btn-sm rounded-pill flex-fill py-1 fw-bold border-0 transition ${
                          entryMode === "from_curriculum" ? "btn-primary text-white shadow-xs" : "text-secondary bg-transparent"
                        }`}
                        style={{ fontSize: "11.5px", background: entryMode === "from_curriculum" ? "#185bf0" : "transparent" }}
                      >
                        <i className="bi bi-magic me-1"></i>
                        Chọn Từ Khung CTĐT
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEntryMode("custom");
                          setFormData((prev) => ({
                            ...prev,
                            curriculumPlanId: null,
                            subjectCode: "",
                            subjectName: "",
                            credits: 3,
                          }));
                        }}
                        className={`btn btn-sm rounded-pill flex-fill py-1 fw-bold border-0 transition ${
                          entryMode === "custom" ? "btn-dark text-white shadow-xs" : "text-secondary bg-transparent"
                        }`}
                        style={{ fontSize: "11.5px" }}
                      >
                        <i className="bi bi-pencil-square me-1"></i>
                        Tự Nhập Môn Ngoài Khung
                      </button>
                    </div>
                  )}

                  {entryMode === "from_curriculum" ? (
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-0" style={{ fontSize: "10px" }}>
                        Môn Học Theo Khung CTĐT Đã Ban Hành *
                      </label>
                      {loadingCurriculum ? (
                        <div className="text-muted small py-1.5">
                          <span className="spinner-border spinner-border-sm text-primary me-1.5"></span>
                          Đang tải danh sách học phần từ CTĐT...
                        </div>
                      ) : curriculumSubjects.length === 0 ? (
                        <div className="alert alert-warning p-2 small mb-0 rounded-3">
                          Chưa có học phần nào trong khung CTĐT kỳ này. Bạn có thể chọn <b>"Tự Nhập Môn Ngoài Khung"</b>.
                        </div>
                      ) : (
                        <select
                          value={selectedPlanId}
                          onChange={handleSelectCurriculumSubject}
                          className="form-select form-select-sm rounded-3 fw-bold text-primary shadow-none"
                          style={{ fontSize: "12.5px" }}
                        >
                          {curriculumSubjects.map((s) => (
                            <option key={s.curriculum_plan_id} value={s.curriculum_plan_id}>
                              [{s.subject_code}] {s.subject_name} ({s.credits} TC) {s.is_scheduled ? "• [ĐÃ XẾP]" : ""}
                            </option>
                          ))}
                        </select>
                      )}

                      <div className="p-2.5 rounded-3 bg-light border row g-2 mt-1">
                        <div className="col-4">
                          <small className="text-muted d-block" style={{ fontSize: "9.5px", textTransform: "uppercase" }}>Mã Học Phần</small>
                          <b className="font-monospace text-dark" style={{ fontSize: "12px" }}>{formData.subjectCode || "—"}</b>
                        </div>
                        <div className="col-4">
                          <small className="text-muted d-block" style={{ fontSize: "9.5px", textTransform: "uppercase" }}>Số Tín Chỉ</small>
                          <b className="text-success" style={{ fontSize: "12px" }}>{formData.credits} TC</b>
                        </div>
                        <div className="col-4">
                          <small className="text-muted d-block" style={{ fontSize: "9.5px", textTransform: "uppercase" }}>Cấu Trúc Giờ</small>
                          <b className="text-secondary font-monospace" style={{ fontSize: "12px" }}>{formData.creditsStructure || "3(3,0,0)"}</b>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="row g-2">
                      <div className="col-8">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Tên Môn Học *</label>
                        <input
                          type="text"
                          required
                          placeholder="VD: Sinh hoạt lớp / Kỹ năng mềm..."
                          value={formData.subjectName}
                          onChange={(e) => setFormData({ ...formData, subjectName: e.target.value })}
                          className="form-control form-control-sm rounded-3 fw-bold shadow-none"
                          style={{ fontSize: "12.5px" }}
                        />
                      </div>
                      <div className="col-4">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Số Tín Chỉ</label>
                        <input
                          type="number"
                          min="0"
                          max="15"
                          value={formData.credits}
                          onChange={(e) => setFormData({ ...formData, credits: Number(e.target.value) })}
                          className="form-control form-control-sm rounded-3 text-center fw-bold shadow-none"
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Mã Môn (Tùy chọn)</label>
                        <input
                          type="text"
                          placeholder="VD: SHL01 hoặc để trống"
                          value={formData.subjectCode}
                          onChange={(e) => setFormData({ ...formData, subjectCode: e.target.value })}
                          className="form-control form-control-sm rounded-3 font-monospace shadow-none"
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Cấu Trúc Giờ (LT, TH, BTL)</label>
                        <input
                          type="text"
                          placeholder="VD: 2(2,0,0)"
                          value={formData.creditsStructure}
                          onChange={(e) => setFormData({ ...formData, creditsStructure: e.target.value })}
                          className="form-control form-control-sm rounded-3 font-monospace shadow-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* THỜI GIAN VÀ TIẾT HỌC: CHỈ CẦN NGÀY DIỄN RA */}
                  <div className="pt-2 border-top d-flex flex-column gap-2">
                    <div className="row g-2">
                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                          Ngày Diễn Ra *
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.specificDate}
                          onChange={(e) => setFormData({ ...formData, specificDate: e.target.value })}
                          className="form-control form-control-sm rounded-3 fw-bold shadow-none"
                        />
                      </div>

                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                          Phân Loại
                        </label>
                        <select
                          value={formData.scheduleType}
                          onChange={(e) => setFormData({ ...formData, scheduleType: e.target.value })}
                          className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                        >
                          <option value="study">Lịch học</option>
                          <option value="practice">Thực hành</option>
                          <option value="exam">Lịch thi</option>
                        </select>
                      </div>
                    </div>

                    <div className="row g-2">
                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Tiết Bắt Đầu *</label>
                        <input
                          type="number" min="1" max="10" required
                          value={formData.startPeriod}
                          onChange={(e) => setFormData({ ...formData, startPeriod: Number(e.target.value) })}
                          className="form-control form-control-sm rounded-3 text-center fw-bold shadow-none"
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Tiết Kết Thúc *</label>
                        <input
                          type="number" min="1" max="10" required
                          value={formData.endPeriod}
                          onChange={(e) => setFormData({ ...formData, endPeriod: Number(e.target.value) })}
                          className="form-control form-control-sm rounded-3 text-center fw-bold shadow-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* PHÒNG HỌC & GIẢNG VIÊN */}
                  <div className="pt-2 border-top">
                    <div className="row g-2">
                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Phòng Học *</label>
                        <input
                          type="text" required placeholder="VD: C201 hoặc PM03"
                          value={formData.room}
                          onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                          className="form-control form-control-sm rounded-3 fw-bold shadow-none"
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Giảng Viên Phụ Trách</label>
                        <input
                          type="text" placeholder="VD: ThS. Nguyễn Văn A"
                          value={formData.teacherName}
                          onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
                          className="form-control form-control-sm rounded-3 fw-semibold shadow-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="btn btn-light rounded-pill px-3.5 py-1.5 small border"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary rounded-pill px-4 py-1.5 small border-0 text-white shadow-xs"
                    style={{ background: "#185bf0" }}
                  >
                    Lưu vào cơ sở dữ liệu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageSchedules;