// src/admin/ManageSchedules.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const ManageSchedules = () => {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Danh mục lấy 100% từ bảng faculty_majors
  const [majorMap, setMajorMap] = useState({});
  const [majors, setMajors] = useState([]);
  const [classes, setClasses] = useState([]);

  // Bộ lọc dữ liệu
  const [filterMajor, setFilterMajor] = useState("");
  const [filterCohort, setFilterCohort] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [filterYear, setFilterYear] = useState("1");
  const [filterSemester, setFilterSemester] = useState("1");
  const [filterType, setFilterType] = useState("all");

  const [activeMenuData, setActiveMenuData] = useState(null);
  const menuDropdownRef = useRef(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [entryMode, setEntryMode] = useState("from_curriculum");
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const getTodayStr = () => new Date().toISOString().split("T")[0];

  const getCalculatedSemesterIndex = (year, sem) => {
    const spy = Number(majorMap[filterMajor]?.semestersPerYear) || 3;
    return (Number(year) - 1) * spy + Number(sem);
  };

  const [formData, setFormData] = useState({
    facultyMajor: "",
    cohort: "",
    className: "",
    academicYear: 1,
    semester: 1,
    semesterIndex: 1,
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

  const getHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("admin_token") || localStorage.getItem("token") || ""}`,
  }), []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target)) {
        setActiveMenuData(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // 1. Nạp danh mục Ngành & Khóa chuẩn xác từ faculty_majors
  useEffect(() => {
    let isMounted = true;
    const fetchMetaOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/schedules/admin/meta-options`, { headers: getHeaders() });
        const d = await res.json();
        if (isMounted && d.success && d.data) {
          const mMap = d.data.majorMap || {};
          const mList = d.data.majors || [];
          setMajorMap(mMap);
          setMajors(mList);
          setClasses(d.data.classes || []);

          if (mList.length > 0) {
            const firstMajor = mList[0].majorName;
            setFilterMajor(firstMajor);
            const availableCohorts = mMap[firstMajor]?.cohorts || [];
            setFilterCohort(availableCohorts[0] || "");
          }
        }
      } catch (e) {
        console.error("Lỗi nạp danh mục:", e);
      }
    };
    fetchMetaOptions();
    return () => { isMounted = false; };
  }, [getHeaders]);

  // Danh sách khóa hợp lệ của ngành đang chọn
  const activeCohorts = useMemo(() => {
    return majorMap[filterMajor]?.cohorts || [];
  }, [majorMap, filterMajor]);

  // Khi đổi ngành, tự động chuyển về khóa đầu tiên của ngành đó
  const handleMajorChange = (newMajor) => {
    setFilterMajor(newMajor);
    const cohortsOfMajor = majorMap[newMajor]?.cohorts || [];
    setFilterCohort(cohortsOfMajor[0] || "");
  };

  // 2. Tải thời khóa biểu
  const fetchSchedules = useCallback(async () => {
    if (!filterMajor || !filterCohort) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        major: filterMajor,
        cohort: filterCohort,
        className: filterClass,
        year: filterYear,
        semester: filterSemester,
        type: filterType,
      }).toString();

      const res = await fetch(`${API_BASE}/schedules/admin/list?${q}`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success) setSchedules(d.data || []);
    } catch (e) {
      console.error("Lỗi tải TKB:", e);
    } finally {
      setLoading(false);
    }
  }, [filterMajor, filterCohort, filterClass, filterYear, filterSemester, filterType, getHeaders]);

  useEffect(() => {
    fetchSchedules();
    setCurrentPage(1);
    setActiveMenuData(null);
  }, [fetchSchedules]);

  // 3. Nạp môn từ Khung CTĐT theo kỳ để xếp lịch
  const loadCurriculumSubjects = async (semIdx) => {
    if (!filterMajor || !semIdx) return;
    setLoadingCurriculum(true);
    try {
      const res = await fetch(
        `${API_BASE}/schedules/available-subjects?major=${encodeURIComponent(filterMajor)}&cohort=${encodeURIComponent(filterCohort)}&semesterIndex=${semIdx}`,
        { headers: getHeaders() }
      );
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

    const semIndex = getCalculatedSemesterIndex(filterYear, filterSemester);

    setFormData({
      facultyMajor: filterMajor,
      cohort: filterCohort,
      className: filterClass !== "all" ? filterClass : "",
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
    loadCurriculumSubjects(semIndex);
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

  const handleFileUpload = async (e, isOverwrite = false) => {
    const file = e.target.files ? e.target.files[0] : (fileInputRef.current ? fileInputRef.current.files[0] : null);
    if (!file) return;

    if (!filterMajor || !filterCohort) {
      alert("Vui lòng chọn Ngành và Khóa tuyển sinh hợp lệ trước khi nạp file!");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const data = new FormData();
    data.append("file", file);
    data.append("targetMajor", filterMajor);
    data.append("targetCohort", filterCohort);
    data.append("targetClass", filterClass);
    if (isOverwrite) data.append("isOverwrite", "true");

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/schedules/admin/upload-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("admin_token") || localStorage.getItem("token") || ""}` },
        body: data,
      });

      const resData = await res.json();

      if (res.status === 409 && resData.requireConfirmation) {
        setUploading(false);
        const userConfirmed = window.confirm(resData.message);
        if (userConfirmed) {
          return handleFileUpload({ target: { files: [file] } }, true);
        } else {
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      }

      if (resData.success) {
        alert("✅ " + resData.message);
        fetchSchedules();
      } else {
        alert("Lỗi: " + resData.message);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setUploading(false);
      if (!isOverwrite && fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const isEdit = !!editingItem;
      const url = isEdit ? `${API_BASE}/schedules/admin/${editingItem.id}` : `${API_BASE}/schedules/admin/create`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(formData),
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
    if (!window.confirm(`Xác nhận xóa tiết học môn "${item.subjectName}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/schedules/admin/${item.id}`, { method: "DELETE", headers: getHeaders() });
      const d = await res.json();
      if (d.success) fetchSchedules();
    } catch (e) {
      alert("Lỗi máy chủ");
    }
  };

  const totalPages = Math.ceil(schedules.length / itemsPerPage) || 1;
  const paginatedData = schedules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="d-flex flex-column gap-4 w-100" style={{ color: "#1e293b" }}>
      {/* 1. KHỐI BỘ LỌC ĐỒNG BỘ */}
      <div className="bg-white rounded-4 p-4 border shadow-sm mb-2" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-1">
          <div className="d-flex align-items-center gap-3">
            <span
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0"
              style={{ width: "40px", height: "40px", background: "linear-gradient(135deg, #185bf0 0%, #0d9488 100%)" }}
            >
              <i className="bi bi-calendar3-range-fill fs-5"></i>
            </span>
            <div>
              <h6 className="fw-black text-dark mb-0 fs-6">Thời Khóa Biểu Đào Tạo</h6>
              <small className="text-secondary fw-medium" style={{ fontSize: "12px" }}>
                Ràng buộc chặt chẽ với Ngành đào tạo và Khung CTĐT ban hành
              </small>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="d-none" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || activeCohorts.length === 0}
              className="btn btn-sm btn-outline-success rounded-pill px-3 py-2 fw-bold d-flex align-items-center gap-1.5 shadow-2xs"
              style={{ fontSize: "12px" }}
            >
              {uploading ? "Đang nạp file..." : "Nhập Excel TKB (.xlsx)"}
            </button>

            <button
              onClick={handleOpenScheduleModal}
              disabled={activeCohorts.length === 0}
              className="btn btn-primary rounded-pill px-3.5 py-2 fw-bold shadow-xs d-flex align-items-center gap-1.5 border-0 text-white cursor-pointer"
              style={{ fontSize: "12.5px", background: "#185bf0" }}
            >
              <i className="bi bi-plus-circle-fill fs-6"></i>
              <span>Xếp Lịch Mới</span>
            </button>
          </div>
        </div>

        {/* Hàng bộ lọc */}
        <div className="row g-3 pt-1">
          <div className="col-12 col-md-4">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Ngành Đào Tạo</label>
            <select
              value={filterMajor}
              onChange={(e) => handleMajorChange(e.target.value)}
              className="form-select form-select-sm rounded-3 bg-white shadow-none fw-semibold"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0" }}
            >
              {majors.map((m) => (
                <option key={m.majorCode} value={m.majorName}>
                  [{m.majorCode}] {m.majorName}
                </option>
              ))}
            </select>
          </div>

          {/* Khóa tuyển sinh: CHỈ HIỆN CÁC KHÓA ĐÃ TẠO TRONG QUẢN LÝ NGÀNH */}
          <div className="col-6 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Khóa Tuyển Sinh (Đã duyệt)
            </label>
            <select
              value={filterCohort}
              onChange={(e) => setFilterCohort(e.target.value)}
              className="form-select form-select-sm rounded-3 bg-white shadow-none fw-semibold font-monospace text-primary"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0" }}
            >
              {activeCohorts.length === 0 ? (
                <option value="">Chưa gán khóa</option>
              ) : (
                activeCohorts.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))
              )}
            </select>
          </div>

          <div className="col-6 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Lớp Học</label>
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="form-select form-select-sm rounded-3 bg-white shadow-none fw-semibold"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0" }}
            >
              <option value="all">Tất cả các lớp</option>
              {classes.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          <div className="col-4 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Năm Học</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="form-select form-select-sm rounded-3 bg-white shadow-none fw-semibold"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0" }}
            >
              <option value="1">Năm 1</option>
              <option value="2">Năm 2</option>
              <option value="3">Năm 3</option>
              <option value="4">Năm 4</option>
            </select>
          </div>

          <div className="col-4 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Học Kỳ</label>
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="form-select form-select-sm rounded-3 bg-white shadow-none fw-semibold"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0" }}
            >
              <option value="1">Kỳ 1</option>
              <option value="2">Kỳ 2</option>
              <option value="3">Kỳ 3</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. BẢNG THỜI KHÓA BIỂU */}
      <div className="rounded-4 p-4 shadow-sm bg-white border" style={{ borderColor: "#f1f5f9" }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-1.5 rounded-pill fw-bold" style={{ fontSize: "11px" }}>
            {filterMajor} • {filterCohort || "Chưa chọn khóa"} • Năm {filterYear} (Kỳ {filterSemester})
          </span>
          <small className="text-muted fw-semibold">Tổng: <b>{schedules.length}</b> tiết học/lịch thi</small>
        </div>

        <div className="table-responsive" style={{ minHeight: "260px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap" style={{ minWidth: "860px" }}>
            <thead className="table-light">
              <tr style={{ fontSize: "11px", color: "#64748b" }} className="text-uppercase">
                <th style={{ width: "50px", textAlign: "center" }}>STT</th>
                <th>Môn Học & Mã HP (Theo Khung CTĐT)</th>
                <th>Phân Loại</th>
                <th>Ngày Diễn Ra</th>
                <th>Tiết Học</th>
                <th>Phòng</th>
                <th>Giảng Viên</th>
                <th className="text-end pe-3" style={{ width: "80px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "13px" }}>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-5 text-muted">Đang nạp dữ liệu...</td></tr>
              ) : activeCohorts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-danger fw-bold">
                    Ngành "{filterMajor}" chưa có khóa tuyển sinh nào trong Quản Lý Ngành. Vui lòng tạo khóa trước!
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    Chưa có lịch cho tiêu chí này. Bấm <b>"Nhập Excel TKB"</b> hoặc <b>"Xếp Lịch Mới"</b>.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => {
                  const virtualIndex = (currentPage - 1) * itemsPerPage + index + 1;
                  return (
                    <tr key={item.id}>
                      <td className="fw-bold text-muted text-center" style={{ fontSize: "12px" }}>
                        #{virtualIndex}
                      </td>
                      <td>
                        <span className="fw-bold text-dark d-block">{item.subjectName}</span>
                        <div className="d-flex align-items-center gap-1">
                          <code className="text-primary font-monospace fw-bold" style={{ fontSize: "11px" }}>
                            {item.subjectCode}
                          </code>
                          <span className="badge bg-light text-secondary border px-1.5 py-0 font-monospace" style={{ fontSize: "9.5px" }}>
                            {item.credits} TC
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge rounded-pill px-2.5 py-1 fw-bold bg-primary-subtle text-primary" style={{ fontSize: "10.5px" }}>
                          {item.scheduleType === "exam" ? "Lịch Thi" : item.scheduleType === "practice" ? "Thực Hành" : "Lý Thuyết"}
                        </span>
                      </td>
                      <td>{item.specificDate} (Thứ {item.dayOfWeek})</td>
                      <td>Tiết {item.startPeriod} - {item.endPeriod}</td>
                      <td><span className="badge bg-light text-dark border px-2 py-1 fw-bold">{item.room}</span></td>
                      <td className="text-secondary">{item.teacherName}</td>
                      <td className="text-end pe-3">
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="btn btn-sm btn-light rounded-circle border text-danger p-0"
                          style={{ width: "30px", height: "30px" }}
                        >
                          <i className="bi bi-trash3-fill"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. MODAL XẾP LỊCH: ĐỒNG BỘ MÔN VỚI KHUNG CTĐT */}
      {showScheduleModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "500px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2 border-bottom">
                <h6 className="fw-bold mb-0 text-dark">Xếp Lịch Học / Thi</h6>
                <button type="button" onClick={() => setShowScheduleModal(false)} className="btn-close"></button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-3">
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                      Môn học trong Khung CTĐT ban hành *
                    </label>
                    {loadingCurriculum ? (
                      <div className="text-muted small">Đang tải danh sách môn học...</div>
                    ) : curriculumSubjects.length === 0 ? (
                      <div className="alert alert-warning p-2 small mb-0">
                        Chưa có học phần nào trong Khung CTĐT của Kỳ {formData.semesterIndex}. Vui lòng nạp Khung CTĐT trước!
                      </div>
                    ) : (
                      <select
                        value={selectedPlanId}
                        onChange={handleSelectCurriculumSubject}
                        className="form-select form-select-sm fw-bold text-primary shadow-none"
                      >
                        {curriculumSubjects.map((s) => (
                          <option key={s.curriculum_plan_id} value={s.curriculum_plan_id}>
                            [{s.subject_code}] {s.subject_name} ({s.credits} TC)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Ngày học *</label>
                      <input
                        type="date"
                        required
                        value={formData.specificDate}
                        onChange={(e) => setFormData({ ...formData, specificDate: e.target.value })}
                        className="form-control form-control-sm rounded-3 fw-bold"
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Phòng học *</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: C201"
                        value={formData.room}
                        onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                        className="form-control form-control-sm rounded-3 fw-bold"
                      />
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Tiết BD *</label>
                      <input
                        type="number" min="1" max="12" required
                        value={formData.startPeriod}
                        onChange={(e) => setFormData({ ...formData, startPeriod: Number(e.target.value) })}
                        className="form-control form-control-sm text-center fw-bold"
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Tiết KT *</label>
                      <input
                        type="number" min="1" max="12" required
                        value={formData.endPeriod}
                        onChange={(e) => setFormData({ ...formData, endPeriod: Number(e.target.value) })}
                        className="form-control form-control-sm text-center fw-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Giảng viên giảng dạy</label>
                    <input
                      type="text"
                      placeholder="VD: ThS. Nguyễn Văn A"
                      value={formData.teacherName}
                      onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
                      className="form-control form-control-sm rounded-3 fw-semibold"
                    />
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                  <button type="button" onClick={() => setShowScheduleModal(false)} className="btn btn-light rounded-pill px-3.5 py-1.5 small border">Hủy</button>
                  <button type="submit" disabled={curriculumSubjects.length === 0} className="btn btn-primary rounded-pill px-4 py-1.5 small border-0 text-white" style={{ background: "#185bf0" }}>Lưu vào CSDL</button>
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