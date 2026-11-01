// routes/curriculum.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

// =============================================================================
// 1. ROUTE LẤY DANH MỤC NGÀNH, KHÓA, LỚP (GOM NHÓM CHUẨN XÁC)
// =============================================================================
router.get('/meta-options', async (req, res) => {
  try {
    const [majorsRes, classesRes] = await Promise.all([
      // Chỉ đọc từ bảng quản lý ngành, lấy luôn số kỳ/năm
      pool.query(`
        SELECT major_name, major_code, applied_cohort, COALESCE(semesters_per_year, 3) AS semesters_per_year
        FROM faculty_majors 
        WHERE major_name IS NOT NULL AND major_name <> ''
        ORDER BY major_name ASC
      `),
      pool.query(`
        SELECT DISTINCT class_name 
        FROM curriculum_plans 
        WHERE class_name IS NOT NULL AND class_name <> '' 
        ORDER BY class_name ASC
      `)
    ]);

    // Gom nhóm khóa và cấu hình theo từng ngành
    const majorMap = {};
    majorsRes.rows.forEach(r => {
      const mName = r.major_name.trim();
      const mCode = r.major_code;
      const cName = r.applied_cohort ? r.applied_cohort.trim() : null;
      
      if (!majorMap[mName]) {
        majorMap[mName] = {
          code: mCode,
          semestersPerYear: r.semesters_per_year,
          cohorts: []
        };
      }
      
      if (cName && cName.toUpperCase() !== 'ALL' && !majorMap[mName].cohorts.includes(cName)) {
        majorMap[mName].cohorts.push(cName);
      }
    });

    const classes = classesRes.rows.map(r => r.class_name);

    res.json({
      success: true,
      data: {
        majorMap,
        classes
      }
    });
  } catch (error) {
    console.error("Lỗi truy vấn meta-options:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 2. ROUTE LẤY DANH SÁCH HỌC PHẦN (KHÔNG LẤY FALLBACK RÁC)
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
      // Bóc tách 2 số cuối để tìm đúng khóa
      const shortCohort = cohort.replace(/[^0-9]/g, '').slice(-2);
      if (shortCohort) {
        params.push(`%${shortCohort}%`);
        query += ` AND cohort ILIKE $${params.length}`;
      }
    }

    // Lọc theo target_semester_index
    let targetSemIndex = null;
    if (year && semester && semester !== 'all') {
      // Truy vấn số kỳ/năm của ngành đang chọn để tính đúng Index
      let spY = 3;
      if (major && major !== 'all') {
        const checkMajor = await pool.query(`SELECT COALESCE(semesters_per_year, 3) as spy FROM faculty_majors WHERE major_name = $1 LIMIT 1`, [major]);
        if (checkMajor.rows.length > 0) spY = checkMajor.rows[0].spy;
      }
      targetSemIndex = (parseInt(year) - 1) * spY + parseInt(semester);
    } else if (semester && semester !== 'all') {
      targetSemIndex = parseInt(semester);
    }

    if (targetSemIndex !== null && !isNaN(targetSemIndex)) {
      params.push(targetSemIndex);
      query += ` AND semester_index = $${params.length}`;
    }

    query += ` ORDER BY semester_index ASC, id ASC`;
    const result = await pool.query(query, params);

    res.json({ success: true, total: result.rows.length, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// 3. ROUTE UPLOAD EXCEL (ÉP BUỘC DỮ LIỆU TỪ GIAO DIỆN CHUẨN XÁC)
// =============================================================================
router.post('/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file Excel!' });

    const { target_major, target_cohort, target_class } = req.body;
    if (!target_major || !target_cohort) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin Ngành hoặc Khóa tuyển sinh!' });
    }

    // Lấy thông tin chuẩn từ CSDL theo tên ngành
    const majorCheck = await pool.query(
      `SELECT major_code, COALESCE(semesters_per_year, 3) as spy FROM faculty_majors WHERE major_name = $1 LIMIT 1`,
      [target_major.trim()]
    );
    if (majorCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: `Ngành "${target_major}" chưa tồn tại trong Quản Lý Ngành!` });
    }
    
    const majorCode = majorCheck.rows[0].major_code;
    const className = target_class && target_class !== 'all' ? target_class.trim() : 'Chưa xếp lớp';

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    // Xóa dữ liệu cũ của Lớp/Khóa này trước khi nạp mới đè lên
    if (className !== 'Chưa xếp lớp') {
       await pool.query('DELETE FROM curriculum_plans WHERE class_name = $1', [className]);
    }

    let currentYear = '2025-2026';
    let currentSemIdx = 1;
    let currentSemName = 'Học kỳ 1';
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
          majorCode: majorCode,
          majorName: target_major.trim(),
          cohort: target_cohort.trim(),
          className: className,
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
      message: `Đã nạp thành công ${parsedSubjects.length} học phần cho ${target_major} - ${target_cohort}!`,
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

    if (!subject_code?.trim() || !subject_name?.trim()) return res.status(400).json({ success: false, message: 'Mã và tên học phần là bắt buộc!' });
    if (!major_name?.trim() || !cohort?.trim()) return res.status(400).json({ success: false, message: 'Vui lòng chọn đầy đủ Ngành và Khóa học!' });

    const semIdx = parseInt(semester_index, 10);
    if (isNaN(semIdx) || semIdx < 1 || semIdx > 16) return res.status(400).json({ success: false, message: 'Học kỳ không hợp lệ!' });

    const majorRes = await pool.query(
      `SELECT major_code, COALESCE(semesters_per_year, 3) as spy FROM faculty_majors WHERE major_name = $1 LIMIT 1`,
      [major_name.trim()]
    );
    const resolvedMajorCode = majorRes.rows[0]?.major_code || major_name.trim();
    const semestersPerYear = majorRes.rows[0]?.spy || 3;

    const cohortRes = await pool.query(
      `SELECT admission_year FROM academic_cohorts WHERE cohort_code = $1 LIMIT 1`,
      [cohort.trim()]
    );

    let calculatedAcademicYear = req.body.academic_year?.trim();
    if (!calculatedAcademicYear) {
      const admissionYear = cohortRes.rows[0]?.admission_year || parseInt(cohort.replace(/\D/g, ''), 10) + 2000;
      const yearOffset = Math.floor((semIdx - 1) / semestersPerYear);
      const startYear = admissionYear ? admissionYear + yearOffset : new Date().getFullYear();
      calculatedAcademicYear = `${startYear}-${startYear + 1}`;
    }

    const cleanCredits = Number(credits);
    const finalClassName = class_name && class_name !== 'all' ? class_name.trim() : null;
    const finalSemName = semester_name?.trim() || `Học kỳ ${semIdx}`;
    const finalStructure = credits_structure?.trim() || `${cleanCredits}(${cleanCredits},0,0)`;

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
        subject_type,
        prerequisite?.trim() || null,
      ]
    );

    res.json({ success: true, message: 'Đã lưu học phần thành công!', data: result.rows[0] });
  } catch (error) {
    console.error('Lỗi thêm học phần:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cập nhật và Xóa giữ nguyên logic cũ.
router.put('/subject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { subject_code, subject_name, credits_structure, credits, subject_type, prerequisite } = req.body;
    const result = await pool.query(
      `UPDATE curriculum_plans SET subject_code=$1, subject_name=$2, credits_structure=$3, credits=$4, subject_type=$5, prerequisite=$6 WHERE id=$7 RETURNING *`,
      [subject_code?.trim(), subject_name?.trim(), credits_structure?.trim(), Number(credits)||3, subject_type||'mandatory', prerequisite?.trim()||null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy học phần!' });
    res.json({ success: true, message: 'Cập nhật học phần thành công!', data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

router.delete('/subject/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM curriculum_plans WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy học phần!' });
    res.json({ success: true, message: 'Đã xóa học phần!' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

module.exports = router;