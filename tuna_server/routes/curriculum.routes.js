// routes/curriculum.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

// routes/curriculum.routes.js

// =============================================================================
// 1. ROUTE LẤY DANH MỤC NGÀNH, KHÓA, LỚP ĐỘNG TỪ BẢNG FACULTY_MAJORS & CSDL
// =============================================================================
router.get('/meta-options', async (req, res) => {
  try {
    const [majorsRes, majorCohortsRes, cohortsRes, classesRes] = await Promise.all([
      // Lấy danh sách ngành
      pool.query(`
        SELECT DISTINCT major_name 
        FROM faculty_majors 
        WHERE major_name IS NOT NULL AND major_name <> ''
        ORDER BY major_name ASC
      `).catch(() => ({ rows: [] })),

      // 👉 ĐỌC TRỰC TIẾP KHÓA TỪ NGÀNH BẠN VỪA CẤU HÌNH
      pool.query(`
        SELECT DISTINCT applied_cohort 
        FROM faculty_majors 
        WHERE applied_cohort IS NOT NULL AND applied_cohort <> '' AND UPPER(applied_cohort) <> 'ALL'
      `).catch(() => ({ rows: [] })),

      // Đọc thêm từ academic_cohorts
      pool.query(`
        SELECT DISTINCT cohort_code 
        FROM academic_cohorts 
        WHERE cohort_code IS NOT NULL AND cohort_code <> ''
        ORDER BY cohort_code DESC
      `).catch(() => ({ rows: [] })),

      // Lấy danh sách lớp
      pool.query(`
        SELECT DISTINCT class_name 
        FROM curriculum_plans 
        WHERE class_name IS NOT NULL AND class_name <> '' 
        ORDER BY class_name ASC
      `).catch(() => ({ rows: [] }))
    ]);

    const majors = majorsRes.rows.map(r => r.major_name);

    // Gộp tất cả khóa thực tế từ faculty_majors và academic_cohorts
    const rawCohorts = [
      ...majorCohortsRes.rows.map(r => r.applied_cohort),
      ...cohortsRes.rows.map(r => r.cohort_code)
    ];

    // Lọc trùng lặp và loại bỏ giá trị rỗng
    const uniqueCohorts = Array.from(new Set(rawCohorts.filter(Boolean)));

    res.json({
      success: true,
      data: {
        majors: majors.length > 0 ? majors : ['Hệ Thống Thông Tin'],
        cohorts: uniqueCohorts.length > 0 ? uniqueCohorts : ['K23'],
        classes: classesRes.rows.map(r => r.class_name)
      }
    });
  } catch (error) {
    console.error("Lỗi truy vấn meta-options:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
      data: { majors: [], cohorts: [], classes: [] }
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

    if (className && className !== 'all') {
      params.push(className.trim());
      query += ` AND class_name = $${params.length}`;
    } else if (major && major !== 'all') {
      params.push(`%${major.trim()}%`);
      query += ` AND major_name ILIKE $${params.length}`;
    }

    if (cohort && cohort !== 'all') {
      const cleanCohort = cohort.replace(/[^0-9]/g, '');
      params.push(`%${cleanCohort}%`);
      query += ` AND (cohort ILIKE $${params.length} OR cohort ILIKE '20' || $${params.length} OR cohort IS NULL)`;
    }

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

    await pool.query('DELETE FROM curriculum_plans WHERE class_name = $1', [className]);

    const parsedSubjects = [];
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] || '').trim();
      const col1 = String(row[1] || '').trim();
      const col2 = String(row[2] || '').trim();

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

    for (const s of parsedSubjects) {
      await pool.query(`
        INSERT INTO curriculum_plans 
        (major_code, major_name, cohort, class_name, academic_year, semester_index, semester_name, 
         subject_code, subject_name, credits_structure, credits, subject_type, prerequisite)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT ON CONSTRAINT unique_curriculum_record DO NOTHING
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
// 4. ROUTE THÊM MỚI HỌC PHẦN THỦ CÔNG (100% DỮ LIỆU ĐỘNG TỪ CLIENT & CSDL)
// =============================================================================
router.post('/subject', async (req, res) => {
  try {
    const {
      major_name,
      cohort,
      class_name,
      semester_index,
      semester_name,
      subject_code,
      subject_name,
      credits_structure,
      credits,
      subject_type,
      prerequisite,
    } = req.body;

    // 1. Kiểm tra các trường bắt buộc
    if (!subject_code?.trim() || !subject_name?.trim()) {
      return res.status(400).json({ success: false, message: 'Mã và tên học phần là bắt buộc!' });
    }
    if (!major_name?.trim() || !cohort?.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn đầy đủ Ngành đào tạo và Khóa học!' });
    }

    const semIdx = parseInt(semester_index, 10);
    if (isNaN(semIdx) || semIdx < 1 || semIdx > 15) {
      return res.status(400).json({ success: false, message: 'Học kỳ không hợp lệ (1 - 15)!' });
    }

    // 2. Tự động lấy major_code từ bảng faculty_majors theo major_name
    const majorRes = await pool.query(
      `SELECT major_code FROM faculty_majors WHERE major_name = $1 LIMIT 1`,
      [major_name.trim()]
    );
    const resolvedMajorCode = majorRes.rows[0]?.major_code || major_name.trim();

    // 3. Tự động tính academic_year động từ năm tuyển sinh của khóa trong academic_cohorts
    const cohortRes = await pool.query(
      `SELECT admission_year FROM academic_cohorts WHERE cohort_code = $1 LIMIT 1`,
      [cohort.trim()]
    );

    let calculatedAcademicYear = req.body.academic_year?.trim();
    if (!calculatedAcademicYear) {
      const admissionYear = cohortRes.rows[0]?.admission_year || parseInt(cohort.replace(/\D/g, ''), 10) + 2000;
      // Mô hình 3 HK/năm: tính năm học tương ứng
      const yearOffset = Math.floor((semIdx - 1) / 3);
      const startYear = admissionYear ? admissionYear + yearOffset : new Date().getFullYear();
      calculatedAcademicYear = `${startYear}-${startYear + 1}`;
    }

    // 4. Chuẩn hóa dữ liệu đầu vào
    const cleanCredits = Number(credits);
    if (isNaN(cleanCredits) || cleanCredits <= 0) {
      return res.status(400).json({ success: false, message: 'Số tín chỉ phải lớn hơn 0!' });
    }

    const finalClassName = class_name && class_name !== 'all' ? class_name.trim() : null;
    const finalSemName = semester_name?.trim() || `Học kỳ ${semIdx}`;
    const finalStructure = credits_structure?.trim() || `${cleanCredits}(${cleanCredits},0,0)`;
    const finalType = subject_type === 'elective' ? 'elective' : 'mandatory';
    const finalPrereq = prerequisite?.trim() || null;

    // 5. Thao tác chèn vào CSDL
    const result = await pool.query(
      `INSERT INTO curriculum_plans 
       (major_code, major_name, cohort, class_name, academic_year, semester_index, semester_name, 
        subject_code, subject_name, credits_structure, credits, subject_type, prerequisite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT ON CONSTRAINT unique_curriculum_record
       DO UPDATE SET 
          subject_name = EXCLUDED.subject_name,
          credits_structure = EXCLUDED.credits_structure,
          credits = EXCLUDED.credits,
          subject_type = EXCLUDED.subject_type,
          prerequisite = EXCLUDED.prerequisite,
          academic_year = EXCLUDED.academic_year
       RETURNING *`,
      [
        resolvedMajorCode,
        major_name.trim(),
        cohort.trim(),
        finalClassName,
        calculatedAcademicYear,
        semIdx,
        finalSemName,
        subject_code.trim(),
        subject_name.trim(),
        finalStructure,
        cleanCredits,
        finalType,
        finalPrereq,
      ]
    );

    res.json({ 
      success: true, 
      message: 'Đã lưu học phần thành công!', 
      data: result.rows[0] 
    });
  } catch (error) {
    console.error('Lỗi thêm học phần:', error);
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