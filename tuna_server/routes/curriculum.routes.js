// routes/curriculum.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

// =============================================================================
// 1. ROUTE LẤY DANH MỤC NGÀNH, KHÓA, LỚP (METADATA DÙNG CHO BỘ LỌC)
// =============================================================================
// =============================================================================
// 1. ROUTE LẤY DANH MỤC NGÀNH, KHÓA, LỚP ĐỘNG 100% TỪ CƠ SỞ DỮ LIỆU
// =============================================================================
router.get('/meta-options', async (req, res) => {
  try {
    const [majorsRes, cohortsRes, classesRes] = await Promise.all([
      // Lấy danh sách ngành thực tế đã có trong CSDL
      pool.query(`
        SELECT DISTINCT major_name 
        FROM faculty_majors 
        WHERE major_name IS NOT NULL AND major_name <> ''
        ORDER BY major_name ASC
      `).catch(() => ({ rows: [] })),

      // Lấy danh sách khóa thực tế từ bảng cấu hình hoặc bảng kế hoạch
      pool.query(`
        SELECT DISTINCT cohort_code 
        FROM academic_cohorts 
        WHERE cohort_code IS NOT NULL AND cohort_code <> ''
        ORDER BY cohort_code DESC
      `).catch(() => ({ rows: [] })),

      // Lấy toàn bộ danh sách lớp thực tế đã nạp từ các file Excel vào curriculum_plans
      pool.query(`
        SELECT DISTINCT class_name 
        FROM curriculum_plans 
        WHERE class_name IS NOT NULL AND class_name <> '' 
        ORDER BY class_name ASC
      `).catch(() => ({ rows: [] }))
    ]);

    // Trích xuất danh sách mảng chuỗi động
    const majors = majorsRes.rows.map(r => r.major_name);
    const cohorts = cohortsRes.rows.map(r => r.cohort_code);
    const classes = classesRes.rows.map(r => r.class_name);

    res.json({
      success: true,
      data: {
        majors,
        cohorts,
        classes // Trả về chính xác các lớp có trong CSDL (ví dụ: HTTT2311, HTTT2511,...), nếu chưa có lớp nào thì trả về []
      }
    });
  } catch (error) {
    console.error("Lỗi truy vấn meta-options:", error.message);
    // Khi có lỗi xảy ra, trả về mảng rỗng chứ không gán cứng bất kỳ lớp nào
    res.status(500).json({
      success: false,
      message: error.message,
      data: {
        majors: [],
        cohorts: [],
        classes: []
      }
    });
  }
});

