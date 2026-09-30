// src/admin/ManageLibrary.jsx
import React, { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:5000/api";

const SUB_CATEGORIES = {
  lecture_slide: { label: "Slide bài giảng", badge: "bg-primary-subtle text-primary border-primary-subtle", icon: "bi-file-earmark-easel" },
  exam_prep: { label: "Đề thi & Trắc nghiệm", badge: "bg-danger-subtle text-danger border-danger-subtle", icon: "bi-patch-question" },
  textbook: { label: "Giáo trình chính", badge: "bg-success-subtle text-success border-success-subtle", icon: "bi-journal-bookmark" },
  assignment_project: { label: "Bài tập / Đồ án", badge: "bg-warning-subtle text-dark border-warning-subtle", icon: "bi-code-square" },
  reference: { label: "Tài liệu đọc thêm", badge: "bg-info-subtle text-dark border-info-subtle", icon: "bi-bookmark-plus" },
};

export const ManageLibrary = () => {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);

  // Danh mục động từ CSDL
  const [allMajors, setAllMajors] = useState([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);

  // Bộ lọc
  const [filterMajor, setFilterMajor] = useState("Tất cả");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");
  const [filterRef, setFilterRef] = useState("all");
  const [filterSubCategory, setFilterSubCategory] = useState("all");
  const [filterPublished, setFilterPublished] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Floating Menu 3 chấm
  const [activeMenuData, setActiveMenuData] = useState(null);
  const menuDropdownRef = useRef(null);

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODAL STATES
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [viewingQuizModal, setViewingQuizModal] = useState(null);
  const [flippedCardIdx, setFlippedCardIdx] = useState(null);

  // Autocomplete môn học cho Modal Đăng tải tài liệu
  const [docSubjectSearch, setDocSubjectSearch] = useState("");
  const [showDocSubjectSuggestions, setShowDocSubjectSuggestions] = useState(false);
  const docSearchRef = useRef(null);

  // Autocomplete môn học cho Modal Tạo đề thi độc lập
  const [examSubjectSearch, setExamSubjectSearch] = useState("");
  const [showExamSubjectSuggestions, setShowExamSubjectSuggestions] = useState(false);
  const examSearchRef = useRef(null);

  // ================= FORM 1: ĐĂNG TẢI TÀI LIỆU / VIDEO =================
  const [selectedMajors, setSelectedMajors] = useState([]);
  const [formYear, setFormYear] = useState(1);
  const [formSemester, setFormSemester] = useState(1);
  const [formSubject, setFormSubject] = useState("");
  const [formSubjectCode, setFormSubjectCode] = useState("");
  const [formIsRef, setFormIsRef] = useState(false);
  const [formSubCategory, setFormSubCategory] = useState("lecture_slide");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formAuthor, setFormAuthor] = useState("Ban Đào Tạo");
  const [uploadItems, setUploadItems] = useState([]);
  const [videoInput, setVideoInput] = useState({ title: "", embedUrl: "" });

  // ================= FORM 2: TẠO ĐỀ THI ĐỘC LẬP (2 DẠNG) =================
  const [examType, setExamType] = useState("multiple_choice");
  const [examForm, setExamForm] = useState({
    title: "",
    subjectName: "",
    subjectCode: "",
    facultyMajor: "Hệ Thống Thông Tin",
    academicYear: 1,
    semester: 1,
    durationMinutes: 45,
    passScore: 5,
  });
  const [mcQuestions, setMcQuestions] = useState([
    { questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctOption: "A", explanation: "" },
  ]);
  const [flashcardItems, setFlashcardItems] = useState([
    { frontText: "", backText: "", explanation: "" },
  ]);

  // ================= FORM 3: CHỈNH SỬA THÔNG TIN =================
  const [editFormData, setEditFormData] = useState({
    title: "",
    subject: "",
    subjectCode: "",
    facultyMajors: [],
    year: 1,
    semester: 1,
    isReference: false,
    subCategory: "lecture_slide",
    isPublished: true,
    author: "",
    embedUrl: "",
  });
  const [editReplacementFile, setEditReplacementFile] = useState(null);

  const getHeaders = (isMultipart = false) => {
    const token = localStorage.getItem("admin_token");
    const headers = { "bypass-tunnel-reminder": "true" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (!isMultipart) headers["Content-Type"] = "application/json";
    return headers;
  };

  // Đóng dropdowns khi click ra ngoài hoặc cuộn trang[cite: 3]
  useEffect(() => {
    const handleOutside = (e) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target)) setActiveMenuData(null);
      if (docSearchRef.current && !docSearchRef.current.contains(e.target)) setShowDocSubjectSuggestions(false);
      if (examSearchRef.current && !examSearchRef.current.contains(e.target)) setShowExamSubjectSuggestions(false);
    };
    const handleScroll = () => {
      setActiveMenuData(null);
      setShowDocSubjectSuggestions(false);
      setShowExamSubjectSuggestions(false);
    };

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const fetchMajors = async () => {
    try {
      const res = await fetch(`${API_BASE}/library/majors`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success && d.data && d.data.length > 0) {
        setAllMajors(d.data);
        if (selectedMajors.length === 0) setSelectedMajors([d.data[0]]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCurriculum = async () => {
    try {
      const res = await fetch(`${API_BASE}/library/curriculum-sync-subjects`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success) setCurriculumSubjects(d.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchResources = async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        major: filterMajor,
        year: filterYear,
        semester: filterSemester,
        isReference: filterRef,
        subCategory: filterSubCategory,
        isPublished: filterPublished,
        search: searchTerm,
      }).toString();

      const res = await fetch(`${API_BASE}/library?${query}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) setResources(data.all || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMajors();
    fetchCurriculum();
  }, []);

  useEffect(() => {
    fetchResources();
    setActiveMenuData(null);
  }, [filterMajor, filterYear, filterSemester, filterRef, filterSubCategory, filterPublished]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResources();
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleToggleStatus = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/library/${id}/toggle-status`, {
        method: "PATCH",
        headers: getHeaders(),
      });
      const d = await res.json();
      if (d.success) {
        setResources((prev) =>
          prev.map((r) => (r.id === id ? { ...r, isPublished: d.isPublished } : r))
        );
      }
    } catch (err) {
      console.error(err);
    }
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
    if (spaceBelow < 135) top = rect.top - 135 - 4;

    setActiveMenuData({
      item,
      top,
      right: window.innerWidth - rect.right,
    });
  };

  // --- LOGIC FORM 1: TẢI TÀI LIỆU & VIDEO ---
  const handleMultipleFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newItems = files.map((file) => {
      const sizeMB = file.size / (1024 * 1024);
      const sizeStr = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;
      const ext = file.name.split(".").pop().toUpperCase();
      const rawName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;

      return {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        resourceType: "doc",
        title: rawName.replace(/[-_]/g, " ").trim(),
        fileType: ext,
        fileSize: sizeStr,
        rawFile: file,
      };
    });

    setUploadItems((prev) => [...prev, ...newItems]);
    if (!formSubject.trim() && newItems.length > 0) {
      setFormSubject(newItems[0].title);
      setDocSubjectSearch(newItems[0].title);
    }
    e.target.value = "";
  };

  const handleAddVideoItem = () => {
    if (!videoInput.title.trim() || !videoInput.embedUrl.trim()) {
      alert("Vui lòng nhập tiêu đề và liên kết YouTube!");
      return;
    }

    let formattedUrl = videoInput.embedUrl;
    const matchWatch = formattedUrl.match(/[?&]v=([^&]+)/);
    if (matchWatch) formattedUrl = `https://www.youtube.com/embed/${matchWatch[1]}`;
    const matchShort = formattedUrl.match(/youtu\.be\/([^?&]+)/);
    if (matchShort) formattedUrl = `https://www.youtube.com/embed/${matchShort[1]}`;

    setUploadItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        resourceType: "video",
        title: videoInput.title.trim(),
        embedUrl: formattedUrl,
        fileType: "VIDEO",
        fileSize: "YouTube",
        duration: "Bài giảng",
        rawFile: null,
      },
    ]);
    setVideoInput({ title: "", embedUrl: "" });
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (!formSubject.trim()) {
      alert("Vui lòng nhập hoặc chọn tên môn học!");
      return;
    }
    if (uploadItems.length === 0) {
      alert("Vui lòng chọn ít nhất một file hoặc video bài giảng!");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("facultyMajors", JSON.stringify(selectedMajors));
      formData.append("year", formYear);
      formData.append("semester", formSemester);
      formData.append("subject", formSubject.trim());
      formData.append("subjectCode", formSubjectCode);
      formData.append("isReference", formIsRef);
      formData.append("subCategory", formSubCategory);
      formData.append("isPublished", formIsPublished);
      formData.append("author", formAuthor.trim() || "Ban Đào Tạo");

      const itemsPayload = [];
      uploadItems.forEach((item) => {
        itemsPayload.push({
          resourceType: item.resourceType,
          title: item.title,
          fileType: item.fileType,
          fileSize: item.fileSize,
          embedUrl: item.embedUrl || null,
          duration: item.duration || null,
        });
        if (item.rawFile) formData.append("files", item.rawFile);
      });

      formData.append("items", JSON.stringify(itemsPayload));

      const res = await fetch(`${API_BASE}/library/batch`, {
        method: "POST",
        headers: getHeaders(true),
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        alert(`✅ Đã đăng tải thành công ${result.count} mục học liệu!`);
        setShowAddDocModal(false);
        setUploadItems([]);
        setFormSubject("");
        setDocSubjectSearch("");
        fetchResources();
      } else {
        alert("Lỗi: " + result.error);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  // --- LOGIC FORM 2: TẠO ĐỀ THI ĐỘC LẬP ---
  const handleCreateExamSubmit = async (e) => {
    e.preventDefault();
    if (!examForm.title.trim() || !examForm.subjectName.trim()) {
      alert("Vui lòng nhập tên đề thi và chọn môn học!");
      return;
    }

    const payloadItems = examType === "multiple_choice" ? mcQuestions : flashcardItems;

    for (let i = 0; i < payloadItems.length; i++) {
      const item = payloadItems[i];
      if (examType === "multiple_choice") {
        if (!item.questionText.trim() || !item.optionA.trim() || !item.optionB.trim()) {
          alert(`Câu hỏi ${i + 1} chưa điền nội dung câu hỏi hoặc đáp án A/B!`);
          return;
        }
      } else {
        if (!item.frontText.trim() || !item.backText.trim()) {
          alert(`Thẻ ghi nhớ ${i + 1} chưa điền mặt trước hoặc mặt sau!`);
          return;
        }
      }
    }

    try {
      const res = await fetch(`${API_BASE}/exams/admin/create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          ...examForm,
          examType,
          items: payloadItems,
        }),
      });

      const d = await res.json();
      if (d.success) {
        alert("✅ Tạo bài kiểm tra / bộ thẻ ghi nhớ thành công!");
        setShowCreateExamModal(false);
        fetchResources();
      } else {
        alert("Lỗi: " + d.message);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  // --- LOGIC FORM 3: GỬI CẬP NHẬT CHỈNH SỬA ---
  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    try {
      const formData = new FormData();
      formData.append("title", editFormData.title.trim());
      formData.append("subject", editFormData.subject.trim());
      formData.append("subjectCode", editFormData.subjectCode || "");
      formData.append("facultyMajors", JSON.stringify(editFormData.facultyMajors));
      formData.append("year", editFormData.year);
      formData.append("semester", editFormData.semester);
      formData.append("isReference", editFormData.isReference);
      formData.append("subCategory", editFormData.subCategory);
      formData.append("isPublished", editFormData.isPublished);
      formData.append("author", editFormData.author.trim());

      if (editingItem.resourceType === "video") {
        let formattedUrl = editFormData.embedUrl;
        const matchWatch = formattedUrl.match(/[?&]v=([^&]+)/);
        if (matchWatch) formattedUrl = `https://www.youtube.com/embed/${matchWatch[1]}`;
        const matchShort = formattedUrl.match(/youtu\.be\/([^?&]+)/);
        if (matchShort) formattedUrl = `https://www.youtube.com/embed/${matchShort[1]}`;
        formData.append("embedUrl", formattedUrl);
      }

      if (editReplacementFile) {
        formData.append("file", editReplacementFile);
      }

      const res = await fetch(`${API_BASE}/library/${editingItem.id}`, {
        method: "PUT",
        headers: getHeaders(true),
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        alert("✅ Cập nhật thông tin thành công!");
        setEditingItem(null);
        fetchResources();
      } else {
        alert("Lỗi máy chủ: " + (result.error || "Không thể cập nhật"));
      }
    } catch (err) {
      alert("Lỗi kết nối: " + err.message);
    }
  };

  const toggleEditMajorSelection = (major) => {
    const majors = editFormData.facultyMajors;
    if (majors.includes(major)) {
      if (majors.length > 1) {
        setEditFormData({ ...editFormData, facultyMajors: majors.filter((m) => m !== major) });
      } else {
        alert("Phải chọn ít nhất một ngành học!");
      }
    } else {
      setEditFormData({ ...editFormData, facultyMajors: [...majors, major] });
    }
  };

  const handleViewExamQuestions = async (item) => {
    setActiveMenuData(null);
    setFlippedCardIdx(null);
    const realExamId = String(item.id).replace("exam_", "");
    try {
      const res = await fetch(`${API_BASE}/exams/admin/${realExamId}`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success && d.data) {
        setViewingQuizModal(d.data);
      } else {
        alert("Không tải được chi tiết câu hỏi!");
      }
    } catch (e) {
      alert("Lỗi tải câu hỏi đề thi");
    }
  };

  const handleDelete = async (item) => {
    setActiveMenuData(null);
    if (!window.confirm(`Bạn có chắc muốn xóa "${item.title}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/library/${item.id}`, { method: "DELETE", headers: getHeaders() });
      const result = await res.json();
      if (result.success) fetchResources();
      else alert(result.error);
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.ceil(resources.length / itemsPerPage) || 1;
  const currentItems = resources.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getFullFileUrl = (url) => {
    if (!url || url === "#" || url.startsWith("#exam")) return "#";
    if (url.startsWith("http")) return url;
    return `${API_BASE.replace("/api", "")}${url}`;
  };

  return (
    <div className="d-flex flex-column gap-3 w-100 pb-5">
      {/* 1. Header Toolbar */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 bg-white p-3 rounded-4 shadow-sm border">
        <div className="d-flex align-items-center gap-2.5">
          <div
            className="rounded-3 d-flex align-items-center justify-content-center text-white shadow-sm flex-shrink-0"
            style={{ width: "42px", height: "42px", background: "linear-gradient(135deg, #185bf0 0%, #7c3aed 100%)" }}
          >
            <i className="bi bi-collection-play-fill fs-5"></i>
          </div>
          <div>
            <h6 className="fw-bold text-dark mb-0 fs-6">Quản Lý Học Liệu & Đề Thi Trắc Nghiệm</h6>
            <small className="text-secondary fw-semibold">
              Phân phối giáo trình, video bài giảng, câu hỏi ABCD và thẻ ghi nhớ Flashcard
            </small>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button
            onClick={() => {
              setExamSubjectSearch("");
              setExamType("multiple_choice");
              setExamForm({
                title: "",
                subjectName: "",
                subjectCode: "",
                facultyMajor: allMajors[0] || "Hệ Thống Thông Tin",
                academicYear: 1,
                semester: 1,
                durationMinutes: 45,
                passScore: 5,
              });
              setMcQuestions([{ questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctOption: "A", explanation: "" }]);
              setFlashcardItems([{ frontText: "", backText: "", explanation: "" }]);
              setShowCreateExamModal(true);
            }}
            className="btn btn-sm text-white rounded-pill px-3.5 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-xs border-0"
            style={{ fontSize: "12.5px", background: "linear-gradient(180deg, #7c3aed 0%, #6d28d9 100%)" }}
          >
            <i className="bi bi-patch-question-fill fs-6"></i>
            <span>Tạo Đề Thi / Thẻ Mới</span>
          </button>

          <button
            onClick={() => {
              setUploadItems([]);
              setDocSubjectSearch("");
              setFormSubject("");
              setFormSubjectCode("");
              if (allMajors.length > 0 && selectedMajors.length === 0) setSelectedMajors([allMajors[0]]);
              setShowAddDocModal(true);
            }}
            className="btn btn-sm btn-primary rounded-pill px-3.5 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-xs border-0 text-white"
            style={{ fontSize: "12.5px", background: "linear-gradient(180deg, #185bf0 0%, #1546cd 100%)" }}
          >
            <i className="bi bi-cloud-arrow-up-fill fs-6"></i>
            <span>Đăng Tải Học Liệu</span>
          </button>
        </div>
      </div>

      {/* 2. Thanh lọc dữ liệu */}
      <div className="card border shadow-sm rounded-4 p-3 bg-white">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-3">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted"><i className="bi bi-search"></i></span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tên tài liệu, đề thi, tác giả..."
                className="form-control bg-light border-start-0 fw-semibold"
                style={{ fontSize: "12px" }}
              />
            </div>
          </div>

          <div className="col-6 col-md-2">
            <select
              value={filterMajor}
              onChange={(e) => setFilterMajor(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="Tất cả">Tất cả ngành</option>
              {allMajors.map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-2">
            <select
              value={filterSubCategory}
              onChange={(e) => setFilterSubCategory(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả phân loại</option>
              {Object.entries(SUB_CATEGORIES).map(([key, item]) => (
                <option key={key} value={key}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="col-4 col-md-2">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả năm</option>
              <option value="1">Năm 1</option>
              <option value="2">Năm 2</option>
              <option value="3">Năm 3</option>
              <option value="4">Năm 4</option>
            </select>
          </div>

          <div className="col-4 col-md-1">
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả kỳ</option>
              <option value="1">Kỳ 1</option>
              <option value="2">Kỳ 2</option>
              <option value="3">Kỳ 3</option>
            </select>
          </div>

          <div className="col-4 col-md-2">
            <select
              value={filterPublished}
              onChange={(e) => setFilterPublished(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="true">Đang hiển thị</option>
              <option value="false">Đang ẩn</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Bảng Dữ Liệu */}
      <div className="card border shadow-sm rounded-4 bg-white">
        <div className="table-responsive" style={{ minHeight: "280px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap" style={{ minWidth: "900px" }}>
            <thead className="table-light">
              <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                <th className="ps-3" style={{ minWidth: "260px" }}>Tên học liệu / Đề thi</th>
                <th style={{ minWidth: "160px" }}>Môn học & Mã HP</th>
                <th style={{ minWidth: "130px" }}>Phân loại</th>
                <th className="text-center" style={{ minWidth: "90px" }}>Năm / Kỳ</th>
                <th className="text-center" style={{ minWidth: "90px" }}>Hiển thị</th>
                <th className="text-end pe-4" style={{ width: "70px" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "12.5px" }}>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-5 text-muted">Đang nạp dữ liệu...</td></tr>
              ) : resources.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-5 text-muted">Không tìm thấy tài liệu hoặc đề thi nào.</td></tr>
              ) : (
                currentItems.map((item) => {
                  const isQuiz = item.resourceType === "quiz" || String(item.id).startsWith("exam_");
                  const tagMeta = SUB_CATEGORIES[item.subCategory] || SUB_CATEGORIES.lecture_slide;
                  return (
                    <tr key={item.id}>
                      <td className="ps-3">
                        <div className="d-flex align-items-center gap-2">
                          <div
                            className="rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
                            style={{
                              width: "34px",
                              height: "34px",
                              backgroundColor: isQuiz ? "#f3e8ff" : item.resourceType === "video" ? "#fee2e2" : "#eff6ff",
                              color: isQuiz ? "#7e22ce" : item.resourceType === "video" ? "#dc2626" : "#1d4ed8",
                            }}
                          >
                            <i
                              className={`bi ${
                                isQuiz
                                  ? "bi-patch-question-fill fs-6"
                                  : item.resourceType === "video"
                                  ? "bi-youtube fs-6"
                                  : (item.type || "").toUpperCase() === "PDF"
                                  ? "bi-file-earmark-pdf-fill fs-6"
                                  : (item.type || "").toUpperCase() === "PPTX"
                                  ? "bi-file-earmark-easel-fill fs-6"
                                  : "bi-file-earmark-word-fill fs-6"
                              }`}
                            ></i>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <span className="fw-bold text-dark text-truncate d-block" style={{ maxWidth: "250px" }} title={item.title}>
                              {item.title}
                            </span>
                            <small className="text-muted d-block" style={{ fontSize: "11px" }}>
                              {item.size || item.duration || "Tài liệu"} • {item.author}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="fw-bold text-dark d-block text-truncate" style={{ maxWidth: "150px" }}>
                          {item.subject}
                        </span>
                        {item.curriculumSubjectCode && (
                          <code className="text-primary font-monospace" style={{ fontSize: "10.5px" }}>
                            [{item.curriculumSubjectCode}]
                          </code>
                        )}
                      </td>

                      <td>
                        <span className={`badge rounded-pill border fw-bold ${tagMeta.badge}`} style={{ fontSize: "10px" }}>
                          <i className={`bi ${tagMeta.icon} me-1`}></i>
                          {tagMeta.label}
                        </span>
                      </td>

                      <td className="text-center">
                        <small className="fw-semibold text-secondary">Năm {item.year} • K{item.semester}</small>
                      </td>

                      <td className="text-center">
                        <button
                          onClick={() => handleToggleStatus(item.id)}
                          className={`btn btn-sm rounded-pill px-2.5 py-0.5 fw-bold border-0 ${
                            item.isPublished ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"
                          }`}
                          style={{ fontSize: "11px" }}
                        >
                          {item.isPublished ? "Hiện" : "Ẩn"}
                        </button>
                      </td>

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

        {/* Phân Trang */}
        {!loading && resources.length > 0 && (
          <div className="d-flex flex-wrap justify-content-between align-items-center p-3 border-top bg-white gap-2">
            <div className="d-flex align-items-center gap-2 small text-muted">
              <span>Hiển thị</span>
              <select
                className="form-select form-select-sm py-0.5 rounded-2 fw-semibold text-center"
                style={{ width: "65px" }}
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </select>
              <span>trên tổng số <b>{resources.length}</b> mục</span>
            </div>

            <div className="d-flex align-items-center gap-1 ms-auto">
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
              >
                <i className="bi bi-chevron-double-left small"></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              >
                <i className="bi bi-chevron-left small"></i>
              </button>

              <span className="small fw-bold px-2 text-secondary" style={{ fontSize: "12px" }}>
                {currentPage} / {totalPages}
              </span>

              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              >
                <i className="bi bi-chevron-right small"></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
              >
                <i className="bi bi-chevron-double-right small"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. FLOATING MENU 3 CHẤM */}
      {activeMenuData && (
        <div
          ref={menuDropdownRef}
          className="card border-0 shadow-lg rounded-3 py-1 text-start position-fixed"
          style={{
            width: "170px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            fontSize: "12px",
            zIndex: 99999,
            top: `${activeMenuData.top}px`,
            right: `${activeMenuData.right}px`,
            animation: "fadeInScale 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          {(activeMenuData.item.resourceType === "quiz" || String(activeMenuData.item.id).startsWith("exam_")) ? (
            <button
              type="button"
              onClick={() => handleViewExamQuestions(activeMenuData.item)}
              className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 border-0 bg-transparent"
              style={{ color: "#7e22ce" }}
            >
              <i className="bi bi-card-checklist fs-6"></i>
              <span>Xem bộ câu hỏi</span>
            </button>
          ) : activeMenuData.item.resourceType === "video" && activeMenuData.item.embedUrl ? (
            <a
              href={activeMenuData.item.embedUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setActiveMenuData(null)}
              className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent text-decoration-none"
            >
              <i className="bi bi-youtube text-danger fs-6"></i>
              <span>Mở Video</span>
            </a>
          ) : activeMenuData.item.downloadUrl && !activeMenuData.item.downloadUrl.startsWith("#") ? (
            <a
              href={getFullFileUrl(activeMenuData.item.downloadUrl)}
              download
              onClick={() => setActiveMenuData(null)}
              className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent text-decoration-none"
            >
              <i className="bi bi-download text-success fs-6"></i>
              <span>Tải file về</span>
            </a>
          ) : null}

          {/* Nút Chỉnh sửa: Áp dụng cho cả Tài liệu lẫn Đề thi */}
          <button
            type="button"
            onClick={() => {
              const item = activeMenuData.item;
              setActiveMenuData(null);
              setEditingItem(item);
              setEditFormData({
                title: item.title || "",
                subject: item.subject || "",
                subjectCode: item.curriculumSubjectCode || "",
                facultyMajors: Array.isArray(item.facultyMajors) ? item.facultyMajors : (allMajors.length > 0 ? [allMajors[0]] : ["Hệ Thống Thông Tin"]),
                year: item.year || 1,
                semester: item.semester || 1,
                isReference: !!item.isReference,
                subCategory: item.subCategory || "lecture_slide",
                isPublished: item.isPublished !== false,
                author: item.author || "Ban Đào Tạo",
                embedUrl: item.embedUrl || "",
              });
              setEditReplacementFile(null);
            }}
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
            <span>Xóa mục này</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL TẠO ĐỀ THI & THẺ GHI NHỚ ĐỘC LẬP (TRẮC NGHIỆM ABCD / FLASHCARD) */}
      {/* ========================================================================= */}
      {showCreateExamModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.6)", zIndex: 1065 }}>
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3 bg-white">
                <div>
                  <h6 className="modal-title fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-patch-question-fill text-purple" style={{ color: "#7c3aed" }}></i> Soạn Thảo Đề Thi & Ôn Tập
                  </h6>
                  <small className="text-secondary fw-semibold">
                    Đồng bộ Khung CTĐT • Hỗ trợ Trắc nghiệm 4 đáp án và Bộ thẻ ghi nhớ Flashcard
                  </small>
                </div>
                <button type="button" onClick={() => setShowCreateExamModal(false)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4 bg-light">
                <form onSubmit={handleCreateExamSubmit} className="d-flex flex-column gap-3">
                  {/* BƯỚC 1: CHỌN MÔN HỌC BẰNG AUTOCOMPLETE */}
                  <div className="p-3 bg-white rounded-3 border shadow-2xs position-relative" ref={examSearchRef}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold text-uppercase text-secondary mb-0" style={{ fontSize: "10px" }}>
                        1. Chọn môn học áp dụng (Gõ để tìm kiếm & gợi ý tự động) *
                      </label>
                      {examForm.subjectCode && (
                        <span className="badge bg-purple-subtle text-purple border font-monospace" style={{ fontSize: "10px", color: "#7c3aed" }}>
                          Mã HP: {examForm.subjectCode}
                        </span>
                      )}
                    </div>

                    <div className="position-relative">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-light border-end-0 text-muted"><i className="bi bi-search"></i></span>
                        <input
                          type="text"
                          required
                          placeholder="Gõ mã hoặc tên môn học từ Khung CTĐT..."
                          value={examSubjectSearch}
                          onFocus={() => setShowExamSubjectSuggestions(true)}
                          onChange={(e) => {
                            setExamSubjectSearch(e.target.value);
                            setExamForm({ ...examForm, subjectName: e.target.value });
                            setShowExamSubjectSuggestions(true);
                          }}
                          className="form-control form-control-sm bg-light border-start-0 fw-bold text-primary shadow-none"
                        />
                      </div>

                      {showExamSubjectSuggestions && (
                        <div
                          className="position-absolute start-0 end-0 bg-white border rounded-3 shadow-lg mt-1 p-1"
                          style={{ maxHeight: "200px", overflowY: "auto", zIndex: 1080 }}
                        >
                          {curriculumSubjects
                            .filter((s) => {
                              if (!examSubjectSearch.trim()) return true;
                              const q = examSubjectSearch.toLowerCase();
                              return s.subjectName?.toLowerCase().includes(q) || s.subjectCode?.toLowerCase().includes(q);
                            })
                            .map((s, idx) => (
                              <div
                                key={idx}
                                onClick={() => {
                                  setExamForm({
                                    ...examForm,
                                    subjectName: s.subjectName,
                                    subjectCode: s.subjectCode || "",
                                    facultyMajor: s.majorName || examForm.facultyMajor,
                                    academicYear: s.semesterIndex ? Math.ceil(Number(s.semesterIndex) / 3) : 1,
                                    semester: s.semesterIndex ? ((Number(s.semesterIndex) - 1) % 3) + 1 : 1,
                                  });
                                  setExamSubjectSearch(s.subjectName);
                                  setShowExamSubjectSuggestions(false);
                                }}
                                className="p-2 rounded-2 d-flex justify-content-between align-items-center cursor-pointer hover-bg-light transition"
                                style={{ cursor: "pointer" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                              >
                                <div>
                                  <b className="text-primary font-monospace me-1.5">[{s.subjectCode}]</b>
                                  <span className="fw-semibold text-dark">{s.subjectName}</span>
                                </div>
                                <span className="badge bg-light text-secondary border">{s.credits} TC</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BƯỚC 2: CHỌN ĐỊNH DẠNG */}
                  <div className="p-3 bg-white rounded-3 border shadow-2xs">
                    <label className="form-label small fw-bold text-uppercase text-secondary mb-2" style={{ fontSize: "10px" }}>
                      2. Chọn định dạng bài kiểm tra *
                    </label>
                    <div className="row g-2">
                      <div className="col-12 col-md-6">
                        <div
                          onClick={() => setExamType("multiple_choice")}
                          className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center gap-3 transition ${
                            examType === "multiple_choice" ? "border-primary bg-primary-subtle shadow-xs" : "bg-light"
                          }`}
                          style={{ cursor: "pointer" }}
                        >
                          <i className={`bi bi-ui-checks fs-3 ${examType === "multiple_choice" ? "text-primary" : "text-secondary"}`}></i>
                          <div>
                            <b className="d-block text-dark" style={{ fontSize: "13px" }}>Dạng 1: Trắc nghiệm 4 đáp án (A - B - C - D)</b>
                            <small className="text-muted">Chọn 1 phương án chính xác, có tính điểm và giới hạn thời gian.</small>
                          </div>
                        </div>
                      </div>

                      <div className="col-12 col-md-6">
                        <div
                          onClick={() => setExamType("flashcard")}
                          className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center gap-3 transition ${
                            examType === "flashcard" ? "border-warning bg-warning-subtle shadow-xs" : "bg-light"
                          }`}
                          style={{ cursor: "pointer" }}
                        >
                          <i className={`bi bi-card-text fs-3 ${examType === "flashcard" ? "text-amber-800" : "text-secondary"}`}></i>
                          <div>
                            <b className="d-block text-dark" style={{ fontSize: "13px" }}>Dạng 2: Bộ thẻ ghi nhớ lật mặt (Flashcard)</b>
                            <small className="text-muted">Mặt trước là câu hỏi/thuật ngữ, mặt sau là lời giải thích chi tiết.</small>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="row g-2 mt-3 pt-3 border-top">
                      <div className="col-12 col-md-6">
                        <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>
                          Tiêu Đề Bài Kiểm Tra / Bộ Thẻ *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: Trắc nghiệm Ôn tập Giữa kỳ / Bộ thẻ Thuật ngữ..."
                          value={examForm.title}
                          onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                          className="form-control form-control-sm rounded-3 fw-bold shadow-none"
                        />
                      </div>

                      {examType === "multiple_choice" ? (
                        <>
                          <div className="col-6 col-md-3">
                            <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Thời Gian (Phút)</label>
                            <input
                              type="number" min="5" max="180"
                              value={examForm.durationMinutes}
                              onChange={(e) => setExamForm({ ...examForm, durationMinutes: Number(e.target.value) })}
                              className="form-control form-control-sm text-center fw-bold shadow-none"
                            />
                          </div>
                          <div className="col-6 col-md-3">
                            <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Điểm Đạt (/10)</label>
                            <input
                              type="number" min="1" max="10"
                              value={examForm.passScore}
                              onChange={(e) => setExamForm({ ...examForm, passScore: Number(e.target.value) })}
                              className="form-control form-control-sm text-center fw-bold shadow-none"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="col-12 col-md-6 d-flex align-items-center">
                          <span className="badge bg-light text-secondary border px-3 py-2 w-100 text-center">
                            Chế độ Flashcard cho phép sinh viên tự do lật thẻ ôn tập, không bị áp lực thời gian
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BƯỚC 3: SOẠN CÂU HỎI */}
                  <div className="d-flex justify-content-between align-items-center pt-2">
                    <h6 className="fw-bold text-dark mb-0">
                      {examType === "multiple_choice"
                        ? `3. Danh sách câu hỏi (${mcQuestions.length} câu)`
                        : `3. Danh sách thẻ ghi nhớ (${flashcardItems.length} thẻ)`}
                    </h6>
                    <button
                      type="button"
                      onClick={() => {
                        if (examType === "multiple_choice") {
                          setMcQuestions([...mcQuestions, { questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctOption: "A", explanation: "" }]);
                        } else {
                          setFlashcardItems([...flashcardItems, { frontText: "", backText: "", explanation: "" }]);
                        }
                      }}
                      className="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold"
                      style={{ fontSize: "11.5px" }}
                    >
                      <i className="bi bi-plus-lg me-1"></i> {examType === "multiple_choice" ? "Thêm câu hỏi" : "Thêm thẻ mới"}
                    </button>
                  </div>

                  {examType === "multiple_choice" && (
                    <div className="d-flex flex-column gap-2.5">
                      {mcQuestions.map((q, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-3 border shadow-2xs">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="badge bg-primary text-white rounded-pill px-2.5 py-1">Câu {idx + 1}</span>
                            {mcQuestions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setMcQuestions(mcQuestions.filter((_, i) => i !== idx))}
                                className="btn btn-sm btn-link text-danger p-0 text-decoration-none"
                              >
                                Xóa câu này
                              </button>
                            )}
                          </div>
                          <textarea
                            rows="2"
                            required
                            placeholder="Nhập nội dung câu hỏi trắc nghiệm..."
                            value={q.questionText}
                            onChange={(e) => {
                              const arr = [...mcQuestions];
                              arr[idx].questionText = e.target.value;
                              setMcQuestions(arr);
                            }}
                            className="form-control form-control-sm fw-semibold mb-2 shadow-none"
                          />
                          <div className="row g-2 mb-2">
                            {["A", "B", "C", "D"].map((opt) => (
                              <div key={opt} className="col-12 col-md-6">
                                <div className="input-group input-group-sm">
                                  <span className="input-group-text fw-bold bg-light" style={{ width: "36px" }}>{opt}</span>
                                  <input
                                    type="text"
                                    required
                                    placeholder={`Đáp án ${opt}...`}
                                    value={q[`option${opt}`]}
                                    onChange={(e) => {
                                      const arr = [...mcQuestions];
                                      arr[idx][`option${opt}`] = e.target.value;
                                      setMcQuestions(arr);
                                    }}
                                    className="form-control shadow-none"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="row g-2 pt-2 border-top">
                            <div className="col-12 col-md-3">
                              <label className="form-label small fw-bold text-success text-uppercase mb-1" style={{ fontSize: "10px" }}>Đáp án đúng *</label>
                              <select
                                value={q.correctOption}
                                onChange={(e) => {
                                  const arr = [...mcQuestions];
                                  arr[idx].correctOption = e.target.value;
                                  setMcQuestions(arr);
                                }}
                                className="form-select form-select-sm fw-bold border-success text-success shadow-none"
                              >
                                <option value="A">Đáp án A</option>
                                <option value="B">Đáp án B</option>
                                <option value="C">Đáp án C</option>
                                <option value="D">Đáp án D</option>
                              </select>
                            </div>
                            <div className="col-12 col-md-9">
                              <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Giải thích chi tiết (Tùy chọn)</label>
                              <input
                                type="text"
                                placeholder="Giải thích lý do vì sao đáp án này đúng..."
                                value={q.explanation}
                                onChange={(e) => {
                                  const arr = [...mcQuestions];
                                  arr[idx].explanation = e.target.value;
                                  setMcQuestions(arr);
                                }}
                                className="form-control form-control-sm shadow-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {examType === "flashcard" && (
                    <div className="d-flex flex-column gap-2.5">
                      {flashcardItems.map((card, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-3 border shadow-2xs">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="badge bg-warning text-dark rounded-pill px-2.5 py-1">Thẻ #{idx + 1}</span>
                            {flashcardItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setFlashcardItems(flashcardItems.filter((_, i) => i !== idx))}
                                className="btn btn-sm btn-link text-danger p-0 text-decoration-none"
                              >
                                Xóa thẻ này
                              </button>
                            )}
                          </div>
                          <div className="row g-2">
                            <div className="col-12 col-md-6">
                              <label className="form-label small fw-bold text-primary text-uppercase mb-1" style={{ fontSize: "10px" }}>
                                Mặt trước (Thuật ngữ / Câu hỏi gợi nhớ) *
                              </label>
                              <textarea
                                rows="3"
                                required
                                placeholder="Nhập từ khóa hoặc câu hỏi cần ghi nhớ..."
                                value={card.frontText}
                                onChange={(e) => {
                                  const arr = [...flashcardItems];
                                  arr[idx].frontText = e.target.value;
                                  setFlashcardItems(arr);
                                }}
                                className="form-control form-control-sm fw-semibold shadow-none border-primary-subtle"
                              />
                            </div>
                            <div className="col-12 col-md-6">
                              <label className="form-label small fw-bold text-success text-uppercase mb-1" style={{ fontSize: "10px" }}>
                                Mặt sau (Định nghĩa / Lời giải chi tiết) *
                              </label>
                              <textarea
                                rows="3"
                                required
                                placeholder="Nhập nội dung giải đáp hiển thị khi lật thẻ..."
                                value={card.backText}
                                onChange={(e) => {
                                  const arr = [...flashcardItems];
                                  arr[idx].backText = e.target.value;
                                  setFlashcardItems(arr);
                                }}
                                className="form-control form-control-sm fw-semibold shadow-none border-success-subtle"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="modal-footer px-0 pb-0 border-top pt-3 d-flex justify-content-end gap-2 bg-transparent">
                    <button type="button" onClick={() => setShowCreateExamModal(false)} className="btn btn-light rounded-pill px-3.5 py-1.5 fw-semibold border small">
                      Hủy bỏ
                    </button>
                    <button type="submit" className="btn btn-primary rounded-pill px-4 py-1.5 fw-bold shadow-xs border-0 text-white small" style={{ background: "#7c3aed" }}>
                      Hoàn Tất & Lưu Đề
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL ĐĂNG TẢI HỌC LIỆU TÀI LIỆU / VIDEO */}
      {/* ========================================================================= */}
      {showAddDocModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3">
                <div>
                  <h6 className="modal-title fw-bold text-dark mb-0">Đăng Tải Học Liệu Mới</h6>
                  <small className="text-secondary fw-semibold">Phân phối tài liệu, giáo trình và bài giảng video cho sinh viên</small>
                </div>
                <button type="button" onClick={() => setShowAddDocModal(false)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4">
                <form onSubmit={handleBatchSubmit} className="d-flex flex-column gap-3">
                  <div className="p-3 bg-light rounded-3 border position-relative" ref={docSearchRef}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold text-uppercase text-secondary mb-0" style={{ fontSize: "10px" }}>
                        Môn học áp dụng (Gõ để tìm kiếm & gợi ý) *
                      </label>
                      {formSubjectCode && (
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace" style={{ fontSize: "10px" }}>
                          Mã HP: {formSubjectCode}
                        </span>
                      )}
                    </div>

                    <div className="position-relative">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-white border-end-0 text-muted"><i className="bi bi-search"></i></span>
                        <input
                          type="text"
                          required
                          placeholder="Gõ mã hoặc tên môn học từ Khung CTĐT..."
                          value={docSubjectSearch}
                          onFocus={() => setShowDocSubjectSuggestions(true)}
                          onChange={(e) => {
                            setDocSubjectSearch(e.target.value);
                            setFormSubject(e.target.value);
                            setShowDocSubjectSuggestions(true);
                          }}
                          className="form-control form-control-sm bg-white border-start-0 fw-bold text-primary shadow-none"
                        />
                      </div>

                      {showDocSubjectSuggestions && (
                        <div
                          className="position-absolute start-0 end-0 bg-white border rounded-3 shadow-lg mt-1 p-1"
                          style={{ maxHeight: "200px", overflowY: "auto", zIndex: 1080 }}
                        >
                          {curriculumSubjects
                            .filter((s) => {
                              if (!docSubjectSearch.trim()) return true;
                              const q = docSubjectSearch.toLowerCase();
                              return s.subjectName?.toLowerCase().includes(q) || s.subjectCode?.toLowerCase().includes(q);
                            })
                            .map((s, idx) => (
                              <div
                                key={idx}
                                onClick={() => {
                                  setFormSubject(s.subjectName);
                                  setDocSubjectSearch(s.subjectName);
                                  setFormSubjectCode(s.subjectCode || "");
                                  setShowDocSubjectSuggestions(false);
                                  if (s.majorName && allMajors.includes(s.majorName)) setSelectedMajors([s.majorName]);
                                  if (s.semesterIndex) {
                                    const sem = Number(s.semesterIndex);
                                    setFormYear(Math.ceil(sem / 3));
                                    setFormSemester(((sem - 1) % 3) + 1);
                                  }
                                }}
                                className="p-2 rounded-2 d-flex justify-content-between align-items-center cursor-pointer hover-bg-light transition"
                                style={{ cursor: "pointer" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                              >
                                <div>
                                  <b className="text-primary font-monospace me-1.5">[{s.subjectCode}]</b>
                                  <span className="fw-semibold text-dark">{s.subjectName}</span>
                                </div>
                                <span className="badge bg-light text-secondary border">{s.credits} TC</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>
                        Nhãn Phân Loại Nội Dung *
                      </label>
                      <select
                        value={formSubCategory}
                        onChange={(e) => setFormSubCategory(e.target.value)}
                        className="form-select form-select-sm rounded-3 fw-semibold shadow-none"
                      >
                        {Object.entries(SUB_CATEGORIES).map(([key, item]) => (
                          <option key={key} value={key}>{item.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>
                        Trạng Thái Hiển Thị
                      </label>
                      <select
                        value={formIsPublished}
                        onChange={(e) => setFormIsPublished(e.target.value === "true")}
                        className="form-select form-select-sm rounded-3 fw-semibold shadow-none"
                      >
                        <option value="true">Hiển thị ngay</option>
                        <option value="false">Tạm ẩn</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 bg-light rounded-4 border border-dashed border-primary">
                    <label className="form-label small fw-bold text-primary mb-1 d-flex align-items-center gap-1.5">
                      <i className="bi bi-files fs-5"></i> Chọn file tài liệu (PDF, Word, Slide, Excel):
                    </label>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.zip,.rar,.pptx,.xlsx"
                      onChange={handleMultipleFilesChange}
                      className="form-control form-control-sm bg-white rounded-3 shadow-none"
                    />
                  </div>

                  <div className="p-3 bg-light rounded-4 border">
                    <label className="form-label small fw-bold text-dark mb-1 d-flex align-items-center gap-1">
                      <i className="bi bi-youtube text-danger fs-5"></i> Thêm video bài giảng YouTube:
                    </label>
                    <div className="row g-2">
                      <div className="col-12 col-md-5">
                        <input
                          type="text"
                          placeholder="Tiêu đề video..."
                          value={videoInput.title}
                          onChange={(e) => setVideoInput({ ...videoInput, title: e.target.value })}
                          className="form-control form-control-sm rounded-3 shadow-none"
                        />
                      </div>
                      <div className="col-12 col-md-5">
                        <input
                          type="text"
                          placeholder="Link YouTube..."
                          value={videoInput.embedUrl}
                          onChange={(e) => setVideoInput({ ...videoInput, embedUrl: e.target.value })}
                          className="form-control form-control-sm rounded-3 shadow-none"
                        />
                      </div>
                      <div className="col-12 col-md-2">
                        <button
                          type="button"
                          onClick={handleAddVideoItem}
                          className="btn btn-dark btn-sm w-100 fw-bold rounded-3 shadow-xs"
                        >
                          + Thêm
                        </button>
                      </div>
                    </div>
                  </div>

                  {uploadItems.length > 0 && (
                    <div className="d-flex flex-column gap-1 p-2 bg-light rounded-3 border" style={{ maxHeight: "140px", overflowY: "auto" }}>
                      {uploadItems.map((item) => (
                        <div key={item.id} className="d-flex align-items-center justify-content-between bg-white p-2 rounded-2 border shadow-2xs">
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-primary" style={{ fontSize: "9px" }}>{item.fileType}</span>
                            <span className="fw-bold text-dark small">{item.title}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setUploadItems(uploadItems.filter((i) => i.id !== item.id))}
                            className="btn btn-sm btn-link text-danger p-0"
                          >
                            <i className="bi bi-x-circle-fill"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="modal-footer px-0 pb-0 border-top pt-3 d-flex justify-content-end gap-2">
                    <button type="button" onClick={() => setShowAddDocModal(false)} className="btn btn-light rounded-pill px-3.5 py-1.5 small border">
                      Hủy bỏ
                    </button>
                    <button type="submit" className="btn btn-primary rounded-pill px-4 py-1.5 small fw-bold border-0 text-white" style={{ background: "#185bf0" }}>
                      Lưu Học Liệu ({uploadItems.length})
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL CHỈNH SỬA THÔNG TIN (HỖ TRỢ CẢ TÀI LIỆU VÀ ĐỀ THI) */}
      {/* ========================================================================= */}
      {editingItem && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-md modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3">
                <div>
                  <h6 className="modal-title fw-bold text-dark mb-0">
                    {String(editingItem.id).startsWith("exam_") || editingItem.resourceType === "quiz"
                      ? "Cập Nhật Thông Tin Đề Thi / Thẻ"
                      : "Cập Nhật Thông Tin Học Liệu"}
                  </h6>
                  <small className="text-secondary fw-semibold">Thay đổi thông tin môn học hoặc trạng thái hiển thị</small>
                </div>
                <button type="button" onClick={() => setEditingItem(null)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4">
                <form onSubmit={handleUpdateSubmit} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>
                      Tiêu đề học liệu / Đề thi *
                    </label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                      className="form-control form-control-sm fw-bold rounded-3 shadow-none"
                      required
                    />
                  </div>

                  <div className="row g-2">
                    <div className="col-8">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Tên môn học *</label>
                      <input
                        type="text"
                        value={editFormData.subject}
                        onChange={(e) => setEditFormData({ ...editFormData, subject: e.target.value })}
                        className="form-control form-control-sm fw-bold rounded-3 shadow-none"
                        required
                      />
                    </div>
                    <div className="col-4">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Mã HP</label>
                      <input
                        type="text"
                        value={editFormData.subjectCode}
                        onChange={(e) => setEditFormData({ ...editFormData, subjectCode: e.target.value })}
                        className="form-control form-control-sm font-monospace shadow-none text-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label small fw-bold text-secondary text-uppercase mb-1.5" style={{ fontSize: "10px" }}>Ngành học áp dụng:</label>
                    <div className="d-flex flex-wrap gap-1.5">
                      {allMajors.map((major, idx) => {
                        const isChecked = editFormData.facultyMajors.includes(major);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleEditMajorSelection(major)}
                            className={`btn btn-sm rounded-pill px-3 py-1 fw-bold transition ${
                              isChecked
                                ? "btn-primary shadow-xs border-primary text-white"
                                : "btn-light text-secondary border bg-white"
                            }`}
                            style={{ fontSize: "11px", background: isChecked ? "#185bf0" : "#ffffff" }}
                          >
                            <i className={`bi ${isChecked ? "bi-check-circle-fill" : "bi-circle"} me-1`}></i>
                            {major}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Nhãn nội dung</label>
                      <select
                        value={editFormData.subCategory}
                        onChange={(e) => setEditFormData({ ...editFormData, subCategory: e.target.value })}
                        className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                      >
                        {Object.entries(SUB_CATEGORIES).map(([key, item]) => (
                          <option key={key} value={key}>{item.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Hiển thị</label>
                      <select
                        value={editFormData.isPublished}
                        onChange={(e) => setEditFormData({ ...editFormData, isPublished: e.target.value === "true" })}
                        className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                      >
                        <option value="true">Hiển thị</option>
                        <option value="false">Tạm ẩn</option>
                      </select>
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-4">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Năm học</label>
                      <select value={editFormData.year} onChange={(e) => setEditFormData({ ...editFormData, year: Number(e.target.value) })} className="form-select form-select-sm rounded-3 shadow-none">
                        <option value="1">Năm 1</option>
                        <option value="2">Năm 2</option>
                        <option value="3">Năm 3</option>
                        <option value="4">Năm 4</option>
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Học kỳ</label>
                      <select value={editFormData.semester} onChange={(e) => setEditFormData({ ...editFormData, semester: Number(e.target.value) })} className="form-select form-select-sm rounded-3 shadow-none">
                        <option value="1">Kỳ 1</option>
                        <option value="2">Kỳ 2</option>
                        <option value="3">Kỳ 3</option>
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Phân loại</label>
                      <select value={editFormData.isReference} onChange={(e) => setEditFormData({ ...editFormData, isReference: e.target.value === "true" })} className="form-select form-select-sm rounded-3 shadow-none">
                        <option value="false">Chính khóa</option>
                        <option value="true">Tham khảo</option>
                      </select>
                    </div>
                  </div>

                  {/* Phân biệt: Nếu là đề thi thì hiển thị chú thích thay vì trường file */}
                  {String(editingItem.id).startsWith("exam_") || editingItem.resourceType === "quiz" ? (
                    <div className="p-2.5 bg-light rounded-3 border">
                      <small className="text-muted d-block" style={{ fontSize: "11.5px" }}>
                        <i className="bi bi-info-circle me-1 text-primary"></i>
                        Đây là bài thi trắc nghiệm / flashcard. Bạn có thể cập nhật tiêu đề, môn học và phân loại tại đây. Để xem nội dung chi tiết từng câu, hãy sử dụng <b>"Xem bộ câu hỏi"</b> ở menu 3 chấm.
                      </small>
                    </div>
                  ) : editingItem.resourceType === "video" ? (
                    <div>
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Link Video YouTube:</label>
                      <input
                        type="text"
                        value={editFormData.embedUrl}
                        onChange={(e) => setEditFormData({ ...editFormData, embedUrl: e.target.value })}
                        className="form-control form-control-sm rounded-3 shadow-none"
                      />
                    </div>
                  ) : (
                    <div className="p-3 bg-light rounded-3 border">
                      <label className="form-label small fw-bold text-primary mb-1">Thay thế tệp tin (Tùy chọn):</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.pptx,.xlsx"
                        onChange={(e) => setEditReplacementFile(e.target.files[0] || null)}
                        className="form-control form-control-sm bg-white rounded-3 shadow-none"
                      />
                    </div>
                  )}

                  <div>
                    <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Giảng viên / Tác giả</label>
                    <input
                      type="text"
                      value={editFormData.author}
                      onChange={(e) => setEditFormData({ ...editFormData, author: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none"
                    />
                  </div>

                  <div className="modal-footer px-0 pb-0 border-top pt-3 d-flex justify-content-end gap-2">
                    <button type="button" onClick={() => setEditingItem(null)} className="btn btn-light rounded-pill px-3.5 py-1.5 fw-semibold border small">
                      Đóng
                    </button>
                    <button type="submit" className="btn btn-primary rounded-pill px-4 py-1.5 fw-bold shadow-xs border-0 text-white small" style={{ background: "#185bf0" }}>
                      Lưu Thay Đổi
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL XEM CHI TIẾT ĐỀ THI: TRẮC NGHIỆM ABCD HOẶC LẬT THẺ FLASHCARD */}
      {/* ========================================================================= */}
      {viewingQuizModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", zIndex: 1075 }}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3 bg-white">
                <div>
                  <h6 className="modal-title fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className={`bi ${viewingQuizModal.exam_type === "flashcard" ? "bi-card-text text-warning" : "bi-patch-question-fill text-primary"}`}></i>
                    {viewingQuizModal.title}
                  </h6>
                  <small className="text-secondary fw-semibold">
                    Môn: <b>{viewingQuizModal.subject_name}</b> • Tổng số: <b>{viewingQuizModal.questions?.length || 0} {viewingQuizModal.exam_type === "flashcard" ? "thẻ" : "câu"}</b>
                  </small>
                </div>
                <button type="button" onClick={() => setViewingQuizModal(null)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4 bg-light">
                {viewingQuizModal.exam_type === "flashcard" ? (
                  <div className="row g-3">
                    {viewingQuizModal.questions.map((card, idx) => {
                      const isFlipped = flippedCardIdx === idx;
                      return (
                        <div key={idx} className="col-12 col-md-6">
                          <div
                            onClick={() => setFlippedCardIdx(isFlipped ? null : idx)}
                            className="p-3 rounded-4 bg-white border shadow-2xs text-center cursor-pointer transition position-relative d-flex flex-column justify-content-center"
                            style={{
                              minHeight: "180px",
                              cursor: "pointer",
                              borderLeft: isFlipped ? "4px solid #16a34a" : "4px solid #7c3aed",
                            }}
                          >
                            <span className="badge rounded-pill bg-light text-secondary border position-absolute top-0 start-0 m-2.5 font-monospace">
                              Thẻ {idx + 1} ({isFlipped ? "Mặt Sau" : "Mặt Trước"})
                            </span>
                            <div className="py-2">
                              {isFlipped ? (
                                <p className="fw-bold text-success mb-0" style={{ fontSize: "13.5px" }}>
                                  {card.backText || card.explanation}
                                </p>
                              ) : (
                                <p className="fw-bold text-dark mb-0" style={{ fontSize: "14px" }}>
                                  {card.frontText || card.questionText}
                                </p>
                              )}
                            </div>
                            <small className="text-muted d-block mt-auto" style={{ fontSize: "10.5px" }}>
                              <i className="bi bi-arrow-repeat me-1"></i> Bấm để {isFlipped ? "xem câu hỏi" : "lật xem đáp án"}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {viewingQuizModal.questions.map((q, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-3 border shadow-2xs">
                        <h6 className="fw-bold text-dark mb-2.5" style={{ fontSize: "13px" }}>
                          Câu {idx + 1}: {q.questionText}
                        </h6>
                        <div className="row g-2 mb-2">
                          {["A", "B", "C", "D"].map((opt) => {
                            const isCorrect = q.correctOption === opt;
                            return (
                              <div key={opt} className="col-12 col-md-6">
                                <div
                                  className={`p-2 rounded-2 border small d-flex align-items-center gap-2 ${
                                    isCorrect ? "bg-success-subtle border-success text-success fw-bold" : "bg-light text-dark"
                                  }`}
                                >
                                  <span className={`badge ${isCorrect ? "bg-success text-white" : "bg-secondary text-white"}`}>{opt}</span>
                                  <span>{q[`option${opt}`]}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {q.explanation && (
                          <div className="p-2 rounded-2 bg-light border-start border-3 border-info mt-2">
                            <small className="text-secondary"><b>Giải thích:</b> {q.explanation}</small>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-footer px-4 py-2.5 border-top bg-white">
                <button type="button" onClick={() => setViewingQuizModal(null)} className="btn btn-secondary rounded-pill px-4 btn-sm fw-semibold">
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Animation cho dropdown */}
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default ManageLibrary;