// =============================================================================
// 2. ROUTE LẤY DANH SÁCH HỌC PHẦN (QUY ĐỔI NĂM + KỲ SANG SEMESTER_INDEX)
// =============================================================================
router.get('/', async (req, res) => {
  try {
    const { className, major, cohort, semester, year } = req.query;
    let query = `SELECT * FROM curriculum_plans WHERE 1=1`;
    const params = [];

    // Ưu tiên lọc theo lớp cụ thể
    if (className && className !== 'all') {
      params.push(className.trim());
      query += ` AND class_name = $${params.length}`;
    } else if (major && major !== 'all') {
      params.push(`%${major.trim()}%`);
      query += ` AND major_name ILIKE $${params.length}`;
    }

    // Nhận diện linh hoạt Khóa: K23, 23, K25, 2025...
    if (cohort && cohort !== 'all') {
      const cleanCohort = cohort.replace(/[^0-9]/g, '');
      params.push(`%${cleanCohort}%`);
      query += ` AND (cohort ILIKE $${params.length} OR cohort ILIKE '20' || $${params.length} OR cohort IS NULL)`;
    }

    // TÍNH TOÁN SEMESTER_INDEX:
    // Nếu truyền cả year và semester (mô hình 3 HK/năm):
    // Năm 1, Kỳ 1 -> index 1 | Năm 4, Kỳ 1 -> index (4-1)*3 + 1 = 10
    let targetSemIndex = null;
    if (year && semester && semester !== 'all') {
      const y = parseInt(year);
      const s = parseInt(semester);
      if (!isNaN(y) && !isNaN(s)) {
        targetSemIndex = (y - 1) * 3 + s;
      }
    } else if (semester && semester !== 'all') {
      targetSemIndex = parseInt(semester);
    }

    if (targetSemIndex !== null && !isNaN(targetSemIndex)) {
      params.push(targetSemIndex);
      query += ` AND semester_index = $${params.length}`;
    }

    query += ` ORDER BY semester_index ASC, id ASC`;
    let result = await pool.query(query, params);

    // Fallback thông minh: Nếu kỳ cụ thể chưa có môn (ví dụ K23 kỳ 10 chưa nhập excel),
    // lấy danh sách môn học của chính chuyên ngành đó để sinh viên vẫn có môn ôn tập
    if (result.rows.length === 0 && major && major !== 'all') {
      const fallbackQuery = `
        SELECT * FROM curriculum_plans 
        WHERE major_name ILIKE $1 
        ORDER BY semester_index DESC, id ASC 
        LIMIT 10
      `;
      const fallbackRes = await pool.query(fallbackQuery, [`%${major.trim()}%`]);
      result = fallbackRes;
    }

    res.json({ success: true, total: result.rows.length, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 3. ROUTE UPLOAD & BÓC TÁCH FILE EXCEL KẾ HOẠCH ĐÀO TẠO (.xlsx, .xls)
// =============================================================================
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel!' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    let majorCode = '7480104';
    let majorName = 'Hệ Thống Thông Tin';
    let cohort = 'K25';
    let className = 'HTTT2511';
    let currentYear = '2025-2026';
    let currentSemIdx = 1;
    let currentSemName = 'Học kỳ 1';

    // Bóc tách thông tin tiêu đề từ 10 dòng đầu
    for (let r = 0; r < Math.min(10, rawData.length); r++) {
      const line = String(rawData[r]?.[0] || '');
      if (line.includes('Mã ngành:') || line.includes('Khóa:') || line.includes('Mã lớp:')) {
        const matchCode = line.match(/Mã ngành:\s*([\d\w]+)/);
        const matchCohort = line.match(/Khóa:\s*([\d\w]+)/);
        const matchClass = line.match(/Mã lớp:\s*([\d\w]+)/);
        if (matchCode) majorCode = matchCode[1];
        if (matchCohort) {
          const cVal = matchCohort[1];
          cohort = cVal.startsWith('K') ? cVal : `K${cVal.slice(-2)}`;
        }
        if (matchClass) className = matchClass[1];
      }
      if (line.includes('NGÀNH ĐÀO TẠO:')) {
        const cleanName = line.replace('NGÀNH ĐÀO TẠO:', '').trim();
        if (cleanName) majorName = cleanName;
      }
    }

    // Xóa dữ liệu cũ của lớp trước khi nạp đè dữ liệu mới
    await pool.query('DELETE FROM curriculum_plans WHERE class_name = $1', [className]);

    const parsedSubjects = [];
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] || '').trim();
      const col1 = String(row[1] || '').trim(); // Mã HP
      const col2 = String(row[2] || '').trim(); // Tên HP

      if (col0.toUpperCase().includes('HỌC KỲ') && col0.toUpperCase().includes('NĂM HỌC')) {
        const m = col0.match(/\d{4}-\d{4}/);
        if (m) currentYear = m[0];
      } else if (col0.startsWith('Học kỳ')) {
        currentSemName = col0;
        const m = col0.match(/\d+/);
        if (m) currentSemIdx = parseInt(m[0]);
      } else if (col1 && col1 !== 'Mã HP' && col2 && col2 !== 'Tên HP' && !col2.startsWith('Tổng') && col1.length >= 4) {
        const struct = String(row[3] || '3(3,0,0)').trim();
        const mandatoryCredit = row[4];
        const electiveCredit = row[5];
        const isElective = electiveCredit && !mandatoryCredit;
        const credits = parseInt(mandatoryCredit || electiveCredit || 3);
        const prereq = String(row[6] || '').trim();

        parsedSubjects.push({
          majorCode,
          majorName,
          cohort,
          className,
          academicYear: currentYear,
          semesterIndex: currentSemIdx,
          semesterName: currentSemName,
          subjectCode: col1,
          subjectName: col2,
          creditsStructure: struct,
          credits,
          subjectType: isElective ? 'elective' : 'mandatory',
          prerequisite: prereq,
        });
      }
    }

    // Lưu hàng loạt môn học vào PostgreSQL
    for (const s of parsedSubjects) {
      await pool.query(`
        INSERT INTO curriculum_plans 
        (major_code, major_name, cohort, class_name, academic_year, semester_index, semester_name, 
         subject_code, subject_name, credits_structure, credits, subject_type, prerequisite)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (class_name, semester_index, subject_code) DO NOTHING
      `, [
        s.majorCode, s.majorName, s.cohort, s.className, s.academicYear,
        s.semesterIndex, s.semesterName, s.subjectCode, s.subjectName,
        s.creditsStructure, s.credits, s.subjectType, s.prerequisite
      ]);
    }

    res.json({
      success: true,
      message: `Đã nạp thành công ${parsedSubjects.length} học phần của lớp ${className} (${majorName} - ${cohort})!`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi nạp file: ' + err.message });
  }
});

// =============================================================================
// 4. ROUTE THÊM MỚI HỌC PHẦN THỦ CÔNG
// =============================================================================
router.post('/subject', async (req, res) => {
  try {
    const {
      major_code,
      major_name,
      cohort,
      class_name,
      academic_year,
      semester_index,
      semester_name,
      subject_code,
      subject_name,
      credits_structure,
      credits,
      subject_type,
      prerequisite,
    } = req.body;

    if (!subject_code || !subject_name) {
      return res.status(400).json({ success: false, message: 'Mã và tên học phần là bắt buộc!' });
    }

    const result = await pool.query(
      `INSERT INTO curriculum_plans 
       (major_code, major_name, cohort, class_name, academic_year, semester_index, semester_name, 
        subject_code, subject_name, credits_structure, credits, subject_type, prerequisite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (class_name, semester_index, subject_code) 
       DO UPDATE SET 
          subject_name = EXCLUDED.subject_name,
          credits_structure = EXCLUDED.credits_structure,
          credits = EXCLUDED.credits,
          subject_type = EXCLUDED.subject_type,
          prerequisite = EXCLUDED.prerequisite
       RETURNING *`,
      [
        major_code || '7480104',
        major_name || 'Hệ Thống Thông Tin',
        cohort || 'K25',
        class_name || 'HTTT2511',
        academic_year || '2025-2026',
        parseInt(semester_index) || 1,
        semester_name || `Học kỳ ${semester_index || 1}`,
        subject_code.trim(),
        subject_name.trim(),
        credits_structure?.trim() || '3(3,0,0)',
        Number(credits) || 3,
        subject_type || 'mandatory',
        prerequisite?.trim() || null,
      ]
    );

    res.json({ success: true, message: 'Đã thêm học phần thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 5. ROUTE CẬP NHẬT THÔNG TIN HỌC PHẦN
// =============================================================================
router.put('/subject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      subject_code,
      subject_name,
      credits_structure,
      credits,
      subject_type,
      prerequisite,
    } = req.body;

    const result = await pool.query(
      `UPDATE curriculum_plans 
       SET subject_code = $1, 
           subject_name = $2, 
           credits_structure = $3, 
           credits = $4, 
           subject_type = $5, 
           prerequisite = $6
       WHERE id = $7 
       RETURNING *`,
      [
        subject_code?.trim(),
        subject_name?.trim(),
        credits_structure?.trim(),
        Number(credits) || 3,
        subject_type || 'mandatory',
        prerequisite?.trim() || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học phần để cập nhật!' });
    }

    res.json({ success: true, message: 'Cập nhật học phần thành công!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 6. ROUTE XÓA HỌC PHẦN KHỎI KHUNG KẾ HOẠCH
// =============================================================================
router.delete('/subject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM curriculum_plans WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học phần để xóa!' });
    }

    res.json({ success: true, message: 'Đã xóa học phần khỏi kế hoạch đào tạo!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;